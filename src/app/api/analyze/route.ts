import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getRecentActivitiesWithWorkouts, createInsight } from "@/lib/db/queries";
import { generateDeepAnalysis } from "@/lib/analysis/engine";
import { buildPlanContext } from "@/lib/analysis/plan-context";
import type { PlanContext, ActualContext, ExerciseSetData } from "@/lib/core/types";

/**
 * POST /api/analyze
 *
 * Runs a deep LLM analysis across multiple weeks of training data.
 * Compares planned workouts against actual Garmin activities to surface
 * progression trends, muscle balance issues, and recovery patterns.
 *
 * Body: { weeks?: number } (default 4)
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    return NextResponse.json(
      { error: "You must be logged in." },
      { status: 401 },
    );
  }

  let weeks = 4;
  try {
    const body = await request.json();
    if (typeof body.weeks === "number" && body.weeks > 0) {
      weeks = Math.min(body.weeks, 52); // cap at 1 year
    }
  } catch {
    // No body or invalid JSON — use default
  }

  const activitiesWithWorkouts = await getRecentActivitiesWithWorkouts(
    session.userId,
    weeks * 7,
  );

  if (activitiesWithWorkouts.length === 0) {
    return NextResponse.json(
      { error: "No activities found in the selected time range. Sync from Garmin first." },
      { status: 404 },
    );
  }

  // Build plan contexts from matched workouts
  const plans: PlanContext[] = [];
  const actuals: ActualContext[] = [];

  for (const row of activitiesWithWorkouts) {
    const { activity, workout } = row;

    // Build ActualContext from activity raw data
    let exerciseSets: ExerciseSetData[] = [];
    let totalReps: number | null = null;
    if (activity.rawData) {
      try {
        const raw = JSON.parse(activity.rawData);
        exerciseSets = raw.exerciseSets ?? [];
        totalReps = raw.totalReps ?? null;
      } catch {
        // Malformed raw data — skip sets
      }
    }

    actuals.push({
      activityName: activity.activityName ?? "Unknown Activity",
      duration: activity.durationSeconds ?? 0,
      totalReps,
      exerciseSets,
    });

    // Build PlanContext from matched workout (if any)
    if (workout) {
      plans.push(buildPlanContext(workout));
    }
  }

  const result = await generateDeepAnalysis(plans, actuals, weeks);

  // Save the deep analysis as an insight
  try {
    await createInsight(
      session.userId,
      null, // not tied to a single activity
      "deep",
      JSON.stringify(result.sections),
      JSON.stringify(plans),
      JSON.stringify(actuals),
    );
  } catch (err) {
    console.error("Failed to save deep analysis insight:", err);
    // Non-critical — still return the result
  }

  return NextResponse.json(result);
}
