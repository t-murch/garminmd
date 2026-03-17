import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── Users ─────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  notionUserId: text("notion_user_id").notNull().unique(),
  notionAccessToken: text("notion_access_token").notNull(),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ─── Garmin Connections ────────────────────────────────────────

export const garminConnections = sqliteTable("garmin_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  garminEmail: text("garmin_email").notNull(),
  garminPassword: text("garmin_password"),
  garminSession: text("garmin_session"),
  lastSyncAt: integer("last_sync_at"),
});

export type GarminConnection = typeof garminConnections.$inferSelect;
export type NewGarminConnection = typeof garminConnections.$inferInsert;

// ─── Notion Pages ──────────────────────────────────────────────

export const notionPages = sqliteTable("notion_pages", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  notionPageId: text("notion_page_id").notNull(),
  pageTitle: text("page_title").notNull(),
  lastParsedAt: integer("last_parsed_at"),
  contentHash: text("content_hash"),
});

export type NotionPage = typeof notionPages.$inferSelect;
export type NewNotionPage = typeof notionPages.$inferInsert;

// ─── Garmin Workouts ───────────────────────────────────────────

export const garminWorkouts = sqliteTable("garmin_workouts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  notionPageId: text("notion_page_id"),
  workoutName: text("workout_name").notNull(),
  garminWorkoutId: text("garmin_workout_id"),
  payloadHash: text("payload_hash"),
  resolvedData: text("resolved_data"),
  lastPushedAt: integer("last_pushed_at"),
});

export type GarminWorkout = typeof garminWorkouts.$inferSelect;
export type NewGarminWorkout = typeof garminWorkouts.$inferInsert;

// ─── Exercise Cache ────────────────────────────────────────────

export const exerciseCache = sqliteTable("exercise_cache", {
  id: text("id").primaryKey(),
  rawName: text("raw_name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  garminCategory: text("garmin_category").notNull(),
  garminExerciseName: text("garmin_exercise_name").notNull(),
  garminCategoryId: integer("garmin_category_id").notNull(),
  garminExerciseNameId: integer("garmin_exercise_name_id").notNull(),
  resolutionMethod: text("resolution_method").notNull(),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export type ExerciseCacheEntry = typeof exerciseCache.$inferSelect;
export type NewExerciseCacheEntry = typeof exerciseCache.$inferInsert;

// ─── Garmin Activities (Phase 2) ───────────────────────────────

export const garminActivities = sqliteTable("garmin_activities", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  garminActivityId: text("garmin_activity_id").notNull().unique(),
  activityType: text("activity_type"),
  activityName: text("activity_name"),
  startTime: integer("start_time"),
  durationSeconds: integer("duration_seconds"),
  rawData: text("raw_data"),
  matchedWorkoutId: text("matched_workout_id"),
  pulledAt: integer("pulled_at"),
});

export type GarminActivity = typeof garminActivities.$inferSelect;
export type NewGarminActivity = typeof garminActivities.$inferInsert;

// ─── Insights (Phase 2) ───────────────────────────────────────

export const insights = sqliteTable("insights", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  activityId: text("activity_id").references(() => garminActivities.id),
  insightType: text("insight_type").notNull(),
  content: text("content").notNull(),
  planContext: text("plan_context"),
  actualContext: text("actual_context"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export type Insight = typeof insights.$inferSelect;
export type NewInsight = typeof insights.$inferInsert;
