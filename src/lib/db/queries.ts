import { eq, and } from "drizzle-orm";
import { getDb, type AppDatabase } from "./index";
import {
  users,
  garminConnections,
  notionPages,
  garminWorkouts,
  exerciseCache,
} from "./schema";

// ─── Users ─────────────────────────────────────────────────────

export async function getUserById(
  userId: string,
  db: AppDatabase = getDb(),
) {
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
  const existing = await db.query.garminConnections.findFirst({
    where: eq(garminConnections.userId, userId),
  });

  if (existing) {
    await db
      .update(garminConnections)
      .set({
        garminEmail: encryptedEmail,
        garminSession: encryptedSession,
        lastSyncAt: Date.now(),
      })
      .where(eq(garminConnections.id, existing.id));
    return { id: existing.id };
  }

  const [row] = await db
    .insert(garminConnections)
    .values({
      userId,
      garminEmail: encryptedEmail,
      garminSession: encryptedSession,
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
  const existing = await db.query.notionPages.findFirst({
    where: and(
      eq(notionPages.userId, userId),
      eq(notionPages.notionPageId, notionPageId),
    ),
  });

  if (existing) {
    await db
      .update(notionPages)
      .set({
        pageTitle: title,
        contentHash,
        lastParsedAt: Date.now(),
      })
      .where(eq(notionPages.id, existing.id));
    return { id: existing.id };
  }

  const [row] = await db
    .insert(notionPages)
    .values({
      userId,
      notionPageId,
      pageTitle: title,
      contentHash,
      lastParsedAt: Date.now(),
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
  const existing = await db.query.garminWorkouts.findFirst({
    where: and(
      eq(garminWorkouts.userId, userId),
      eq(garminWorkouts.workoutName, workoutName),
    ),
  });

  if (existing) {
    await db
      .update(garminWorkouts)
      .set({
        garminWorkoutId,
        payloadHash,
        lastPushedAt: Date.now(),
      })
      .where(eq(garminWorkouts.id, existing.id));
    return { id: existing.id };
  }

  const [row] = await db
    .insert(garminWorkouts)
    .values({
      userId,
      workoutName,
      garminWorkoutId,
      payloadHash,
      lastPushedAt: Date.now(),
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
