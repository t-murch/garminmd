import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!db) {
    const dbUrl = process.env.DATABASE_URL || "file:./garminmd.db";
    const filePath = dbUrl.replace("file:", "");
    const sqlite = new Database(filePath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });
  }
  return db;
}

export type AppDatabase = ReturnType<typeof getDb>;
