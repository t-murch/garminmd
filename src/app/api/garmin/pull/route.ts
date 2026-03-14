import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import {
  getGarminConnection,
  getGarminWorkouts,
  updateActivityMatch,
  upsertGarminConnection,
  createInsight,
} from "@/lib/db/queries";
import { createGarminClient, GarminServiceError } from "@/lib/garmin/client";
import { pullActivities } from "@/lib/garmin/activities";
import { matchActivitiesToWorkouts } from "@/lib/analysis/matcher";
import { generateAutoInsight } from "@/lib/analysis/engine";
import type { IGarminTokens } from "@flow-js/garmin-connect";
import type { PlanContext, ActualContext, ExerciseSetData } from "@/lib/core/types";

/**
 * POST /api/garmin/pull
 *
 * Pulls recent activities from Garmin Connect, stores them in the DB,
 * and matches new activities to existing workout plans.
 *
 * Flow:
 *   1. Validate session + Garmin connection
 *   2. Create authenticated Garmin client (reusing stored session tokens)
 *   3. Pull activities via pullActivities()
 *   4. Match new activities to stored workouts
 *   5. Update matched activities in DB
 *   6. Return pull + match summary
 */
export async function POST() {
  // Verify the user is logged in
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    return NextResponse.json(
      { error: "You must be logged in." },
      { status: 401 },
    );
  }

  // Get and verify Garmin connection
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
      // Corrupted session data — will fall back to fresh login
    }
  }

  // Create authenticated Garmin client
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

  // Match new activities to workouts
  const newActivities = pullResult.activities.filter((a) => a.isNew);
  let matchedCount = 0;
  let insightsGenerated = 0;

  if (newActivities.length > 0) {
    // Get user's workouts from DB
    const workouts = await getGarminWorkouts(session.userId);

    // Map to matchable format
    const matchableActivities = newActivities.map((a) => {
      // We need the DB record to get the id and startTime.
      // pullActivities already upserted them, so we use garminActivityId
      // as the id for matching, then look up the DB id for updating.
      return {
        id: a.garminActivityId,
        activityName: a.activityName,
        startTime: null as number | null, // We'll enhance this below
      };
    });

    const matchableWorkouts = workouts.map((w) => ({
      id: w.id,
      workoutName: w.workoutName,
      lastPushedAt: w.lastPushedAt,
    }));

    const matches = matchActivitiesToWorkouts(
      matchableActivities,
      matchableWorkouts,
    );

    // Update matched activities in DB
    // We need to look up DB ids by garmin activity id
    const { getGarminActivityByGarminId } = await import(
      "@/lib/db/queries"
    );

    for (const [garminActivityId, match] of matches) {
      const dbActivity = await getGarminActivityByGarminId(garminActivityId);
      if (dbActivity) {
        await updateActivityMatch(dbActivity.id, match.workoutId);
        matchedCount++;
      }
    }

    // Generate auto-insights for newly matched activities
    for (const [garminActivityId, match] of matches) {
      try {
        const dbActivity = await getGarminActivityByGarminId(garminActivityId);
        if (!dbActivity) continue;

        // Build ActualContext from activity raw data
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

        const actual: ActualContext = {
          activityName: dbActivity.activityName ?? "Unknown Activity",
          duration: dbActivity.durationSeconds ?? 0,
          totalReps,
          exerciseSets,
        };

        const plan: PlanContext = {
          workoutName: match.workoutName,
          exercises: [],
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
        // Insight generation failure should not fail the pull
        console.error(
          `Failed to generate auto-insight for activity ${garminActivityId}:`,
          err,
        );
      }
    }
  }

  // Update stored session tokens (they may have been refreshed)
  try {
    const freshTokens = garminClient.getSessionTokens();
    upsertGarminConnection(
      session.userId,
      garminConn.garminEmail,
      encrypt(JSON.stringify(freshTokens)),
    );
  } catch {
    // Non-critical — tokens will be refreshed on next request
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
