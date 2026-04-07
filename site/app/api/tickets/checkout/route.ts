import { getTicketPriceUsd } from "@/lib/giveaway-price";
import { getGiveawayDb, getGiveawayTotalCap, MAX_TICKETS_PER_USER } from "@/lib/giveaway-db";
import { randomBytes } from "crypto";
import {
  generateOrderReference,
  insertPendingCheckout,
  saveWayforpayBridgeForm,
} from "@/lib/giveaway-checkout";
import { createPlisioInvoice } from "@/lib/plisio";
import { generatePurchaseSignature } from "@/lib/wayforpay";
import {
  isPaymentTestMode,
  TEST_CHECKOUT_PLISIO_USD,
  TEST_CHECKOUT_WAYFORPAY_UAH,
} from "@/lib/payment-test-mode";
import {
  getTelegramUserIdFromInitData,
  validateTelegramWebAppInitData,
} from "@/lib/telegram-init-data";

function publicBaseUrl(): string {
  const u =
    process.env.PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_PUBLIC_URL?.trim() ||
    "http://localhost:3000";
  return u.replace(/\/$/, "");
}

function merchantDomainName(): string {
  const d =
    process.env.MERCHANT_DOMAIN?.trim() ||
    process.env.WAYFORPAY_MERCHANT_DOMAIN?.trim();
  if (d) return d;
  try {
    return new URL(publicBaseUrl()).hostname || "localhost";
  } catch {
    return "localhost";
  }
}

export async function POST(request: Request) {
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

  let body: { quantity?: unknown; provider?: unknown };
  try {
    body = (await request.json()) as { quantity?: unknown; provider?: unknown };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  const quantity = typeof body.quantity === "number" ? Math.floor(body.quantity) : NaN;
  const provider = body.provider === "plisio" ? "plisio" : body.provider === "wayforpay" ? "wayforpay" : null;

  if (!provider) {
    return Response.json({ error: "bad_provider" }, { status: 400 });
  }
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
    return Response.json(
      { error: "user_cap", max: MAX_TICKETS_PER_USER, current: userRow.c },
      { status: 403 },
    );
  }
  if (soldRow.c + quantity > totalCap) {
    return Response.json({ error: "pool_exhausted", total: totalCap, sold: soldRow.c }, { status: 403 });
  }

  const paymentTestMode = isPaymentTestMode();
  const unit = getTicketPriceUsd();
  const fullOrderUsd = Math.round(unit * quantity * 100) / 100;

  const orderReference = generateOrderReference();
  const base = publicBaseUrl();

  const productNames = ["Квиток розіграшу BMW"];

  if (provider === "plisio") {
    const chargeStored = paymentTestMode ? TEST_CHECKOUT_PLISIO_USD : fullOrderUsd;

    insertPendingCheckout(db, {
      orderReference,
      userId,
      quantity,
      amountUsd: chargeStored,
      provider,
    });

    const apiKey = process.env.PLISIO_API_KEY?.trim();
    if (!apiKey) {
      return Response.json({ error: "plisio_not_configured" }, { status: 500 });
    }
    let inv;
    try {
      inv = await createPlisioInvoice({
        apiKey,
        orderNumber: orderReference,
        orderName: `BMW M4 — ${quantity} квитк.`,
        amountUsd: chargeStored,
        callbackUrl: `${base}/api/plisio/webhook`,
        successCallbackUrl: `${base}/payment-success`,
        failCallbackUrl: `${base}/payment-success`,
      });
    } catch {
      db.prepare("DELETE FROM giveaway_checkouts WHERE order_reference = ?").run(orderReference);
      return Response.json({ error: "plisio_invoice_failed", details: "network" }, { status: 502 });
    }
    if (!inv.ok) {
      db.prepare("DELETE FROM giveaway_checkouts WHERE order_reference = ?").run(orderReference);
      return Response.json({ error: "plisio_invoice_failed", details: inv.error }, { status: 502 });
    }
    console.log("[Plisio Checkout] pending checkout + invoice", {
      orderReference,
      txnId: inv.txnId,
      userId,
      quantity,
      amountUsd: chargeStored,
      paymentTestMode,
      webhookExpected: `${base}/api/plisio/webhook`,
    });
    return Response.json({
      provider: "plisio",
      orderReference,
      invoiceUrl: inv.invoiceUrl,
      amountUsd: chargeStored,
      quantity,
      paymentTestMode,
    });
  }

  const merchantAccount =
    process.env.MERCHANT_ACCOUNT?.trim() ||
    process.env.WAYFORPAY_MERCHANT_ACCOUNT?.trim() ||
    "";
  const merchantSecret =
    process.env.MERCHANT_SECRET?.trim() ||
    process.env.WAYFORPAY_MERCHANT_SECRET?.trim() ||
    "";

  if (!merchantAccount || !merchantSecret) {
    return Response.json({ error: "wayforpay_not_configured" }, { status: 500 });
  }

  let wayforpayCurrency: "USD" | "UAH" = "USD";
  let orderAmount: number;
  let productCounts: number[];
  let productPrices: number[];
  let chargeStored: number;

  if (paymentTestMode) {
    wayforpayCurrency = "UAH";
    orderAmount = TEST_CHECKOUT_WAYFORPAY_UAH;
    productCounts = [1];
    productPrices = [TEST_CHECKOUT_WAYFORPAY_UAH];
    chargeStored = TEST_CHECKOUT_WAYFORPAY_UAH;
  } else {
    orderAmount = fullOrderUsd;
    productCounts = [quantity];
    productPrices = [unit];
    chargeStored = fullOrderUsd;
  }

  insertPendingCheckout(db, {
    orderReference,
    userId,
    quantity,
    amountUsd: chargeStored,
    provider,
  });

  const orderDate = Math.floor(Date.now() / 1000);

  const merchantSignature = generatePurchaseSignature({
    merchantAccount,
    merchantDomainName: merchantDomainName(),
    orderReference,
    orderDate,
    amount: orderAmount,
    currency: wayforpayCurrency,
    productNames,
    productCounts,
    productPrices,
    secretKey: merchantSecret,
  });

  const paymentData: Record<string, string | number> = {
    merchantAccount,
    merchantDomainName: merchantDomainName(),
    merchantTransactionType: "AUTO",
    merchantTransactionSecureType: "AUTO",
    merchantSignature,
    apiVersion: 1,
    language: "UA",
    orderReference,
    orderDate,
    amount: orderAmount.toFixed(2),
    currency: wayforpayCurrency,
  };
  paymentData["productName[0]"] = productNames[0];
  paymentData["productCount[0]"] = productCounts[0];
  paymentData["productPrice[0]"] = productPrices[0].toFixed(2);
  paymentData.returnUrl = `${base}/payment-success`;
  paymentData.serviceUrl = `${base}/api/wayforpay/webhook`;

  const bridgeToken = randomBytes(32).toString("hex");
  saveWayforpayBridgeForm(db, orderReference, bridgeToken, JSON.stringify(paymentData));
  const wayforpayOpenUrl = `${base}/api/wayforpay/bridge?t=${encodeURIComponent(bridgeToken)}`;

  return Response.json({
    provider: "wayforpay",
    orderReference,
    wayforpayOpenUrl,
    amountUsd: chargeStored,
    currency: wayforpayCurrency,
    quantity,
    paymentTestMode,
  });
}
