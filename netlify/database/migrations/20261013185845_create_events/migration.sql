CREATE TABLE "events" (
	"id" serial PRIMARY KEY,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"path" text DEFAULT '/' NOT NULL,
	"target" text,
	"referrer" text,
	"country" text,
	"city" text,
	"device" text,
	"browser" text,
	"os" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" ("created_at");--> statement-breakpoint
CREATE INDEX "events_session_id_idx" ON "events" ("session_id");