import { createHash } from "node:crypto";
import type { GarminWorkoutPayload } from "@/lib/core/types";
import type { GarminClient } from "./client";
import {
  getGarminWorkouts,
  upsertGarminWorkout,
} from "@/lib/db/queries";

// ─── Public Types ──────────────────────────────────────────────

export interface SyncResult {
  workoutName: string;
  action: "created" | "updated" | "unchanged";
  garminWorkoutId?: string;
}

// ─── Sync Logic ────────────────────────────────────────────────

/**
 * Sync a list of workout payloads to Garmin Connect.
 *
 * For each workout:
 *   1. Check if a workout with that name already exists in our DB.
 *   2. If the payload hash matches the stored hash, skip ("unchanged").
 *   3. If the hash differs and we have a Garmin workout ID, update it.
 *   4. If no record exists, create a new workout on Garmin.
 *   5. Store the garminWorkoutId and payloadHash in our DB.
 *
 * This makes re-syncing idempotent: unchanged workouts are skipped,
 * modified workouts are updated in place, and new workouts are created.
 */
export async function syncWorkoutsToGarmin(
  userId: string,
  workouts: GarminWorkoutPayload[],
  garminClient: GarminClient,
): Promise<SyncResult[]> {
  const existingWorkouts = await getGarminWorkouts(userId);

  // Index existing workouts by name for O(1) lookup
  const existingByName = new Map(
    existingWorkouts.map((w) => [w.workoutName, w]),
  );

  const results: SyncResult[] = [];

  for (const payload of workouts) {
    const hash = hashPayload(payload);
    const existing = existingByName.get(payload.workoutName);

    if (existing && existing.payloadHash === hash) {
      // Payload hasn't changed — nothing to do
      results.push({
        workoutName: payload.workoutName,
        action: "unchanged",
        garminWorkoutId: existing.garminWorkoutId ?? undefined,
      });
      continue;
    }

    if (existing?.garminWorkoutId) {
      // Workout exists on Garmin but payload changed — update it
      await garminClient.updateWorkout(existing.garminWorkoutId, payload);
      await upsertGarminWorkout(
        userId,
        payload.workoutName,
        existing.garminWorkoutId,
        hash,
      );
      results.push({
        workoutName: payload.workoutName,
        action: "updated",
        garminWorkoutId: existing.garminWorkoutId,
      });
      continue;
    }

    // New workout — create on Garmin
    const garminWorkoutId = await garminClient.pushWorkout(payload);
    await upsertGarminWorkout(userId, payload.workoutName, garminWorkoutId, hash);
    results.push({
      workoutName: payload.workoutName,
      action: "created",
      garminWorkoutId,
    });
  }

  return results;
}

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Compute a SHA-256 hash of the workout payload for change detection.
 * Uses a stable JSON serialization (keys sorted by the runtime, which is
 * deterministic for the same object shape).
 */
export function hashPayload(payload: GarminWorkoutPayload): string {
  const json = JSON.stringify(payload);
  return createHash("sha256").update(json).digest("hex");
}
