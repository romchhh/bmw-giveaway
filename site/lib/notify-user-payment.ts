/**
 * Відправляє користувачу в Telegram повідомлення про успішну оплату
 * з кодами квитків, нагадуванням про репост та кнопками (мінідодаток, посилання на пост).
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyUserPaymentSuccess(params: {
  userId: number;
  tickets: { code: string }[];
  orderReference: string;
  provider: "wayforpay" | "plisio" | "test";
}): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.warn("[notifyUserPaymentSuccess] TELEGRAM_BOT_TOKEN missing");
    return;
  }

  const miniAppUrl =
    process.env.MINI_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_PUBLIC_URL?.trim() ||
    process.env.PUBLIC_URL?.trim() ||
    "";

  const repostPostUrl =
    process.env.GIVEAWAY_POST_URL?.trim() ||
    process.env.NEXT_PUBLIC_GIVEAWAY_POST_URL?.trim() ||
    "";

  const { userId, tickets } = params;

  const ticketWord =
    tickets.length === 1
      ? "квиток"
      : tickets.length >= 2 && tickets.length <= 4
        ? "квитки"
        : "квитків";

  const codesBlock = tickets
    .map((t) => `<code>${escapeHtml(t.code)}</code>`)
    .join("  ");

  const text =
    `🎉 <b>Оплата підтверджена!</b>\n\n` +
    `Ти придбав ${tickets.length} ${ticketWord} на розіграш <b>BMW M4</b>.\n\n` +
    `🎟 Тво${tickets.length === 1 ? "й код" : "ї коди"}:\n${codesBlock}\n\n` +
    `📢 <b>Репост анонсу</b>\n` +
    `Зроби репост посту про розіграш — це частина умов участі. ` +
    `Після репосту відкрий мінідодаток і натисни «Репост зробив», щоб ми це зафіксували.\n\n` +
    `Очікуй на розіграш — ми повідомимо переможця особисто. Удачі! 🍀`;

  const keyboardRows: { text: string; url?: string; web_app?: { url: string } }[][] = [];
  if (miniAppUrl) {
    keyboardRows.push([
      {
        text: "🎟 Відкрити мінідодаток",
        web_app: { url: miniAppUrl },
      },
    ]);
  }
  if (repostPostUrl) {
    keyboardRows.push([{ text: "Зробити репост", url: repostPostUrl }]);
  }

  const replyMarkup =
    keyboardRows.length > 0
      ? JSON.stringify({
          inline_keyboard: keyboardRows,
        })
      : undefined;

  const body: Record<string, unknown> = {
    chat_id: userId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(
        `[notifyUserPaymentSuccess] sendMessage failed user=${userId} status=${res.status}`,
        err.slice(0, 200),
      );
    }
  } catch (e) {
    console.error("[notifyUserPaymentSuccess] network error", e);
  }
}
