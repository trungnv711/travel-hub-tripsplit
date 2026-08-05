import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sharedTrips = sqliteTable("shared_trips", {
  shareId: text("share_id").primaryKey(),
  tripData: text("trip_data").notNull(),
  ownerId: text("owner_id"),
  ownerEmail: text("owner_email"),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tripHistory = sqliteTable("trip_history", {
  id: text("id").primaryKey(),
  shareId: text("share_id").notNull(),
  revision: integer("revision").notNull(),
  actorId: text("actor_id"),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  tripData: text("trip_data").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
