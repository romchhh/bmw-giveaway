/** Ціна одного квитка в USD (WayForPay / Plisio). */
export function getTicketPriceUsd(): number {
  const raw =
    process.env.TICKET_PRICE_USD ?? process.env.NEXT_PUBLIC_TICKET_PRICE_USD ?? "99";
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 99;
}
