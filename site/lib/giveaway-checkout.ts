import { randomBytes } from "crypto";
import type Database from "better-sqlite3";

export type CheckoutProvider = "plisio" | "wayforpay";

export function generateOrderReference(): string {
  const t = Date.now().toString(36);
  const r = randomBytes(5).toString("hex");
  return `GWP${t}${r}`.toUpperCase().slice(0, 40);
}

export function insertPendingCheckout(
  db: Database.Database,
  row: {
    orderReference: string;
    userId: number;
    quantity: number;
    amountUsd: number;
    provider: CheckoutProvider;
  },
): void {
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO giveaway_checkouts (order_reference, user_id, quantity, amount_usd, provider, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(
    row.orderReference,
    row.userId,
    row.quantity,
    row.amountUsd,
    row.provider,
    createdAt,
  );
}

export function getPendingCheckout(
  db: Database.Database,
  orderReference: string,
):
  | {
      user_id: number;
      quantity: number;
      amount_usd: number;
      provider: string;
      status: string;
    }
  | undefined {
  const cols = db.prepare("PRAGMA table_info(giveaway_checkouts)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  const amountExpr =
    names.has("amount_usd") && names.has("amount_uah")
      ? "COALESCE(amount_usd, amount_uah) AS amount_usd"
      : "amount_usd";
  return db
    .prepare(
      `SELECT user_id, quantity, ${amountExpr}, provider, status
       FROM giveaway_checkouts WHERE order_reference = ?`,
    )
    .get(orderReference) as
    | {
        user_id: number;
        quantity: number;
        amount_usd: number;
        provider: string;
        status: string;
      }
    | undefined;
}

export function markCheckoutPaid(db: Database.Database, orderReference: string): void {
  db.prepare("UPDATE giveaway_checkouts SET status = 'paid' WHERE order_reference = ?").run(
    orderReference,
  );
}

/** Зберігаємо POST-поля WayForPay + одноразовий токен для GET-моста (авто-POST на /pay). */
export function saveWayforpayBridgeForm(
  db: Database.Database,
  orderReference: string,
  bridgeToken: string,
  formJson: string,
): void {
  db.prepare(
    `UPDATE giveaway_checkouts SET wayforpay_bridge_token = ?, wayforpay_form_json = ? WHERE order_reference = ?`,
  ).run(bridgeToken, formJson, orderReference);
}

export function getWayforpayBridgeFormByToken(
  db: Database.Database,
  bridgeToken: string,
): { orderReference: string; fields: Record<string, string> } | null {
  const row = db
    .prepare(
      `SELECT order_reference, wayforpay_form_json, status, provider
       FROM giveaway_checkouts WHERE wayforpay_bridge_token = ?`,
    )
    .get(bridgeToken) as
    | {
        order_reference: string;
        wayforpay_form_json: string | null;
        status: string;
        provider: string;
      }
    | undefined;
  if (
    !row ||
    row.status !== "pending" ||
    row.provider !== "wayforpay" ||
    !row.wayforpay_form_json
  ) {
    return null;
  }
  try {
    const raw = JSON.parse(row.wayforpay_form_json) as Record<string, string | number>;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      fields[k] = String(v);
    }
    return { orderReference: row.order_reference, fields };
  } catch {
    return null;
  }
}
