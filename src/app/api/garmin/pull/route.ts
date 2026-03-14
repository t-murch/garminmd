import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import {
  getGarminConnection,
  getGarminWorkouts,
  getGarminActivityByGarminId,
  updateActivityMatch,
  upsertGarminConnection,
  createInsight,
} from "@/lib/db/queries";
import { createGarminClient, GarminServiceError } from "@/lib/garmin/client";
import { pullActivities } from "@/lib/garmin/activities";
import { matchActivitiesToWorkouts } from "@/lib/analysis/matcher";
import { generateAutoInsight } from "@/lib/analysis/engine";
import type { IGarminTokens } from "@flow-js/garmin-connect";
import type {
  PlanContext,
  ActualContext,
  ExerciseSetData,
} from "@/lib/core/types";

/**
 * POST /api/garmin/pull
 *
 * Pulls recent activities from Garmin Connect, stores them in the DB,
 * matches new activities to workout plans, and generates auto-insights.
 */
export async function POST() {
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    return NextResponse.json(
      { error: "You must be logged in." },
      { status: 401 },
    );
  }

  const garminConn = await getGarminConnection(session.userId);
  if (!garminConn) {
    return NextResponse.json(
      { error: "Garmin is not connected. Connect your account first." },
      { status: 400 },
    );
  }

  // Decrypt credentials and session tokens
  const email = decrypt(garminConn.garminEmail);
  let existingTokens: IGarminTokens | undefined;
  if (garminConn.garminSession) {
    try {
      existingTokens = JSON.parse(
        decrypt(garminConn.garminSession),
      ) as IGarminTokens;
    } catch {
      // Corrupted session data — will require re-auth
    }
  }

  // If no valid session tokens, user must re-authenticate
  if (!existingTokens) {
    return NextResponse.json(
      {
        error:
          "Garmin session expired. Please reconnect your Garmin account in Settings.",
      },
      { status: 401 },
    );
  }

  // Create authenticated Garmin client using stored tokens only
  let garminClient;
  try {
    garminClient = await createGarminClient(email, "", existingTokens);
  } catch (err) {
    if (err instanceof GarminServiceError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      {
        error:
          "Garmin session expired. Please reconnect your Garmin account in Settings.",
      },
      { status: 401 },
    );
  }

  // Pull activities from Garmin
  let pullResult;
  try {
    pullResult = await pullActivities(session.userId, garminClient);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to pull activities from Garmin: ${message}` },
      { status: 502 },
    );
  }

  // Match new activities to workouts and generate insights in a single pass
  const newActivities = pullResult.activities.filter((a) => a.isNew);
  let matchedCount = 0;
  let insightsGenerated = 0;

  if (newActivities.length > 0) {
    const workouts = await getGarminWorkouts(session.userId);

    // Look up DB records for new activities to get startTime
    const dbActivities = await Promise.all(
      newActivities.map((a) => getGarminActivityByGarminId(a.garminActivityId)),
    );

    const matchableActivities = newActivities.map((a, i) => ({
      id: a.garminActivityId,
      activityName: a.activityName,
      startTime: dbActivities[i]?.startTime ?? null,
    }));

    const matchableWorkouts = workouts.map((w) => ({
      id: w.id,
      workoutName: w.workoutName,
      lastPushedAt: w.lastPushedAt,
    }));

    const matches = matchActivitiesToWorkouts(
      matchableActivities,
      matchableWorkouts,
    );

    // Single pass: update match + generate insight for each matched activity
    for (const [garminActivityId, match] of matches) {
      const idx = newActivities.findIndex(
        (a) => a.garminActivityId === garminActivityId,
      );
      const dbActivity = idx >= 0 ? dbActivities[idx] : null;
      if (!dbActivity) continue;

      // Update the match in DB
      await updateActivityMatch(dbActivity.id, match.workoutId);
      matchedCount++;

      // Generate auto-insight (non-critical — failure doesn't fail the pull)
      try {
        const actual = buildActualContext(dbActivity);
        const plan: PlanContext = {
          workoutName: match.workoutName,
          exercises: [], // TODO: Store resolved plan data for richer insights
        };

        const result = await generateAutoInsight(plan, actual);

        for (const insight of result.insights) {
          await createInsight(
            session.userId,
            dbActivity.id,
            "auto",
            insight.message,
            JSON.stringify(plan),
            JSON.stringify(actual),
          );
          insightsGenerated++;
        }
      } catch (err) {
        console.error(
          `Failed to generate auto-insight for activity ${garminActivityId}:`,
          err,
        );
      }
    }
  }

  // Update stored session tokens (best-effort)
  try {
    const freshTokens = garminClient.getSessionTokens();
    await upsertGarminConnection(
      session.userId,
      garminConn.garminEmail,
      encrypt(JSON.stringify(freshTokens)),
    );
  } catch {
    // Non-critical
  }

  return NextResponse.json({
    pulled: pullResult.activities.length,
    newActivities: pullResult.newActivities,
    matched: matchedCount,
    insightsGenerated,
    activities: pullResult.activities.map((a) => ({
      garminActivityId: a.garminActivityId,
      activityName: a.activityName,
      isNew: a.isNew,
    })),
  });
}

/** Build ActualContext from a DB activity record. */
function buildActualContext(dbActivity: {
  activityName: string | null;
  durationSeconds: number | null;
  rawData: string | null;
}): ActualContext {
  let exerciseSets: ExerciseSetData[] = [];
  let totalReps: number | null = null;

  if (dbActivity.rawData) {
    try {
      const raw = JSON.parse(dbActivity.rawData);
      exerciseSets = raw.exerciseSets ?? [];
      totalReps = raw.totalReps ?? null;
    } catch {
      // Malformed raw data — proceed with empty sets
    }
  }

  return {
    activityName: dbActivity.activityName ?? "Unknown Activity",
    duration: dbActivity.durationSeconds ?? 0,
    totalReps,
    exerciseSets,
  };
}
