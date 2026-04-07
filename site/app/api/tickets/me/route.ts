import { getGiveawayDb } from "@/lib/giveaway-db";
import {
  getTelegramUserIdFromInitData,
  validateTelegramWebAppInitData,
} from "@/lib/telegram-init-data";

export async function GET(request: Request) {
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

  const db = getGiveawayDb();
  const rows = db
    .prepare(
      "SELECT code, created_at AS createdAt FROM giveaway_tickets WHERE user_id = ? ORDER BY id ASC",
    )
    .all(userId) as { code: string; createdAt: string }[];

  return Response.json({ tickets: rows, count: rows.length });
}
