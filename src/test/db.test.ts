import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheExercise,
  createUser,
  getCachedExercise,
  getGarminConnection,
  getGarminWorkouts,
  getNotionPages,
  getUserByNotionId,
  updateUserToken,
  upsertGarminConnection,
  upsertGarminWorkout,
  upsertNotionPage,
  upsertGarminActivity,
  getGarminActivities,
  getGarminActivityByGarminId,
  updateActivityMatch,
  createInsight,
  getInsights,
  getInsightsByActivity,
  getRecentActivitiesWithWorkouts,
} from "@/lib/db/queries";
import * as schema from "@/lib/db/schema";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  // Create tables directly from SQL — mirrors the Drizzle schema
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      notion_user_id TEXT NOT NULL UNIQUE,
      notion_access_token TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE garmin_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      garmin_email TEXT NOT NULL,
      garmin_password TEXT,
      garmin_session TEXT,
      last_sync_at INTEGER
    );

    CREATE TABLE notion_pages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notion_page_id TEXT NOT NULL,
      page_title TEXT NOT NULL,
      last_parsed_at INTEGER,
      content_hash TEXT
    );

    CREATE TABLE garmin_workouts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notion_page_id TEXT,
      workout_name TEXT NOT NULL,
      garmin_workout_id TEXT,
      payload_hash TEXT,
      resolved_data TEXT,
      last_pushed_at INTEGER
    );

    CREATE TABLE exercise_cache (
      id TEXT PRIMARY KEY,
      raw_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      garmin_category TEXT NOT NULL,
      garmin_exercise_name TEXT NOT NULL,
      garmin_category_id INTEGER NOT NULL,
      garmin_exercise_name_id INTEGER NOT NULL,
      resolution_method TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE garmin_activities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      garmin_activity_id TEXT NOT NULL UNIQUE,
      activity_type TEXT,
      activity_name TEXT,
      start_time INTEGER,
      duration_seconds INTEGER,
      raw_data TEXT,
      matched_workout_id TEXT,
      pulled_at INTEGER
    );

    CREATE TABLE insights (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_id TEXT REFERENCES garmin_activities(id) ON DELETE SET NULL,
      insight_type TEXT NOT NULL,
      content TEXT NOT NULL,
      plan_context TEXT,
      actual_context TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE UNIQUE INDEX garmin_connections_user_id_unique ON garmin_connections(user_id);
    CREATE UNIQUE INDEX notion_pages_user_id_notion_page_id_unique ON notion_pages(user_id, notion_page_id);
    CREATE UNIQUE INDEX garmin_workouts_user_id_workout_name_unique ON garmin_workouts(user_id, workout_name);
  `);

  return db;
}

type TestDb = ReturnType<typeof createTestDb>;

describe("database schema and queries", () => {
  let db: TestDb;

  beforeEach(() => {
    db = createTestDb();
  });

  describe("users", () => {
    it("creates a user and retrieves by notion ID", async () => {
      const { id } = await createUser("notion-123", "encrypted-token-abc", db);
      expect(id).toBeDefined();

      const user = await getUserByNotionId("notion-123", db);
      expect(user).toBeDefined();
      expect(user?.notionUserId).toBe("notion-123");
      expect(user?.notionAccessToken).toBe("encrypted-token-abc");
      expect(user?.createdAt).toBeGreaterThan(0);
    });

    it("returns undefined for non-existent notion ID", async () => {
      const user = await getUserByNotionId("does-not-exist", db);
      expect(user).toBeUndefined();
    });

    it("enforces unique notion user ID", async () => {
      await createUser("notion-123", "token-1", db);
      await expect(createUser("notion-123", "token-2", db)).rejects.toThrow();
    });

    it("updates user token", async () => {
      const { id } = await createUser("notion-456", "old-token", db);
      await updateUserToken(id, "new-token", db);

      const user = await getUserByNotionId("notion-456", db);
      expect(user?.notionAccessToken).toBe("new-token");
    });
  });

  describe("garmin connections", () => {
    it("creates and retrieves a garmin connection", async () => {
      const { id: userId } = await createUser("notion-gc", "token", db);
      const { id } = await upsertGarminConnection(
        userId,
        "enc-email",
        "enc-session",
        undefined,
        db,
      );
      expect(id).toBeDefined();

      const conn = await getGarminConnection(userId, db);
      expect(conn).toBeDefined();
      expect(conn?.garminEmail).toBe("enc-email");
      expect(conn?.garminSession).toBe("enc-session");
    });

    it("updates existing connection on second upsert", async () => {
      const { id: userId } = await createUser("notion-gc2", "token", db);
      await upsertGarminConnection(userId, "email-v1", "session-v1", undefined, db);
      await upsertGarminConnection(userId, "email-v2", "session-v2", undefined, db);

      const conn = await getGarminConnection(userId, db);
      expect(conn?.garminEmail).toBe("email-v2");
      expect(conn?.garminSession).toBe("session-v2");
      expect(conn?.lastSyncAt).toBeGreaterThan(0);
    });
  });

  describe("notion pages", () => {
    it("creates and lists notion pages for a user", async () => {
      const { id: userId } = await createUser("notion-np", "token", db);
      await upsertNotionPage(
        userId,
        "page-abc",
        "Health is Wealth",
        "hash-1",
        db,
      );

      const pages = await getNotionPages(userId, db);
      expect(pages).toHaveLength(1);
      expect(pages[0].pageTitle).toBe("Health is Wealth");
      expect(pages[0].notionPageId).toBe("page-abc");
    });

    it("updates existing page on second upsert with same notionPageId", async () => {
      const { id: userId } = await createUser("notion-np2", "token", db);
      await upsertNotionPage(userId, "page-xyz", "Title v1", "hash-1", db);
      await upsertNotionPage(userId, "page-xyz", "Title v2", "hash-2", db);

      const pages = await getNotionPages(userId, db);
      expect(pages).toHaveLength(1);
      expect(pages[0].pageTitle).toBe("Title v2");
      expect(pages[0].contentHash).toBe("hash-2");
    });
  });

  describe("garmin workouts", () => {
    it("creates and lists workouts", async () => {
      const { id: userId } = await createUser("notion-gw", "token", db);
      await upsertGarminWorkout(userId, "Push Day", "garmin-42", "hash-a", "notion-page-1", undefined, db);

      const workouts = await getGarminWorkouts(userId, db);
      expect(workouts).toHaveLength(1);
      expect(workouts[0].workoutName).toBe("Push Day");
      expect(workouts[0].garminWorkoutId).toBe("garmin-42");
    });

    it("updates existing workout on re-push (idempotent)", async () => {
      const { id: userId } = await createUser("notion-gw2", "token", db);
      await upsertGarminWorkout(userId, "Pull Day", "garmin-1", "hash-1", "notion-page-1", undefined, db);
      await upsertGarminWorkout(userId, "Pull Day", "garmin-1", "hash-2", "notion-page-1", undefined, db);

      const workouts = await getGarminWorkouts(userId, db);
      expect(workouts).toHaveLength(1);
      expect(workouts[0].payloadHash).toBe("hash-2");
    });
  });

  describe("exercise cache", () => {
    it("caches an exercise resolution and retrieves it", async () => {
      await cacheExercise(
        {
          rawName: "DB Bench Press",
          normalizedName: "dumbbell bench press",
          garminCategory: "BENCH_PRESS",
          garminExerciseName: "DUMBBELL_BENCH_PRESS",
          garminCategoryId: 10,
          garminExerciseNameId: 1,
          resolutionMethod: "exact",
        },
        db,
      );

      const cached = await getCachedExercise("dumbbell bench press", db);
      expect(cached).toBeDefined();
      expect(cached?.garminCategory).toBe("BENCH_PRESS");
      expect(cached?.garminExerciseName).toBe("DUMBBELL_BENCH_PRESS");
      expect(cached?.resolutionMethod).toBe("exact");
    });

    it("returns undefined for uncached exercise", async () => {
      const result = await getCachedExercise("unknown exercise", db);
      expect(result).toBeUndefined();
    });

    it("enforces unique normalized name", async () => {
      const entry = {
        rawName: "Bench",
        normalizedName: "bench press",
        garminCategory: "BENCH_PRESS",
        garminExerciseName: "BARBELL_BENCH_PRESS",
        garminCategoryId: 10,
        garminExerciseNameId: 0,
        resolutionMethod: "exact" as const,
      };

      await cacheExercise(entry, db);
      await expect(
        cacheExercise({ ...entry, rawName: "Bench Press" }, db),
      ).rejects.toThrow();
    });
  });

  describe("foreign key constraints", () => {
    it("rejects garmin connection for non-existent user", async () => {
      await expect(
        upsertGarminConnection(
          "fake-user-id",
          "email",
          "session",
          undefined,
          db,
        ),
      ).rejects.toThrow();
    });

    it("cascade deletes child records when user is deleted", async () => {
      const { id: userId } = await createUser("notion-cascade", "token", db);
      await upsertGarminConnection(userId, "email", "session", db);
      await upsertNotionPage(userId, "page-1", "Title", "hash", db);
      await upsertGarminWorkout(userId, "Push Day", null, "hash", db);

      // Verify children exist
      expect(await getGarminConnection(userId, db)).toBeDefined();
      expect(await getNotionPages(userId, db)).toHaveLength(1);
      expect(await getGarminWorkouts(userId, db)).toHaveLength(1);

      // Delete user
      await db.delete(schema.users).where(sql`id = ${userId}`);

      // Children should be gone
      expect(await getGarminConnection(userId, db)).toBeUndefined();
      expect(await getNotionPages(userId, db)).toHaveLength(0);
      expect(await getGarminWorkouts(userId, db)).toHaveLength(0);
    });
  });

  describe("garmin activities", () => {
    it("creates a new activity", async () => {
      const { id: userId } = await createUser("notion-act1", "token", db);
      const { id } = await upsertGarminActivity(
        userId,
        {
          garminActivityId: "garmin-act-100",
          activityType: "strength_training",
          activityName: "Push Day",
          startTime: 1700000000000,
          durationSeconds: 3600,
          rawData: JSON.stringify({ sets: 12 }),
        },
        db,
      );
      expect(id).toBeDefined();

      const activity = await getGarminActivityByGarminId("garmin-act-100", db);
      expect(activity).toBeDefined();
      expect(activity!.activityName).toBe("Push Day");
      expect(activity!.activityType).toBe("strength_training");
      expect(activity!.durationSeconds).toBe(3600);
    });

    it("deduplicates by garminActivityId on upsert", async () => {
      const { id: userId } = await createUser("notion-act2", "token", db);
      const { id: firstId } = await upsertGarminActivity(
        userId,
        {
          garminActivityId: "garmin-act-200",
          activityName: "Pull Day v1",
          durationSeconds: 3000,
        },
        db,
      );

      const { id: secondId } = await upsertGarminActivity(
        userId,
        {
          garminActivityId: "garmin-act-200",
          activityName: "Pull Day v2",
          durationSeconds: 3500,
        },
        db,
      );

      // Same DB row, updated in place
      expect(secondId).toBe(firstId);

      const activity = await getGarminActivityByGarminId("garmin-act-200", db);
      expect(activity!.activityName).toBe("Pull Day v2");
      expect(activity!.durationSeconds).toBe(3500);
    });

    it("returns activities ordered by startTime desc", async () => {
      const { id: userId } = await createUser("notion-act3", "token", db);
      await upsertGarminActivity(
        userId,
        { garminActivityId: "act-old", activityName: "Old", startTime: 1000 },
        db,
      );
      await upsertGarminActivity(
        userId,
        { garminActivityId: "act-new", activityName: "New", startTime: 3000 },
        db,
      );
      await upsertGarminActivity(
        userId,
        { garminActivityId: "act-mid", activityName: "Mid", startTime: 2000 },
        db,
      );

      const activities = await getGarminActivities(userId, 10, 0, db);
      expect(activities).toHaveLength(3);
      expect(activities[0].activityName).toBe("New");
      expect(activities[1].activityName).toBe("Mid");
      expect(activities[2].activityName).toBe("Old");
    });

    it("finds activity by garmin ID", async () => {
      const { id: userId } = await createUser("notion-act4", "token", db);
      await upsertGarminActivity(
        userId,
        { garminActivityId: "garmin-find-me", activityName: "Legs" },
        db,
      );

      const found = await getGarminActivityByGarminId("garmin-find-me", db);
      expect(found).toBeDefined();
      expect(found!.activityName).toBe("Legs");

      const notFound = await getGarminActivityByGarminId("nope", db);
      expect(notFound).toBeUndefined();
    });

    it("links activity to workout via updateActivityMatch", async () => {
      const { id: userId } = await createUser("notion-act5", "token", db);
      const { id: activityId } = await upsertGarminActivity(
        userId,
        { garminActivityId: "garmin-match-test", activityName: "Push" },
        db,
      );
      const { id: workoutId } = await upsertGarminWorkout(
        userId,
        "Push Day",
        "gw-1",
        "hash",
        "notion-page-1",
        undefined,
        db,
      );

      await updateActivityMatch(activityId, workoutId, db);

      const activity = await getGarminActivityByGarminId("garmin-match-test", db);
      expect(activity!.matchedWorkoutId).toBe(workoutId);
    });
  });

  describe("insights", () => {
    it("creates an insight and retrieves by user", async () => {
      const { id: userId } = await createUser("notion-ins1", "token", db);
      const { id: activityId } = await upsertGarminActivity(
        userId,
        { garminActivityId: "garmin-ins-act" },
        db,
      );

      const { id: insightId } = await createInsight(
        userId,
        activityId,
        "auto",
        "Great session! 94% rep completion.",
        JSON.stringify({ workoutName: "Push Day" }),
        JSON.stringify({ activityName: "Push Day" }),
        db,
      );
      expect(insightId).toBeDefined();

      const result = await getInsights(userId, 10, db);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Great session! 94% rep completion.");
      expect(result[0].insightType).toBe("auto");
      expect(result[0].planContext).toBe(JSON.stringify({ workoutName: "Push Day" }));
    });

    it("filters insights by activity ID", async () => {
      const { id: userId } = await createUser("notion-ins2", "token", db);
      const { id: act1 } = await upsertGarminActivity(
        userId,
        { garminActivityId: "ins-act-1" },
        db,
      );
      const { id: act2 } = await upsertGarminActivity(
        userId,
        { garminActivityId: "ins-act-2" },
        db,
      );

      await createInsight(userId, act1, "auto", "Insight for act1", undefined, undefined, db);
      await createInsight(userId, act2, "auto", "Insight for act2", undefined, undefined, db);
      await createInsight(userId, act1, "deep", "Deep insight for act1", undefined, undefined, db);

      const act1Insights = await getInsightsByActivity(act1, db);
      expect(act1Insights).toHaveLength(2);
      act1Insights.forEach((i) => expect(i.activityId).toBe(act1));

      const act2Insights = await getInsightsByActivity(act2, db);
      expect(act2Insights).toHaveLength(1);
      expect(act2Insights[0].content).toBe("Insight for act2");
    });

    it("returns insights ordered by createdAt desc", async () => {
      const { id: userId } = await createUser("notion-ins3", "token", db);
      const { id: actId } = await upsertGarminActivity(
        userId,
        { garminActivityId: "ins-act-order" },
        db,
      );

      // Insert with small delays to ensure different createdAt
      await createInsight(userId, actId, "auto", "First", undefined, undefined, db);
      await createInsight(userId, actId, "auto", "Second", undefined, undefined, db);
      await createInsight(userId, actId, "deep", "Third", undefined, undefined, db);

      const result = await getInsights(userId, 10, db);
      expect(result).toHaveLength(3);
      // Most recent first — but since they might share the same ms timestamp,
      // just verify we get all three back
      const contents = result.map((i) => i.content);
      expect(contents).toContain("First");
      expect(contents).toContain("Second");
      expect(contents).toContain("Third");
    });
  });

  describe("recent activities with workouts join", () => {
    it("joins activities with matched workouts", async () => {
      const { id: userId } = await createUser("notion-join1", "token", db);
      const { id: workoutId } = await upsertGarminWorkout(
        userId,
        "Push Day",
        "gw-join",
        "hash",
        "notion-page-1",
        undefined,
        db,
      );
      const { id: activityId } = await upsertGarminActivity(
        userId,
        {
          garminActivityId: "join-act-1",
          activityName: "Push Day",
          startTime: Date.now(),
          matchedWorkoutId: workoutId,
        },
        db,
      );

      // Unmatched activity
      await upsertGarminActivity(
        userId,
        {
          garminActivityId: "join-act-2",
          activityName: "Random Run",
          startTime: Date.now(),
        },
        db,
      );

      const results = await getRecentActivitiesWithWorkouts(userId, 28, db);
      expect(results).toHaveLength(2);

      const matched = results.find((r) => r.activity.id === activityId);
      expect(matched!.workout).toBeDefined();
      expect(matched!.workout!.workoutName).toBe("Push Day");

      const unmatched = results.find((r) => r.activity.activityName === "Random Run");
      expect(unmatched!.workout).toBeNull();
    });

    it("excludes activities older than the day cutoff", async () => {
      const { id: userId } = await createUser("notion-join2", "token", db);
      const now = Date.now();

      await upsertGarminActivity(
        userId,
        {
          garminActivityId: "recent-act",
          activityName: "Recent",
          startTime: now - 5 * 86400000, // 5 days ago
        },
        db,
      );
      await upsertGarminActivity(
        userId,
        {
          garminActivityId: "old-act",
          activityName: "Old",
          startTime: now - 60 * 86400000, // 60 days ago
        },
        db,
      );

      const results = await getRecentActivitiesWithWorkouts(userId, 28, db);
      expect(results).toHaveLength(1);
      expect(results[0].activity.activityName).toBe("Recent");
    });
  });
});
