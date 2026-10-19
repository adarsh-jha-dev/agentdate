import {
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const personStatus = pgEnum("person_status", [
  "pending",
  "scraping",
  "analyzing",
  "ready",
  "failed",
]);

export const sourceKind = pgEnum("source_kind", ["linkedin", "instagram"]);

export const dateStatus = pgEnum("date_status", [
  "pending",
  "running",
  "done",
  "failed",
]);

export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  linkedinUrl: text("linkedin_url").unique(),
  instagramUrl: text("instagram_url").unique(),
  status: personStatus("status").notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable(
  "sources",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: sourceKind("kind").notNull(),
    raw: jsonb("raw"),
    normalized: jsonb("normalized"),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.kind] })],
);

export const profiles = pgTable("profiles", {
  personId: uuid("person_id")
    .primaryKey()
    .references(() => people.id, { onDelete: "cascade" }),
  analysis: jsonb("analysis").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dates = pgTable("dates", {
  id: uuid("id").primaryKey().defaultRandom(),
  aId: uuid("a_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  bId: uuid("b_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  setting: text("setting"),
  transcript: jsonb("transcript"),
  aScore: real("a_score"),
  bScore: real("b_score"),
  aVerdict: jsonb("a_verdict"),
  bVerdict: jsonb("b_verdict"),
  status: dateStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const prescores = pgTable(
  "prescores",
  {
    aId: uuid("a_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    bId: uuid("b_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    reason: text("reason"),
  },
  (t) => [primaryKey({ columns: [t.aId, t.bId] })],
);

export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type DateRow = typeof dates.$inferSelect;
export type Prescore = typeof prescores.$inferSelect;
