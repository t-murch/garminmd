import type { MatchResult } from "@/lib/core/types";

interface MatchableActivity {
  id: string;
  activityName: string | null;
  startTime: number | null;
}

interface MatchableWorkout {
  id: string;
  workoutName: string;
  lastPushedAt: number | null;
}

/**
 * Match a single activity to the best workout.
 * Priority: exact name > fuzzy name > date proximity.
 */
export function matchActivityToWorkout(
  activity: MatchableActivity,
  workouts: MatchableWorkout[],
): MatchResult | null {
  if (!activity.activityName) return null;

  const activityName = activity.activityName.toLowerCase().trim();

  // Tier 1: Exact name match (case-insensitive)
  for (const w of workouts) {
    if (w.workoutName.toLowerCase().trim() === activityName) {
      return {
        activityId: activity.id,
        workoutId: w.id,
        workoutName: w.workoutName,
        confidence: 1.0,
        matchMethod: "exact-name",
      };
    }
  }

  // Tier 2: Fuzzy name match — substring containment or similarity
  let bestFuzzy: { workout: MatchableWorkout; score: number } | null = null;
  for (const w of workouts) {
    const workoutName = w.workoutName.toLowerCase().trim();
    const score = fuzzyScore(activityName, workoutName);
    if (score > 0.6 && (!bestFuzzy || score > bestFuzzy.score)) {
      bestFuzzy = { workout: w, score };
    }
  }
  if (bestFuzzy) {
    return {
      activityId: activity.id,
      workoutId: bestFuzzy.workout.id,
      workoutName: bestFuzzy.workout.workoutName,
      confidence: bestFuzzy.score,
      matchMethod: "fuzzy-name",
    };
  }

  // Tier 3: Date proximity (±1 day) for strength activities
  if (activity.startTime) {
    const oneDay = 86400000;
    for (const w of workouts) {
      if (
        w.lastPushedAt &&
        Math.abs(activity.startTime - w.lastPushedAt) < oneDay
      ) {
        return {
          activityId: activity.id,
          workoutId: w.id,
          workoutName: w.workoutName,
          confidence: 0.5,
          matchMethod: "date-proximity",
        };
      }
    }
  }

  return null;
}

/**
 * Batch match: match multiple activities to workouts.
 * Prevents double-matching (one workout can only match one activity per day).
 */
export function matchActivitiesToWorkouts(
  activities: MatchableActivity[],
  workouts: MatchableWorkout[],
): Map<string, MatchResult> {
  const results = new Map<string, MatchResult>();
  const usedWorkoutIds = new Set<string>();

  for (const activity of activities) {
    const availableWorkouts = workouts.filter(
      (w) => !usedWorkoutIds.has(w.id),
    );
    const match = matchActivityToWorkout(activity, availableWorkouts);
    if (match) {
      results.set(activity.id, match);
      usedWorkoutIds.add(match.workoutId);
    }
  }

  return results;
}

/**
 * Simple fuzzy scoring: combines substring containment + word overlap.
 * Returns 0-1 score.
 */
export function fuzzyScore(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;

  // Substring containment
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return shorter / longer;
  }

  // Word overlap (Jaccard-like)
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return union > 0 ? intersection / union : 0;
}
