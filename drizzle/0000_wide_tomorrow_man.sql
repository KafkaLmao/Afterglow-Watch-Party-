CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`updated` integer NOT NULL
);
