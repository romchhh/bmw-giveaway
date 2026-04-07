import { getGiveawayDb } from "@/lib/giveaway-db";
import { getWayforpayBridgeFormByToken } from "@/lib/giveaway-checkout";

export const dynamic = "force-dynamic";

const WAYFORPAY_PAY_URL = "https://secure.wayforpay.com/pay";

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const t = url.searchParams.get("t")?.trim();
  if (!t || !/^[0-9a-f]{64}$/i.test(t)) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const db = getGiveawayDb();
  const row = getWayforpayBridgeFormByToken(db, t);
  if (!row) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const inputs = Object.entries(row.fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escAttr(name)}" value="${escAttr(value)}">`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Перехід до оплати…</title>
</head>
<body>
<form id="wfp" method="post" action="${WAYFORPAY_PAY_URL}" accept-charset="UTF-8">
${inputs}
<noscript><p>Увімкни JavaScript або натисни кнопку нижче.</p><button type="submit">Оплатити</button></noscript>
</form>
<script>document.getElementById("wfp").submit();</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
