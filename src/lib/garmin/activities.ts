import type { GarminClient, GarminActivitySummary } from "./client";
import {
  getGarminActivityByGarminId,
  upsertGarminActivity,
} from "@/lib/db/queries";

// ─── Public Types ──────────────────────────────────────────────

export interface PullResult {
  newActivities: number;
  existingActivities: number;
  activities: Array<{
    garminActivityId: string;
    activityName: string;
    isNew: boolean;
  }>;
}

// ─── Pull Logic ────────────────────────────────────────────────

/**
 * Pull recent activities from Garmin Connect and upsert them into the DB.
 *
 * For each activity:
 *   1. Check if it already exists in the DB (by Garmin activity ID).
 *   2. For new strength activities (sportTypeId === 4), attempt to fetch
 *      exercise set details (reps, weight, duration per set).
 *   3. Upsert the activity record with raw data (summary + sets if available).
 *
 * This is idempotent — existing activities are updated with the latest data,
 * and new activities are inserted. The `isNew` flag in the result indicates
 * which activities were seen for the first time.
 */
export async function pullActivities(
  userId: string,
  garminClient: GarminClient,
  options?: { limit?: number },
): Promise<PullResult> {
  const limit = options?.limit ?? 20;
  const activities = await garminClient.getActivities(0, limit);

  let newCount = 0;
  let existingCount = 0;
  const results: PullResult["activities"] = [];

  for (const activity of activities) {
    const garminActivityId = String(activity.activityId);
    const existing = await getGarminActivityByGarminId(garminActivityId);
    const isNew = !existing;

    // For new strength activities, try to get exercise set details
    let rawData: Record<string, unknown> = { ...activity };
    if (isNew && activity.sportTypeId === 4) {
      try {
        const details = await garminClient.getActivityDetails(
          activity.activityId,
        );
        if (details) {
          rawData.exerciseSets = details.exerciseSets;
        }
      } catch {
        // Non-critical — we still have the activity summary
      }
    }

    await upsertGarminActivity(userId, {
      garminActivityId,
      activityType: activity.activityType?.typeKey ?? "unknown",
      activityName: activity.activityName ?? "Untitled",
      startTime: new Date(
        activity.startTimeLocal || activity.startTimeGMT,
      ).getTime(),
      durationSeconds: Math.round(activity.duration),
      rawData: JSON.stringify(rawData),
    });

    if (isNew) newCount++;
    else existingCount++;

    results.push({
      garminActivityId,
      activityName: activity.activityName,
      isNew,
    });
  }

  return {
    newActivities: newCount,
    existingActivities: existingCount,
    activities: results,
  };
}
