import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS giveaway_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_giveaway_tickets_user_id ON giveaway_tickets(user_id);

CREATE TABLE IF NOT EXISTS giveaway_checkouts (
  order_reference TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  amount_usd REAL NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_giveaway_checkouts_user ON giveaway_checkouts(user_id);

CREATE TABLE IF NOT EXISTS giveaway_checkout_rate_limit (
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  last_request_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);
`;

let cached: Database.Database | null = null;

function migrateGiveawayDb(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(giveaway_tickets)").all() as { name: string }[];
  const hasOrderRef = cols.some((c) => c.name === "order_reference");
  if (!hasOrderRef) {
    try {
      db.exec("ALTER TABLE giveaway_tickets ADD COLUMN order_reference TEXT");
    } catch {
      /* ignore */
    }
  }
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_giveaway_tickets_order_ref ON giveaway_tickets(order_reference)",
    );
  } catch {
    /* ignore */
  }

  migrateGiveawayCheckoutsAmountUsd(db);
  migrateWayforpayBridgeColumns(db);
  migrateCheckoutRateLimitByProvider(db);
}

/** Стара схема: один timestamp на user; нова — окремо plisio / wayforpay. */
function migrateCheckoutRateLimitByProvider(db: Database.Database): void {
  let cols: { name: string }[];
  try {
    cols = db.prepare("PRAGMA table_info(giveaway_checkout_rate_limit)").all() as { name: string }[];
  } catch {
    return;
  }
  if (cols.length === 0) return;
  const names = new Set(cols.map((c) => c.name));
  if (names.has("provider")) return;

  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE giveaway_checkout_rate_limit_m (
          user_id INTEGER NOT NULL,
          provider TEXT NOT NULL,
          last_request_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, provider)
        );
        INSERT INTO giveaway_checkout_rate_limit_m (user_id, provider, last_request_at)
        SELECT user_id, 'plisio', last_request_at FROM giveaway_checkout_rate_limit;
        INSERT INTO giveaway_checkout_rate_limit_m (user_id, provider, last_request_at)
        SELECT user_id, 'wayforpay', last_request_at FROM giveaway_checkout_rate_limit;
        DROP TABLE giveaway_checkout_rate_limit;
        ALTER TABLE giveaway_checkout_rate_limit_m RENAME TO giveaway_checkout_rate_limit;
      `);
    })();
  } catch (e) {
    console.error("[giveaway-db] migrateCheckoutRateLimitByProvider failed", e);
  }
}

/** Поля POST на secure.wayforpay.com/pay (GET на /pay дає Bad Request). */
function migrateWayforpayBridgeColumns(db: Database.Database): void {
  for (const sql of [
    "ALTER TABLE giveaway_checkouts ADD COLUMN wayforpay_bridge_token TEXT",
    "ALTER TABLE giveaway_checkouts ADD COLUMN wayforpay_form_json TEXT",
  ]) {
    try {
      db.exec(sql);
    } catch {
      /* duplicate column */
    }
  }
}

/** Старі БД мали amount_uah; додаємо amount_usd і копіюємо (суми лишаються як були — переналаштуй ціну в .env). */
function migrateGiveawayCheckoutsAmountUsd(db: Database.Database): void {
  let cols: { name: string }[];
  try {
    cols = db.prepare("PRAGMA table_info(giveaway_checkouts)").all() as { name: string }[];
  } catch {
    return;
  }
  if (cols.length === 0) return;
  const names = new Set(cols.map((c) => c.name));
  if (names.has("amount_usd")) return;
  if (!names.has("amount_uah")) return;
  try {
    db.exec("ALTER TABLE giveaway_checkouts ADD COLUMN amount_usd REAL");
  } catch {
    return;
  }
  try {
    db.exec("UPDATE giveaway_checkouts SET amount_usd = amount_uah WHERE amount_usd IS NULL");
  } catch {
    /* ignore */
  }
}

export function getGiveawayDbPath(): string {
  const fromEnv = process.env.SQLITE_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "..", "database", "data.db");
}

export function getGiveawayDb(): Database.Database {
  if (cached) return cached;
  const dbPath = getGiveawayDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrateGiveawayDb(db);
  cached = db;
  return db;
}

export function getGiveawayTotalCap(): number {
  const n = Number.parseInt(process.env.GIVEAWAY_TOTAL_TICKETS ?? "777", 10);
  return Number.isFinite(n) && n > 0 ? n : 777;
}

export const MAX_TICKETS_PER_USER = 10;
