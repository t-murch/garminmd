PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_garmin_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`garmin_activity_id` text NOT NULL,
	`activity_type` text,
	`activity_name` text,
	`start_time` integer,
	`duration_seconds` integer,
	`raw_data` text,
	`matched_workout_id` text,
	`pulled_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_garmin_activities`("id", "user_id", "garmin_activity_id", "activity_type", "activity_name", "start_time", "duration_seconds", "raw_data", "matched_workout_id", "pulled_at") SELECT "id", "user_id", "garmin_activity_id", "activity_type", "activity_name", "start_time", "duration_seconds", "raw_data", "matched_workout_id", "pulled_at" FROM `garmin_activities`;--> statement-breakpoint
DROP TABLE `garmin_activities`;--> statement-breakpoint
ALTER TABLE `__new_garmin_activities` RENAME TO `garmin_activities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_activities_garmin_activity_id_unique` ON `garmin_activities` (`garmin_activity_id`);--> statement-breakpoint
CREATE TABLE `__new_garmin_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`garmin_email` text NOT NULL,
	`garmin_session` text,
	`last_sync_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_garmin_connections`("id", "user_id", "garmin_email", "garmin_session", "last_sync_at") SELECT "id", "user_id", "garmin_email", "garmin_session", "last_sync_at" FROM `garmin_connections`;--> statement-breakpoint
DROP TABLE `garmin_connections`;--> statement-breakpoint
ALTER TABLE `__new_garmin_connections` RENAME TO `garmin_connections`;--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_connections_user_id_unique` ON `garmin_connections` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_garmin_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`notion_page_id` text,
	`workout_name` text NOT NULL,
	`garmin_workout_id` text,
	`payload_hash` text,
	`last_pushed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_garmin_workouts`("id", "user_id", "notion_page_id", "workout_name", "garmin_workout_id", "payload_hash", "last_pushed_at") SELECT "id", "user_id", "notion_page_id", "workout_name", "garmin_workout_id", "payload_hash", "last_pushed_at" FROM `garmin_workouts`;--> statement-breakpoint
DROP TABLE `garmin_workouts`;--> statement-breakpoint
ALTER TABLE `__new_garmin_workouts` RENAME TO `garmin_workouts`;--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_workouts_user_id_workout_name_unique` ON `garmin_workouts` (`user_id`,`workout_name`);--> statement-breakpoint
CREATE TABLE `__new_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text,
	`insight_type` text NOT NULL,
	`content` text NOT NULL,
	`plan_context` text,
	`actual_context` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `garmin_activities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_insights`("id", "user_id", "activity_id", "insight_type", "content", "plan_context", "actual_context", "created_at") SELECT "id", "user_id", "activity_id", "insight_type", "content", "plan_context", "actual_context", "created_at" FROM `insights`;--> statement-breakpoint
DROP TABLE `insights`;--> statement-breakpoint
ALTER TABLE `__new_insights` RENAME TO `insights`;--> statement-breakpoint
CREATE TABLE `__new_notion_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`notion_page_id` text NOT NULL,
	`page_title` text NOT NULL,
	`last_parsed_at` integer,
	`content_hash` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notion_pages`("id", "user_id", "notion_page_id", "page_title", "last_parsed_at", "content_hash") SELECT "id", "user_id", "notion_page_id", "page_title", "last_parsed_at", "content_hash" FROM `notion_pages`;--> statement-breakpoint
DROP TABLE `notion_pages`;--> statement-breakpoint
ALTER TABLE `__new_notion_pages` RENAME TO `notion_pages`;--> statement-breakpoint
CREATE UNIQUE INDEX `notion_pages_user_id_notion_page_id_unique` ON `notion_pages` (`user_id`,`notion_page_id`);