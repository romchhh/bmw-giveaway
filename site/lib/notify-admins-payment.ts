import type Database from "better-sqlite3";

export type PaymentNotifyProvider = "wayforpay" | "plisio" | "test";

export type PaymentNotifyPayload = {
  provider: PaymentNotifyProvider;
  userId: number;
  quantity: number;
  amountUsd: number;
  orderReference: string;
  /** Як показати суму в TG (WayForPay у тесті — UAH) */
  displayCurrency?: "USD" | "UAH";
  /** Рядок для адмінів: мережа/валюта Plisio, тощо */
  paymentMethodLine?: string;
};

/** Кількість квитків з цим order_reference до fulfill (для ідемпотентності webhook). */
export function countTicketsForOrderReference(
  db: Database.Database,
  orderReference: string,
): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM giveaway_tickets WHERE order_reference = ?")
    .get(orderReference) as { c: number } | undefined;
  return row?.c ?? 0;
}

/** Група для сповіщень про оплати (супергрупа має id з мінусом). */
const DEFAULT_PAYMENTS_NOTIFY_CHAT_ID = -1003622191100;

function getPaymentsNotifyChatId(): number {
  const raw = process.env.PAYMENTS_NOTIFY_CHAT_ID?.trim();
  if (!raw) return DEFAULT_PAYMENTS_NOTIFY_CHAT_ID;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULT_PAYMENTS_NOTIFY_CHAT_ID;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type BuyerRow = {
  user_name: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  user_phone: string | null;
  language: string | null;
};

function getBuyerRow(db: Database.Database, userId: number): BuyerRow | undefined {
  try {
    return db
      .prepare(
        `SELECT user_name, user_first_name, user_last_name, user_phone, language
         FROM users WHERE user_id = ? LIMIT 1`,
      )
      .get(String(userId)) as BuyerRow | undefined;
  } catch {
    return undefined;
  }
}

function kyivDateTimeLine(): string {
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

function defaultPaymentMethodLine(provider: PaymentNotifyProvider): string {
  if (provider === "wayforpay") return "Банківська картка (WayForPay)";
  if (provider === "plisio") return "Криптовалюта (Plisio)";
  return "Тест без реальної оплати";
}

/** Рядок для адмінів з полів callback Plisio (currency, psys_cid, source_*). */
export function formatPlisioPaymentMethodLine(
  body: Record<string, string | number | undefined>,
): string {
  const psys = String(body.psys_cid ?? "").trim();
  const currency = String(body.currency ?? "").trim();
  const srcCur = String(body.source_currency ?? "").trim();
  const srcAmt = String(body.source_amount ?? "").trim();
  const parts: string[] = ["Криптовалюта (Plisio)"];
  const details: string[] = [];
  if (psys) details.push(`мережа/PSYS: ${psys}`);
  if (currency) details.push(`інвойс: ${currency}`);
  if (srcAmt && srcCur) details.push(`сума в USD: ${srcAmt} ${srcCur}`);
  if (details.length) parts.push(details.join("; "));
  return parts.join(" — ");
}

/**
 * Надсилає повідомлення про оплату в Telegram-групу (за замовчуванням та сама, що в коді / PAYMENTS_NOTIFY_CHAT_ID).
 * Бот має бути в групі з правом надсилати повідомлення.
 * Помилки лише логуються — webhook не падає.
 */
export async function notifyAdminsNewPayment(
  db: Database.Database,
  payload: PaymentNotifyPayload,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.warn("[notifyAdminsNewPayment] TELEGRAM_BOT_TOKEN missing");
    return;
  }

  const chatId = getPaymentsNotifyChatId();

  const providerLabel =
    payload.provider === "wayforpay"
      ? "WayForPay"
      : payload.provider === "plisio"
        ? "Plisio"
        : "Тест (без платіжки)";

  const buyer = getBuyerRow(db, payload.userId);
  const fullName = [buyer?.user_first_name?.trim(), buyer?.user_last_name?.trim()]
    .filter(Boolean)
    .join(" ");
  const username = buyer?.user_name?.trim();
  const phone = buyer?.user_phone?.trim();
  const language = buyer?.language?.trim();

  const curr = payload.displayCurrency ?? "USD";
  const sumLine =
    curr === "UAH"
      ? `${payload.amountUsd.toFixed(2)} ₴`
      : `$${payload.amountUsd.toFixed(2)} USD`;

  const methodLine =
    payload.paymentMethodLine?.trim() || defaultPaymentMethodLine(payload.provider);

  const clientBlock =
    `👤 <b>Клієнт</b>\n` +
    `ID: <code>${payload.userId}</code>\n` +
    (fullName ? `Ім'я: ${escapeHtml(fullName)}\n` : `Ім'я: <i>немає в базі</i>\n`) +
    (username ? `Юзернейм: @${escapeHtml(username)}\n` : `Юзернейм: <i>немає в базі</i>\n`) +
    (phone ? `Телефон: <code>${escapeHtml(phone)}</code>\n` : "") +
    (language ? `Мова: ${escapeHtml(language)}\n` : "");

  const text =
    `💳 <b>Нова оплата квитків</b>\n\n` +
    `Провайдер: ${escapeHtml(providerLabel)}\n` +
    `Час (Київ): ${escapeHtml(kyivDateTimeLine())}\n\n` +
    clientBlock +
    `\n` +
    `Спосіб оплати: ${escapeHtml(methodLine)}\n` +
    `Кількість квитків: <b>${payload.quantity}</b>\n` +
    `Сума: ${sumLine}\n` +
    `Замовлення: <code>${escapeHtml(payload.orderReference)}</code>`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      `[notifyAdminsNewPayment] sendMessage failed chat_id=${chatId} status=${res.status}`,
      errText.slice(0, 200),
    );
  }
}
