/** PAYMENT_TEST_MODE=true — реальні платіжки з мінімальними сумами для тестів */
export function isPaymentTestMode(): boolean {
  return process.env.PAYMENT_TEST_MODE === "true";
}

/** WayForPay: сума замовлення в UAH */
export const TEST_CHECKOUT_WAYFORPAY_UAH = 1;

/**
 * Plisio: сума інвойсу в USD (тест).
 * Менші суми часто падають на мережах на кшталт USDC_BSC (мінімум ≈ 1 USDC після конвертації).
 */
export const TEST_CHECKOUT_PLISIO_USD = 2;
