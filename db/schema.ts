import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const events = pgTable(
  "events",
  {
    id: serial().primaryKey(),
    visitorId: text("visitor_id").notNull(),
    sessionId: text("session_id").notNull(),
    type: text().notNull(), // pageview | section | click | leave
    path: text().notNull().default("/"),
    target: text(),
    referrer: text(),
    country: text(),
    city: text(),
    device: text(),
    browser: text(),
    os: text(),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("events_created_at_idx").on(t.createdAt),
    index("events_session_id_idx").on(t.sessionId),
  ],
);
