import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { sessionsTable } from "./sessions";

export const submissionStatusEnum = pgEnum("submission_status", [
  "pending",
  "approved",
  "rejected",
  "played",
  "skipped",
]);

export const submissionsTable = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessionsTable.id),
    queueNumber: integer("queue_number").notNull(),
    artistName: varchar("artist_name", { length: 100 }).notNull(),
    songTitle: varchar("song_title", { length: 120 }).notNull(),
    intro: varchar("intro", { length: 300 }).notNull(),
    genre: varchar("genre", { length: 60 }).notNull(),
    country: varchar("country", { length: 80 }).notNull(),
    socialUrl: text("social_url"),
    trackUrl: text("track_url").notNull(),
    rightsAccepted: boolean("rights_accepted").notNull(),
    status: submissionStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("submissions_session_queue_unique").on(
      table.sessionId,
      table.queueNumber,
    ),
    index("submissions_session_status_queue_idx").on(
      table.sessionId,
      table.status,
      table.queueNumber,
    ),
  ],
);

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit(
  {
    id: true,
    queueNumber: true,
    status: true,
    createdAt: true,
  },
);
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissionsTable.$inferSelect;