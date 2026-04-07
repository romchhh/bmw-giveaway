import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WayForPay returnUrl — може GET або POST сюди після оплати.
 * Перенаправляємо на сторінку успішної оплати.
 */
function redirect(req: NextRequest) {
  const base = req.nextUrl.origin;
  return NextResponse.redirect(`${base}/payment-success`, { status: 302 });
}

export async function GET(req: NextRequest) {
  return redirect(req);
}

export async function POST(req: NextRequest) {
  return redirect(req);
}
