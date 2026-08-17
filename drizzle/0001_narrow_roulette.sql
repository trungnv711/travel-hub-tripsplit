CREATE TABLE `trip_history` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text,
	`actor_email` text,
	`action` text NOT NULL,
	`trip_data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `shared_trips` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `shared_trips` ADD `owner_email` text;