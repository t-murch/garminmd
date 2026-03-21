import type { GarminExerciseType, ResolutionMethod } from "@/lib/core/types";
import type { AppDatabase } from "@/lib/db/index";
import { cacheExercise, getCachedExercise } from "@/lib/db/queries";

/**
 * Tier 2a: Look up a previously resolved exercise from the database cache.
 */
export async function getCachedResolution(
  normalizedName: string,
  db?: AppDatabase,
): Promise<GarminExerciseType | null> {
  const cached = db
    ? await getCachedExercise(normalizedName, db)
    : await getCachedExercise(normalizedName);

  if (!cached) return null;

  return {
    category: cached.garminCategory,
    exerciseName: cached.garminExerciseName,
    categoryId: cached.garminCategoryId,
    exerciseNameId: cached.garminExerciseNameId,
  };
}

/**
 * Save a resolved exercise to the database cache for future lookups.
 */
export async function cacheResolution(
  rawName: string,
  normalizedName: string,
  garminType: GarminExerciseType,
  method: ResolutionMethod,
  db?: AppDatabase,
): Promise<void> {
  const entry = {
    rawName,
    normalizedName,
    garminCategory: garminType.category,
    garminExerciseName: garminType.exerciseName,
    garminCategoryId: garminType.categoryId,
    garminExerciseNameId: garminType.exerciseNameId,
    resolutionMethod: method,
  };

  if (db) {
    await cacheExercise(entry, db);
  } else {
    await cacheExercise(entry);
  }
}
