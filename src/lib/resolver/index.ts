import type {
  GarminExerciseType,
  ParsedWorkout,
  ResolutionMethod,
  ResolvedExercise,
  ResolvedWorkout,
} from "@/lib/core/types";
import { lbsToKg } from "@/lib/utils/units";
import { cacheResolution, getCachedResolution } from "./cache";
import { getDictionaryEntries, normalizeName } from "./dictionary";
import { exactMatch } from "./exact-match";
import { llmMatch } from "./llm-match";

const DEFAULT_REPS = 12;
const DEFAULT_REST_SECONDS = 90;

interface ResolveResult {
  garminType: GarminExerciseType;
  method: ResolutionMethod;
  confidence: number;
}

/**
 * Resolve a single exercise name through the 3-tier chain:
 *   1. Exact/normalized match against dictionary
 *   2. Database cache lookup
 *   3. LLM call (result cached if confident)
 *
 * Returns null if the exercise cannot be resolved at any tier.
 */
export async function resolveExercise(
  rawName: string,
): Promise<ResolveResult | null> {
  // Tier 1: Exact match
  const exact = exactMatch(rawName);
  if (exact) {
    return { garminType: exact, method: "exact", confidence: 1.0 };
  }

  // Tier 2: Cache lookup
  const normalized = normalizeName(rawName);
  try {
    const cached = await getCachedResolution(normalized);
    if (cached) {
      return { garminType: cached, method: "cached", confidence: 1.0 };
    }
  } catch (err) {
    console.warn("Exercise cache lookup failed:", err);
  }

  // Tier 3: LLM resolution
  try {
    const llmResult = await llmMatch(rawName, getDictionaryEntries());
    if (llmResult) {
      // Cache the successful LLM result for future lookups
      try {
        await cacheResolution(rawName, normalized, llmResult.garminType, "llm");
      } catch (err) {
        console.warn("Exercise cache write failed:", err);
      }
      return {
        garminType: llmResult.garminType,
        method: "llm",
        confidence: llmResult.confidence,
      };
    }
  } catch (err) {
    console.warn("LLM resolution failed:", err);
  }

  return null;
}

/**
 * Resolve all exercises in a parsed workout.
 *
 * For each exercise:
 * - Resolves the Garmin exercise type via the 3-tier chain
 * - Sets effectiveReps from: exercise reps → section default → config → 12
 * - Sets effectiveRestSeconds from: exercise rest → section default → config → 90
 * - Converts weight to kg if originally in lbs
 */
export async function resolveWorkout(
  parsed: ParsedWorkout,
  config?: {
    defaultReps?: number;
    defaultRestSeconds?: number;
  },
): Promise<ResolvedWorkout> {
  const configReps = config?.defaultReps ?? DEFAULT_REPS;
  const configRest = config?.defaultRestSeconds ?? DEFAULT_REST_SECONDS;

  const resolved: ResolvedExercise[] = [];
  const unresolved: Array<{ rawName: string; reason: string }> = [];

  for (const exercise of parsed.exercises) {
    const result = await resolveExercise(exercise.rawName);

    // Effective reps: exercise → section default → config → 12
    const effectiveReps = exercise.reps ?? parsed.defaultReps ?? configReps;

    // Effective rest: exercise → section default → config → 90
    // This is the 4-tier chain from rest-detector:
    //   1. Explicit Rest column (exercise.restSeconds)
    //   2. Section header (parsed.defaultRestSeconds)
    //   3. User config (config.defaultRestSeconds)
    //   4. Hardcoded default (90s)
    const effectiveRestSeconds =
      exercise.restSeconds ?? parsed.defaultRestSeconds ?? configRest;

    // Convert weight to kg for Garmin API
    let weightKg: number | null = null;
    if (exercise.weight !== null) {
      if (exercise.weightUnit === "lbs") {
        weightKg = lbsToKg(exercise.weight);
      } else if (exercise.weightUnit === "kg") {
        weightKg = exercise.weight;
      } else {
        // Default to lbs if no unit specified
        weightKg = lbsToKg(exercise.weight);
      }
    }

    if (result) {
      resolved.push({
        ...exercise,
        garminType: result.garminType,
        resolutionMethod: result.method,
        confidence: result.confidence,
        weightKg,
        effectiveRestSeconds,
        effectiveReps,
      });
    } else {
      // Include in resolved list with null garminType so ordering is preserved
      resolved.push({
        ...exercise,
        garminType: null,
        resolutionMethod: null,
        confidence: null,
        weightKg,
        effectiveRestSeconds,
        effectiveReps,
      });
      unresolved.push({
        rawName: exercise.rawName,
        reason: "No match found in dictionary, cache, or via LLM",
      });
    }
  }

  return {
    name: parsed.name,
    dayOfWeek: parsed.dayOfWeek,
    sportTypeHint: parsed.sportTypeHint,
    defaultReps: parsed.defaultReps,
    defaultRestSeconds: parsed.defaultRestSeconds,
    progressionRule: parsed.progressionRule,
    exercises: resolved,
    unresolved,
  };
}
