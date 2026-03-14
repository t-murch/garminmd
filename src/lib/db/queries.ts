import { and, desc, eq, gte } from "drizzle-orm";
import { type AppDatabase, getDb } from "./index";
import {
  exerciseCache,
  garminActivities,
  garminConnections,
  garminWorkouts,
  insights,
  notionPages,
  users,
} from "./schema";

// ─── Users ─────────────────────────────────────────────────────

export async function getUserById(userId: string, db: AppDatabase = getDb()) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}

export async function getUserByNotionId(
  notionUserId: string,
  db: AppDatabase = getDb(),
) {
  return db.query.users.findFirst({
    where: eq(users.notionUserId, notionUserId),
  });
}

export async function createUser(
  notionUserId: string,
  encryptedToken: string,
  db: AppDatabase = getDb(),
) {
  const [row] = await db
    .insert(users)
    .values({
      notionUserId,
      notionAccessToken: encryptedToken,
    })
    .returning({ id: users.id });
  return { id: row.id };
}

export async function updateUserToken(
  userId: string,
  encryptedToken: string,
  db: AppDatabase = getDb(),
) {
  await db
    .update(users)
    .set({ notionAccessToken: encryptedToken })
    .where(eq(users.id, userId));
}

// ─── Garmin Connections ────────────────────────────────────────

export async function getGarminConnection(
  userId: string,
  db: AppDatabase = getDb(),
) {
  return db.query.garminConnections.findFirst({
    where: eq(garminConnections.userId, userId),
  });
}

export async function upsertGarminConnection(
  userId: string,
  encryptedEmail: string,
  encryptedSession: string | null,
  db: AppDatabase = getDb(),
) {
  const [row] = await db
    .insert(garminConnections)
    .values({
      userId,
      garminEmail: encryptedEmail,
      garminSession: encryptedSession,
    })
    .onConflictDoUpdate({
      target: garminConnections.userId,
      set: {
        garminEmail: encryptedEmail,
        garminSession: encryptedSession,
        lastSyncAt: Date.now(),
      },
    })
    .returning({ id: garminConnections.id });
  return { id: row.id };
}

// ─── Notion Pages ──────────────────────────────────────────────

export async function getNotionPages(
  userId: string,
  db: AppDatabase = getDb(),
) {
  return db.query.notionPages.findMany({
    where: eq(notionPages.userId, userId),
  });
}

export async function upsertNotionPage(
  userId: string,
  notionPageId: string,
  title: string,
  contentHash: string,
  db: AppDatabase = getDb(),
) {
  const [row] = await db
    .insert(notionPages)
    .values({
      userId,
      notionPageId,
      pageTitle: title,
      contentHash,
      lastParsedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [notionPages.userId, notionPages.notionPageId],
      set: {
        pageTitle: title,
        contentHash,
        lastParsedAt: Date.now(),
      },
    })
    .returning({ id: notionPages.id });
  return { id: row.id };
}

// ─── Garmin Workouts ───────────────────────────────────────────

export async function getGarminWorkouts(
  userId: string,
  db: AppDatabase = getDb(),
) {
  return db.query.garminWorkouts.findMany({
    where: eq(garminWorkouts.userId, userId),
  });
}

export async function upsertGarminWorkout(
  userId: string,
  workoutName: string,
  garminWorkoutId: string | null,
  payloadHash: string,
  db: AppDatabase = getDb(),
) {
  const [row] = await db
    .insert(garminWorkouts)
    .values({
      userId,
      workoutName,
      garminWorkoutId,
      payloadHash,
      lastPushedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [garminWorkouts.userId, garminWorkouts.workoutName],
      set: {
        garminWorkoutId,
        payloadHash,
        lastPushedAt: Date.now(),
      },
    })
    .returning({ id: garminWorkouts.id });
  return { id: row.id };
}

// ─── Exercise Cache ────────────────────────────────────────────

export async function getCachedExercise(
  normalizedName: string,
  db: AppDatabase = getDb(),
) {
  return db.query.exerciseCache.findFirst({
    where: eq(exerciseCache.normalizedName, normalizedName),
  });
}

export async function cacheExercise(
  entry: {
    rawName: string;
    normalizedName: string;
    garminCategory: string;
    garminExerciseName: string;
    garminCategoryId: number;
    garminExerciseNameId: number;
    resolutionMethod: string;
  },
  db: AppDatabase = getDb(),
) {
  const [row] = await db
    .insert(exerciseCache)
    .values(entry)
    .returning({ id: exerciseCache.id });
  return { id: row.id };
}

// ─── Garmin Activities (Phase 2) ──────────────────────────────

export async function upsertGarminActivity(
  userId: string,
  data: {
    garminActivityId: string;
    activityType?: string;
    activityName?: string;
    startTime?: number;
    durationSeconds?: number;
    rawData?: string;
    matchedWorkoutId?: string;
  },
  db: AppDatabase = getDb(),
) {
  const existing = await db.query.garminActivities.findFirst({
    where: eq(garminActivities.garminActivityId, data.garminActivityId),
  });

  if (existing) {
    await db
      .update(garminActivities)
      .set({
        activityType: data.activityType ?? existing.activityType,
        activityName: data.activityName ?? existing.activityName,
        startTime: data.startTime ?? existing.startTime,
        durationSeconds: data.durationSeconds ?? existing.durationSeconds,
        rawData: data.rawData ?? existing.rawData,
        matchedWorkoutId: data.matchedWorkoutId ?? existing.matchedWorkoutId,
        pulledAt: Date.now(),
      })
      .where(eq(garminActivities.id, existing.id));
    return { id: existing.id };
  }

  const id = crypto.randomUUID();
  await db.insert(garminActivities).values({
    id,
    userId,
    garminActivityId: data.garminActivityId,
    activityType: data.activityType ?? null,
    activityName: data.activityName ?? null,
    startTime: data.startTime ?? null,
    durationSeconds: data.durationSeconds ?? null,
    rawData: data.rawData ?? null,
    matchedWorkoutId: data.matchedWorkoutId ?? null,
    pulledAt: Date.now(),
  });
  return { id };
}

export async function getGarminActivities(
  userId: string,
  limit = 20,
  offset = 0,
  db: AppDatabase = getDb(),
) {
  return db.query.garminActivities.findMany({
    where: eq(garminActivities.userId, userId),
    orderBy: desc(garminActivities.startTime),
    limit,
    offset,
  });
}

export async function getGarminActivityByGarminId(
  garminActivityId: string,
  db: AppDatabase = getDb(),
) {
  return db.query.garminActivities.findFirst({
    where: eq(garminActivities.garminActivityId, garminActivityId),
  });
}

export async function updateActivityMatch(
  activityDbId: string,
  matchedWorkoutId: string,
  db: AppDatabase = getDb(),
) {
  await db
    .update(garminActivities)
    .set({ matchedWorkoutId })
    .where(eq(garminActivities.id, activityDbId));
}

// ─── Insights (Phase 2) ──────────────────────────────────────

export async function createInsight(
  userId: string,
  activityId: string | null,
  insightType: string,
  content: string,
  planContext?: string,
  actualContext?: string,
  db: AppDatabase = getDb(),
) {
  const id = crypto.randomUUID();
  await db.insert(insights).values({
    id,
    userId,
    activityId,
    insightType,
    content,
    planContext: planContext ?? null,
    actualContext: actualContext ?? null,
  });
  return { id };
}

export async function getInsights(
  userId: string,
  limit = 10,
  db: AppDatabase = getDb(),
) {
  return db.query.insights.findMany({
    where: eq(insights.userId, userId),
    orderBy: desc(insights.createdAt),
    limit,
  });
}

export async function getInsightsByActivity(
  activityId: string,
  db: AppDatabase = getDb(),
) {
  return db.query.insights.findMany({
    where: eq(insights.activityId, activityId),
    orderBy: desc(insights.createdAt),
  });
}

export async function getRecentActivitiesWithWorkouts(
  userId: string,
  days = 28,
  db: AppDatabase = getDb(),
) {
  const cutoff = Date.now() - days * 86400000;

  const activities = await db
    .select({
      activity: garminActivities,
      workout: garminWorkouts,
    })
    .from(garminActivities)
    .leftJoin(
      garminWorkouts,
      eq(garminActivities.matchedWorkoutId, garminWorkouts.id),
    )
    .where(
      and(
        eq(garminActivities.userId, userId),
        gte(garminActivities.startTime, cutoff),
      ),
    )
    .orderBy(desc(garminActivities.startTime));

  return activities;
}
