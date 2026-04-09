import { fulfillTicketsForUserDefaultDb } from "@/lib/fulfill-tickets";
import {
  getGiveawayDb,
  getGiveawayTotalCap,
  MAX_TICKETS_PER_USER,
} from "@/lib/giveaway-db";
import {
  getTelegramUserIdFromInitData,
  validateTelegramWebAppInitData,
} from "@/lib/telegram-init-data";
import { randomBytes } from "crypto";
import { notifyAdminsNewPayment } from "@/lib/notify-admins-payment";
import { notifyUserPaymentSuccess } from "@/lib/notify-user-payment";
import { getTicketPriceUsd } from "@/lib/giveaway-price";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.PAYMENT_TEST_MODE !== "true") {
    return Response.json({ error: "test_disabled" }, { status: 403 });
  }

  const initData = request.headers.get("x-telegram-init-data") ?? "";
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!initData || !token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!validateTelegramWebAppInitData(initData, token)) {
    return Response.json({ error: "invalid_init_data" }, { status: 401 });
  }
  const userId = getTelegramUserIdFromInitData(initData);
  if (userId == null) {
    return Response.json({ error: "no_user" }, { status: 401 });
  }

  let body: { quantity?: unknown };
  try {
    body = (await request.json()) as { quantity?: unknown };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const quantity = typeof body.quantity === "number" ? Math.floor(body.quantity) : NaN;
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_USER) {
    return Response.json({ error: "bad_quantity" }, { status: 400 });
  }

  const db = getGiveawayDb();
  const totalCap = getGiveawayTotalCap();
  const soldRow = db.prepare("SELECT COUNT(*) AS c FROM giveaway_tickets").get() as { c: number };
  const userRow = db
    .prepare("SELECT COUNT(*) AS c FROM giveaway_tickets WHERE user_id = ?")
    .get(userId) as { c: number };
  if (userRow.c + quantity > MAX_TICKETS_PER_USER) {
    return Response.json({ error: "user_cap" }, { status: 403 });
  }
  if (soldRow.c + quantity > totalCap) {
    return Response.json({ error: "pool_exhausted" }, { status: 403 });
  }

  const orderRef = `TEST${Date.now()}${randomBytes(3).toString("hex")}`;
  const result = fulfillTicketsForUserDefaultDb(userId, quantity, orderRef);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const amountUsd = quantity * getTicketPriceUsd();
  const settled = await Promise.allSettled([
    notifyAdminsNewPayment(db, {
      provider: "test",
      userId,
      quantity,
      amountUsd,
      orderReference: orderRef,
    }),
    notifyUserPaymentSuccess({
      userId,
      tickets: result.tickets,
      orderReference: orderRef,
      provider: "test",
    }),
  ]);
  settled.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[test-purchase] notify[${i === 0 ? "payments_group" : "user"}]`, r.reason);
    }
  });

  return Response.json({ tickets: result.tickets, count: userRow.c + quantity });
}
