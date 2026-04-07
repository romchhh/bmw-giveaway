import { NextResponse } from "next/server";

/**
 * Пряма видача квитків без оплати вимкнена.
 * Використовуйте POST /api/tickets/checkout (WayForPay / Plisio) або тестовий режим.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "use_checkout",
      message: "Оплата лише через WayForPay або Plisio (POST /api/tickets/checkout). Для тестів — PAYMENT_TEST_MODE=true та POST /api/tickets/test-purchase",
    },
    { status: 410 },
  );
}
