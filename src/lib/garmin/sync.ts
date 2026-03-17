import { createHash } from "node:crypto";
import type {
  GarminRepeatGroup,
  GarminWorkoutPayload,
  GarminWorkoutStepOrGroup,
} from "@/lib/core/types";
import { getGarminWorkouts, upsertGarminWorkout } from "@/lib/db/queries";
import type { GarminClient } from "./client";

// ─── Public Types ──────────────────────────────────────────────

export interface SyncResult {
  workoutName: string;
  action: "created" | "updated" | "unchanged" | "failed";
  garminWorkoutId?: string;
  error?: string;
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
  resolvedDataMap?: Map<string, string>,
  notionPageId?: string,
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
      results.push({
        workoutName: payload.workoutName,
        action: "unchanged",
        garminWorkoutId: existing.garminWorkoutId ?? undefined,
      });
      continue;
    }

    // Per-workout try/catch so one failure doesn't block the rest
    try {
      if (existing?.garminWorkoutId) {
        const newGarminId = await garminClient.updateWorkout(existing.garminWorkoutId, payload);
        await upsertGarminWorkout(
          userId,
          payload.workoutName,
          newGarminId,
          hash,
          notionPageId!,
          resolvedDataMap?.get(payload.workoutName),
        );
        results.push({
          workoutName: payload.workoutName,
          action: "updated",
          garminWorkoutId: newGarminId,
        });
        continue;
      }

      const garminWorkoutId = await garminClient.pushWorkout(payload);
      await upsertGarminWorkout(
        userId,
        payload.workoutName,
        garminWorkoutId,
        hash,
        notionPageId!,
        resolvedDataMap?.get(payload.workoutName),
      );
      results.push({
        workoutName: payload.workoutName,
        action: "created",
        garminWorkoutId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const steps = payload.workoutSegments[0]?.workoutSteps ?? [];
      const categories = steps
        .flatMap((s) =>
          s.type === "RepeatGroupDTO"
            ? (s as GarminRepeatGroup).workoutSteps
            : [s],
        )
        .filter((s) => "exerciseCategory" in s && s.exerciseCategory)
        .map((s) => {
          const ec = (s as { exerciseCategory: { category: string; exerciseName: string } }).exerciseCategory;
          return `${ec.category}/${ec.exerciseName}`;
        })
        .join(", ");
      console.error(
        `Failed to sync "${payload.workoutName}": ${message}` +
        (categories ? ` | exercises: ${categories}` : ""),
      );

      // Retry without exercise categories — Garmin may reject specific
      // category/exerciseName combos that are invalid or deprecated.
      // Steps become generic with text descriptions instead.
      if (message.includes("Invalid category") || message.includes("BadRequest")) {
        try {
          console.info(`Retrying "${payload.workoutName}" without exercise categories...`);
          const stripped = stripCategories(payload);
          const strippedHash = hashPayload(stripped);
          // Always create fresh — the old workout is already gone from Garmin
          // (deleted during the first attempt's updateWorkout call).
          const gwId = await garminClient.pushWorkout(stripped);
          await upsertGarminWorkout(
            userId,
            stripped.workoutName,
            gwId,
            strippedHash,
            notionPageId!,
            resolvedDataMap?.get(payload.workoutName),
          );
          results.push({
            workoutName: payload.workoutName,
            action: existing?.garminWorkoutId ? "updated" : "created",
            garminWorkoutId: gwId,
          });
          continue;
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          console.error(`Retry also failed for "${payload.workoutName}": ${retryMsg}`);
        }
      }

      results.push({
        workoutName: payload.workoutName,
        action: "failed",
        error: message,
      });
    }
  }

  return results;
}

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Compute a SHA-256 hash of the workout payload for change detection.
 * Uses a stable JSON serialization with recursively sorted keys to ensure
 * identical payloads always produce the same hash regardless of property order.
 */
export function hashPayload(payload: GarminWorkoutPayload): string {
  const json = stableStringify(payload);
  return createHash("sha256").update(json).digest("hex");
}

/** Recursively serialize an object with sorted keys for deterministic output. */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  return `{${sorted
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`,
    )
    .join(",")}}`;
}

/**
 * Return a copy of the payload with all exerciseCategory fields removed.
 * Used as a fallback when Garmin rejects specific category/exerciseName combos.
 * Steps keep their descriptions so the exercise names are still visible on the watch.
 * Handles both flat steps and repeat groups with nested child steps.
 */
function stripCategories(payload: GarminWorkoutPayload): GarminWorkoutPayload {
  return {
    ...payload,
    workoutSegments: payload.workoutSegments.map((seg) => ({
      ...seg,
      workoutSteps: seg.workoutSteps.map(stripStepCategories),
    })),
  };
}

function stripStepCategories(step: GarminWorkoutStepOrGroup): GarminWorkoutStepOrGroup {
  if (step.type === "RepeatGroupDTO") {
    const group = step as GarminRepeatGroup;
    return {
      ...group,
      workoutSteps: group.workoutSteps.map((s) => {
        const { exerciseCategory: _, ...rest } = s;
        return rest;
      }),
    };
  }
  const execStep = step as import("@/lib/core/types").GarminWorkoutStep;
  const { exerciseCategory: _, ...rest } = execStep;
  return rest;
}
