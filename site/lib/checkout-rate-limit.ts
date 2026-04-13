import type Database from "better-sqlite3";

export type CheckoutRateProvider = "plisio" | "wayforpay";

/** Дефолти трохи коротші за хвилину; крипта й WayForPay рахуються окремо. */
const DEFAULT_WINDOW_SEC: Record<CheckoutRateProvider, number> = {
  plisio: 40,
  wayforpay: 48,
};

function positiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function windowMsForProvider(provider: CheckoutRateProvider): number {
  const sec =
    provider === "plisio"
      ? positiveIntEnv("CHECKOUT_RATE_PLISIO_SEC", DEFAULT_WINDOW_SEC.plisio)
      : positiveIntEnv("CHECKOUT_RATE_WAYFORPAY_SEC", DEFAULT_WINDOW_SEC.wayforpay);
  return sec * 1000;
}

/**
 * Окремий ліміт на користувача для кожного провайдера (Plisio / WayForPay).
 * Оновлює timestamp лише для цього provider, якщо спроба дозволена.
 */
export function tryBeginCheckoutWithinRateLimit(
  db: Database.Database,
  userId: number,
  provider: CheckoutRateProvider,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const windowMs = windowMsForProvider(provider);
  const now = Date.now();
  return db.transaction(() => {
    const row = db
      .prepare(
        `SELECT last_request_at FROM giveaway_checkout_rate_limit
         WHERE user_id = ? AND provider = ?`,
      )
      .get(userId, provider) as { last_request_at: number } | undefined;
    if (row !== undefined && now - row.last_request_at < windowMs) {
      const wait = windowMs - (now - row.last_request_at);
      return { ok: false as const, retryAfterSec: Math.max(1, Math.ceil(wait / 1000)) };
    }
    db.prepare(
      `INSERT INTO giveaway_checkout_rate_limit (user_id, provider, last_request_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET last_request_at = excluded.last_request_at`,
    ).run(userId, provider, now);
    return { ok: true as const };
  })();
}
