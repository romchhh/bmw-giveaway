import { createHmac, timingSafeEqual } from "crypto";

function hmacMd5Hex(secretKey: string, message: string): string {
  return createHmac("md5", secretKey).update(message, "utf8").digest("hex");
}

export function generatePurchaseSignature(params: {
  merchantAccount: string;
  merchantDomainName: string;
  orderReference: string;
  orderDate: number;
  amount: number;
  currency: string;
  productNames: string[];
  productCounts: number[];
  productPrices: number[];
  secretKey: string;
}): string {
  const parts = [
    params.merchantAccount,
    params.merchantDomainName,
    params.orderReference,
    String(params.orderDate),
    params.amount.toFixed(2),
    params.currency,
    ...params.productNames,
    ...params.productCounts.map(String),
    ...params.productPrices.map((p) => p.toFixed(2)),
  ];
  return hmacMd5Hex(params.secretKey, parts.join(";"));
}

export function generateInvoiceSignature(params: {
  merchantAccount: string;
  merchantDomainName: string;
  orderReference: string;
  orderDate: number;
  amount: number;
  currency: string;
  productName: string[];
  productCount: number[];
  productPrice: number[];
  secretKey: string;
}): string {
  const parts = [
    params.merchantAccount,
    params.merchantDomainName,
    params.orderReference,
    String(params.orderDate),
    params.amount.toFixed(2),
    params.currency,
    ...params.productName,
    ...params.productCount.map(String),
    ...params.productPrice.map((p) => p.toFixed(2)),
  ];
  return hmacMd5Hex(params.secretKey, parts.join(";"));
}

/** Перевірка підпису callback WayForPay (Purchase). */
export function verifyWebhookSignature(params: {
  merchantAccount: string;
  orderReference: string;
  amount: number;
  currency: string;
  authCode: string;
  cardPan: string;
  transactionStatus: string;
  reasonCode: number;
  secretKey: string;
  receivedSignature: string;
}): boolean {
  const parts = [
    params.merchantAccount,
    params.orderReference,
    params.amount.toFixed(2),
    params.currency,
    params.authCode,
    params.cardPan,
    params.transactionStatus,
    String(params.reasonCode),
  ];
  const calc = hmacMd5Hex(params.secretKey, parts.join(";"));
  const recv = params.receivedSignature.toLowerCase();
  try {
    return timingSafeEqual(Buffer.from(calc), Buffer.from(recv));
  } catch {
    return calc === recv;
  }
}

export function generateWebhookResponseSignature(params: {
  orderReference: string;
  status: string;
  time: number;
  secretKey: string;
}): string {
  const msg = [params.orderReference, params.status, String(params.time)].join(";");
  return hmacMd5Hex(params.secretKey, msg);
}
