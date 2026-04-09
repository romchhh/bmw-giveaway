import type Database from "better-sqlite3";

const DEFAULT_WINDOW_MS = 60_000;

/**
 * Не частіше ніж раз на хвилину на користувача — створення посилання на оплату (WayForPay / Plisio).
 * Оновлює timestamp лише якщо спроба дозволена.
 */
export function tryBeginCheckoutWithinRateLimit(
  db: Database.Database,
  userId: number,
  windowMs: number = DEFAULT_WINDOW_MS,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  return db.transaction(() => {
    const row = db
      .prepare("SELECT last_request_at FROM giveaway_checkout_rate_limit WHERE user_id = ?")
      .get(userId) as { last_request_at: number } | undefined;
    if (row !== undefined && now - row.last_request_at < windowMs) {
      const wait = windowMs - (now - row.last_request_at);
      return { ok: false as const, retryAfterSec: Math.max(1, Math.ceil(wait / 1000)) };
    }
    db.prepare(
      `INSERT INTO giveaway_checkout_rate_limit (user_id, last_request_at)
       VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET last_request_at = excluded.last_request_at`,
    ).run(userId, now);
    return { ok: true as const };
  })();
}
