import type { PlanContext, ResolvedWorkout } from "@/lib/core/types";

/**
 * Build a PlanContext from a garmin_workouts record.
 *
 * If `resolvedData` is present, parses the JSON to extract exercise details
 * (name, sets, reps, weight, weightUnit). Falls back to a minimal context
 * with just the workout name and empty exercises array.
 */
export function buildPlanContext(workout: {
  workoutName: string;
  resolvedData: string | null;
}): PlanContext {
  if (!workout.resolvedData) {
    return { workoutName: workout.workoutName, exercises: [] };
  }

  try {
    const resolved = JSON.parse(workout.resolvedData) as ResolvedWorkout;
    if (!Array.isArray(resolved?.exercises)) {
      return { workoutName: workout.workoutName, exercises: [] };
    }
    return {
      workoutName: workout.workoutName,
      exercises: resolved.exercises.map((ex) => ({
        name: ex.rawName,
        sets: ex.sets,
        reps: ex.effectiveReps ?? ex.reps ?? null,
        weight: ex.weight ?? null,
        weightUnit: ex.weightUnit ?? null,
      })),
    };
  } catch {
    // Malformed JSON — fall back to minimal context
    return { workoutName: workout.workoutName, exercises: [] };
  }
}
