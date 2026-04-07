import { insertUniqueTicketCode } from "@/lib/giveaway-codes";
import {
  getGiveawayDb,
  getGiveawayTotalCap,
  MAX_TICKETS_PER_USER,
} from "@/lib/giveaway-db";
import type Database from "better-sqlite3";

export type FulfillOk = { ok: true; tickets: { code: string; createdAt: string }[] };
export type FulfillErr = { ok: false; error: string; status: number };

/**
 * Видає квитки користувачу. Ідемпотентно за order_reference (якщо передано).
 */
export function fulfillTicketsForUser(
  db: Database.Database,
  userId: number,
  quantity: number,
  orderReference: string | null,
): FulfillOk | FulfillErr {
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_USER) {
    return { ok: false, error: "bad_quantity", status: 400 };
  }

  if (orderReference) {
    const existing = db
      .prepare(
        "SELECT code, created_at AS createdAt FROM giveaway_tickets WHERE order_reference = ? ORDER BY id ASC",
      )
      .all(orderReference) as { code: string; createdAt: string }[];
    if (existing.length > 0) {
      return { ok: true, tickets: existing };
    }
  }

  const totalCap = getGiveawayTotalCap();
  const soldRow = db.prepare("SELECT COUNT(*) AS c FROM giveaway_tickets").get() as { c: number };
  const userRow = db
    .prepare("SELECT COUNT(*) AS c FROM giveaway_tickets WHERE user_id = ?")
    .get(userId) as { c: number };

  if (userRow.c + quantity > MAX_TICKETS_PER_USER) {
    return { ok: false, error: "user_cap", status: 403 };
  }
  if (soldRow.c + quantity > totalCap) {
    return { ok: false, error: "pool_exhausted", status: 403 };
  }

  const createdAt = new Date().toISOString();
  const tickets: { code: string; createdAt: string }[] = [];

  try {
    const run = db.transaction(() => {
      for (let i = 0; i < quantity; i++) {
        const code = insertUniqueTicketCode(db, userId, createdAt, orderReference);
        tickets.push({ code, createdAt });
      }
    });
    run();
  } catch (e) {
    console.error("[fulfillTicketsForUser]", e);
    return { ok: false, error: "server", status: 500 };
  }

  return { ok: true, tickets };
}

export function fulfillTicketsForUserDefaultDb(
  userId: number,
  quantity: number,
  orderReference: string | null,
): FulfillOk | FulfillErr {
  return fulfillTicketsForUser(getGiveawayDb(), userId, quantity, orderReference);
}
