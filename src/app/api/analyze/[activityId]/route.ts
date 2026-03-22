import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
  getGarminActivityByGarminId,
  getGarminWorkouts,
  createInsight,
} from "@/lib/db/queries";
import { generateAutoInsight } from "@/lib/analysis/engine";
import { buildPlanContext } from "@/lib/analysis/plan-context";
import type { PlanContext, ActualContext, ExerciseSetData } from "@/lib/core/types";

/**
 * POST /api/analyze/[activityId]
 *
 * Generates auto-insights for a specific Garmin activity by comparing
 * it against its matched workout plan.
 *
 * activityId is the Garmin activity ID (not the DB id).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const session = await getServerSession();
  if (!session.isLoggedIn) {
    return NextResponse.json(
      { error: "You must be logged in." },
      { status: 401 },
    );
  }

  const { activityId } = await params;

  // Look up the activity
  const activity = await getGarminActivityByGarminId(activityId);
  if (!activity) {
    return NextResponse.json(
      { error: "Activity not found." },
      { status: 404 },
    );
  }

  // Verify the activity belongs to the user
  if (activity.userId !== session.userId) {
    return NextResponse.json(
      { error: "Activity not found." },
      { status: 404 },
    );
  }

  // Build ActualContext from raw data
  let exerciseSets: ExerciseSetData[] = [];
  let totalReps: number | null = null;
  if (activity.rawData) {
    try {
      const raw = JSON.parse(activity.rawData);
      exerciseSets = raw.exerciseSets ?? [];
      totalReps = raw.totalReps ?? null;
    } catch {
      // Malformed raw data — proceed with empty sets
    }
  }

  const actual: ActualContext = {
    activityName: activity.activityName ?? "Unknown Activity",
    duration: activity.durationSeconds ?? 0,
    totalReps,
    exerciseSets,
  };

  // Build PlanContext from matched workout
  let plan: PlanContext;
  if (activity.matchedWorkoutId) {
    const workouts = await getGarminWorkouts(session.userId);
    const matched = workouts.find((w) => w.id === activity.matchedWorkoutId);
    plan = matched
      ? buildPlanContext(matched)
      : { workoutName: activity.activityName ?? "Workout", exercises: [] };
  } else {
    plan = {
      workoutName: activity.activityName ?? "Workout",
      exercises: [],
    };
  }

  const result = await generateAutoInsight(plan, actual);

  // Save each insight to DB
  const savedIds: string[] = [];
  for (const insight of result.insights) {
    try {
      const { id } = await createInsight(
        session.userId,
        activity.id,
        "auto",
        insight.message,
        JSON.stringify(plan),
        JSON.stringify(actual),
      );
      savedIds.push(id);
    } catch (err) {
      console.error("Failed to save insight:", err);
    }
  }

  return NextResponse.json({
    activityId,
    insights: result.insights,
    savedCount: savedIds.length,
  });
}
