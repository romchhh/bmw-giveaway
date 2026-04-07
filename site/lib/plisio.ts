import { createHmac, timingSafeEqual } from "crypto";

/**
 * Перевірка callback Plisio (verify_hash) при callback з `json=true`.
 * HMAC-SHA1(secretKey, JSON.stringify(body без verify_hash)) — як у прикладі Plisio для Node.js.
 */
export function verifyPlisioCallback(
  data: Record<string, string | number | undefined>,
  secretKey: string,
): boolean {
  const verifyHash = data.verify_hash;
  if (verifyHash == null || verifyHash === "") return false;

  const copy = { ...data };
  delete copy.verify_hash;

  const string = JSON.stringify(copy);
  const hash = createHmac("sha1", secretKey).update(string).digest("hex");

  const a = Buffer.from(hash.toLowerCase());
  const b = Buffer.from(String(verifyHash).toLowerCase());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type PlisioInvoiceResult =
  | { ok: true; invoiceUrl: string; txnId: string }
  | { ok: false; error: string };

/** Створення інвойсу Plisio (крипто). */
export async function createPlisioInvoice(params: {
  apiKey: string;
  orderNumber: string;
  orderName: string;
  amountUsd: number;
  callbackUrl: string;
  successCallbackUrl?: string;
  failCallbackUrl?: string;
}): Promise<PlisioInvoiceResult> {
  const callbackWithJson = params.callbackUrl.includes("?")
    ? `${params.callbackUrl}&json=true`
    : `${params.callbackUrl}?json=true`;

  const sp = new URLSearchParams({
    api_key: params.apiKey,
    order_number: params.orderNumber,
    order_name: params.orderName,
    source_currency: "USD",
    source_amount: String(params.amountUsd),
    callback_url: callbackWithJson,
  });
  if (params.successCallbackUrl) sp.append("success_callback_url", params.successCallbackUrl);
  if (params.failCallbackUrl) sp.append("fail_callback_url", params.failCallbackUrl);

  const url = `https://api.plisio.net/api/v1/invoices/new?${sp.toString()}`;
  const res = await fetch(url);
  const json = (await res.json()) as {
    status?: string;
    data?: { invoice_url?: string; txn_id?: string; message?: string };
  };

  if (!res.ok || json.status !== "success" || !json.data?.invoice_url) {
    const errMsg = json.data?.message ?? "Plisio API error";
    console.warn("[Plisio] create invoice failed", {
      httpStatus: res.status,
      apiStatus: json.status,
      order_number: params.orderNumber,
      source_amount_usd: params.amountUsd,
      message: errMsg,
    });
    return {
      ok: false,
      error: errMsg,
    };
  }

  const txnId = String(json.data.txn_id ?? "");
  console.log("[Plisio] invoice created (webhook буде на callback_url)", {
    order_number: params.orderNumber,
    txn_id: txnId,
    source_amount_usd: params.amountUsd,
    callback_url: callbackWithJson,
    invoice_url: json.data.invoice_url,
  });

  return {
    ok: true,
    invoiceUrl: json.data.invoice_url,
    txnId,
  };
}
