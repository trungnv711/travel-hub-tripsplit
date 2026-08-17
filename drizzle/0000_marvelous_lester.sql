CREATE TABLE `shared_trips` (
	`share_id` text PRIMARY KEY NOT NULL,
	`trip_data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
