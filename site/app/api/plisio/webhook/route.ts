import { NextRequest, NextResponse } from "next/server";
import { verifyPlisioCallback } from "@/lib/plisio";
import { getGiveawayDb } from "@/lib/giveaway-db";
import { getPendingCheckout, markCheckoutPaid } from "@/lib/giveaway-checkout";
import { fulfillTicketsForUser } from "@/lib/fulfill-tickets";
import {
  countTicketsForOrderReference,
  formatPlisioPaymentMethodLine,
  notifyAdminsNewPayment,
} from "@/lib/notify-admins-payment";
import { notifyUserPaymentSuccess } from "@/lib/notify-user-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let body: Record<string, string | number | undefined>;

    if (contentType.includes("application/json")) {
      body = (await req.json()) as Record<string, string | number | undefined>;
    } else {
      const formData = await req.formData();
      body = {};
      formData.forEach((value, key) => {
        body[key] = value instanceof File ? undefined : String(value);
      });
    }

    console.log("[Plisio Webhook] incoming", {
      contentType,
      status: body.status,
      order_number: body.order_number,
      txn_id: body.txn_id,
      keys: Object.keys(body).sort(),
    });

    const secretKey = process.env.PLISIO_API_KEY?.trim();
    if (!secretKey) {
      return NextResponse.json({ error: "config" }, { status: 500 });
    }

    if (!verifyPlisioCallback(body, secretKey)) {
      console.error("[Plisio Webhook] invalid signature");
      return NextResponse.json({ error: "bad_signature" }, { status: 400 });
    }

    console.log("[Plisio Webhook] signature ok", {
      status: body.status,
      order_number: body.order_number,
      txn_id: body.txn_id,
    });

    const status = String(body.status ?? "");
    const orderNumber = String(body.order_number ?? "");

    if (status === "completed" && orderNumber) {
      const db = getGiveawayDb();
      const row = getPendingCheckout(db, orderNumber);
      if (row && row.status === "pending" && row.provider === "plisio") {
        const beforeTickets = countTicketsForOrderReference(db, orderNumber);
        const result = fulfillTicketsForUser(db, row.user_id, row.quantity, orderNumber);
        if (result.ok) {
          markCheckoutPaid(db, orderNumber);
          console.log(`[Plisio Webhook] fulfilled ${row.quantity} tickets for user ${row.user_id}`);
          if (beforeTickets === 0) {
            void notifyAdminsNewPayment(db, {
              provider: "plisio",
              userId: row.user_id,
              quantity: row.quantity,
              amountUsd: row.amount_usd,
              orderReference: orderNumber,
              paymentMethodLine: formatPlisioPaymentMethodLine(body),
            }).catch((e) => console.error("[Plisio Webhook] admin notify", e));
            void notifyUserPaymentSuccess({
              userId: row.user_id,
              tickets: result.tickets,
              orderReference: orderNumber,
              provider: "plisio",
            }).catch((e) => console.error("[Plisio Webhook] user notify", e));
          }
        } else {
          console.error("[Plisio Webhook] fulfill failed:", result.error);
        }
      } else if (orderNumber) {
        console.warn("[Plisio Webhook] no pending checkout for", orderNumber);
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (e) {
    console.error("[Plisio Webhook]", e);
    return NextResponse.json({ error: "fail" }, { status: 500 });
  }
}
