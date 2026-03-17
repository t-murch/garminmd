CREATE UNIQUE INDEX `garmin_connections_user_id_unique` ON `garmin_connections` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_workouts_user_id_workout_name_unique` ON `garmin_workouts` (`user_id`,`workout_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `notion_pages_user_id_notion_page_id_unique` ON `notion_pages` (`user_id`,`notion_page_id`);