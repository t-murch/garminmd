CREATE TABLE `exercise_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`raw_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`garmin_category` text NOT NULL,
	`garmin_exercise_name` text NOT NULL,
	`garmin_category_id` integer NOT NULL,
	`garmin_exercise_name_id` integer NOT NULL,
	`resolution_method` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_cache_normalized_name_unique` ON `exercise_cache` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `garmin_activities` (
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_activities_garmin_activity_id_unique` ON `garmin_activities` (`garmin_activity_id`);--> statement-breakpoint
CREATE TABLE `garmin_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`garmin_email` text NOT NULL,
	`garmin_session` text,
	`last_sync_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `garmin_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`notion_page_id` text,
	`workout_name` text NOT NULL,
	`garmin_workout_id` text,
	`payload_hash` text,
	`last_pushed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `insights` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text,
	`insight_type` text NOT NULL,
	`content` text NOT NULL,
	`plan_context` text,
	`actual_context` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `garmin_activities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notion_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`notion_page_id` text NOT NULL,
	`page_title` text NOT NULL,
	`last_parsed_at` integer,
	`content_hash` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_user_id` text NOT NULL,
	`notion_access_token` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_notion_user_id_unique` ON `users` (`notion_user_id`);