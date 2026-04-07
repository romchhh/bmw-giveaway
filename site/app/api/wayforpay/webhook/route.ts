import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  generateWebhookResponseSignature,
} from "@/lib/wayforpay";
import { getGiveawayDb } from "@/lib/giveaway-db";
import { getPendingCheckout, markCheckoutPaid } from "@/lib/giveaway-checkout";
import { fulfillTicketsForUser } from "@/lib/fulfill-tickets";
import {
  countTicketsForOrderReference,
  notifyAdminsNewPayment,
} from "@/lib/notify-admins-payment";
import { isPaymentTestMode } from "@/lib/payment-test-mode";
import { notifyUserPaymentSuccess } from "@/lib/notify-user-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  let orderReference = "unknown";

  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const formData = await req.formData();
      const formEntries: Record<string, unknown> = {};
      let jsonParsed = false;
      for (const [key, value] of formData.entries()) {
        const stringValue = value instanceof File ? undefined : String(value);
        if (key.trim().startsWith("{")) {
          try {
            Object.assign(formEntries, JSON.parse(key));
            jsonParsed = true;
            break;
          } catch {
            /* continue */
          }
        }
        if (!jsonParsed && stringValue?.trim().startsWith("{")) {
          try {
            Object.assign(formEntries, JSON.parse(stringValue));
            jsonParsed = true;
            break;
          } catch {
            /* continue */
          }
        }
        if (stringValue !== undefined && !jsonParsed) {
          formEntries[key] = stringValue;
        }
      }
      body = formEntries;
    }

    if (body.amount != null) {
      body.amount =
        typeof body.amount === "string" ? parseFloat(body.amount) : Number(body.amount);
    }
    if (body.reasonCode != null) {
      body.reasonCode =
        typeof body.reasonCode === "string"
          ? parseInt(body.reasonCode, 10)
          : Number(body.reasonCode);
    }

    orderReference = String(body.orderReference || "unknown");
    const merchantAccount = String(body.merchantAccount || "");
    const merchantSignature = String(body.merchantSignature || "");
    const amount = body.amount as number;
    const currency = String(body.currency || "USD");
    const authCode = String(body.authCode || "");
    const cardPan = String(body.cardPan || "");
    const transactionStatus = String(body.transactionStatus || "");
    const reasonCode = (body.reasonCode as number) || 0;

    if (!merchantAccount || !orderReference || !merchantSignature || !transactionStatus) {
      return NextResponse.json({ error: "missing" }, { status: 400 });
    }

    const merchantSecret =
      process.env.MERCHANT_SECRET?.trim() ||
      process.env.WAYFORPAY_MERCHANT_SECRET?.trim() ||
      "";

    if (!merchantSecret) {
      return NextResponse.json({ error: "config" }, { status: 500 });
    }

    const amountNum = Number.isFinite(amount) ? amount : 0;
    const isValid = verifyWebhookSignature({
      merchantAccount,
      orderReference,
      amount: amountNum,
      currency,
      authCode,
      cardPan,
      transactionStatus,
      reasonCode,
      secretKey: merchantSecret,
      receivedSignature: merchantSignature,
    });

    if (!isValid && transactionStatus !== "Approved") {
      return NextResponse.json({ error: "signature" }, { status: 400 });
    }

    if (transactionStatus === "Approved") {
      const db = getGiveawayDb();
      const row = getPendingCheckout(db, orderReference);
      if (row && row.status === "pending" && row.provider === "wayforpay") {
        const expected = Number(row.amount_usd);
        if (Math.abs(amountNum - expected) > 0.05) {
          console.warn(
            `[WayForPay Webhook] amount mismatch order ${orderReference}: got ${amountNum} expected ${expected}`,
          );
        }
        const beforeTickets = countTicketsForOrderReference(db, orderReference);
        const result = fulfillTicketsForUser(db, row.user_id, row.quantity, orderReference);
        if (result.ok) {
          markCheckoutPaid(db, orderReference);
          console.log(
            `[WayForPay Webhook] fulfilled ${row.quantity} tickets for user ${row.user_id}`,
          );
          if (beforeTickets === 0) {
            void notifyAdminsNewPayment(db, {
              provider: "wayforpay",
              userId: row.user_id,
              quantity: row.quantity,
              amountUsd: row.amount_usd,
              orderReference,
              displayCurrency: isPaymentTestMode() ? "UAH" : "USD",
            }).catch((e) => console.error("[WayForPay Webhook] admin notify", e));
            void notifyUserPaymentSuccess({
              userId: row.user_id,
              tickets: result.tickets,
              orderReference,
              provider: "wayforpay",
            }).catch((e) => console.error("[WayForPay Webhook] user notify", e));
          }
        } else {
          console.error("[WayForPay Webhook] fulfill failed:", result.error);
        }
      } else {
        console.warn(`[WayForPay Webhook] no pending checkout for ${orderReference}`);
      }
    }

    const responseTime = Math.floor(Date.now() / 1000);
    const responseStatus = transactionStatus === "Approved" ? "accept" : "decline";
    const responseSignature = generateWebhookResponseSignature({
      orderReference,
      status: responseStatus,
      time: responseTime,
      secretKey: merchantSecret,
    });

    return NextResponse.json(
      {
        orderReference,
        status: responseStatus,
        time: responseTime,
        signature: responseSignature,
      },
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[WayForPay Webhook]", error);
    const responseTime = Math.floor(Date.now() / 1000);
    const merchantSecret =
      process.env.MERCHANT_SECRET?.trim() ||
      process.env.WAYFORPAY_MERCHANT_SECRET?.trim() ||
      "";
    const responseSignature = generateWebhookResponseSignature({
      orderReference,
      status: "decline",
      time: responseTime,
      secretKey: merchantSecret,
    });
    return NextResponse.json(
      {
        orderReference,
        status: "decline",
        time: responseTime,
        signature: responseSignature,
      },
      { status: 200 },
    );
  }
}
