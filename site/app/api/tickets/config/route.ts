import { getTicketPriceUsd } from "@/lib/giveaway-price";
import {
  isPaymentTestMode,
  TEST_CHECKOUT_PLISIO_USD,
  TEST_CHECKOUT_WAYFORPAY_UAH,
} from "@/lib/payment-test-mode";

export async function GET() {
  const paymentTestMode = isPaymentTestMode();
  return Response.json({
    ticketPriceUsd: getTicketPriceUsd(),
    paymentTestMode,
    ...(paymentTestMode
      ? {
          testCheckoutWayforpayUah: TEST_CHECKOUT_WAYFORPAY_UAH,
          testCheckoutPlisioUsd: TEST_CHECKOUT_PLISIO_USD,
        }
      : {}),
  });
}
