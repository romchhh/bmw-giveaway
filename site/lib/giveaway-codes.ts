import { randomInt } from "crypto";
import type Database from "better-sqlite3";

/** Рядок із 6 цифр, унікальність гарантує UNIQUE у БД. */
export function randomSixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function insertUniqueTicketCode(
  db: Database.Database,
  userId: number,
  createdAt: string,
  orderReference: string | null = null,
): string {
  const stmt = db.prepare(
    "INSERT INTO giveaway_tickets (user_id, code, created_at, order_reference) VALUES (?, ?, ?, ?)",
  );
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = randomSixDigitCode();
    try {
      stmt.run(userId, code, createdAt, orderReference);
      return code;
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") continue;
      throw e;
    }
  }
  throw new Error("Failed to generate unique ticket code");
}
