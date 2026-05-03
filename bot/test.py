import hashlib
import hmac
import time
import json
import requests
import urllib.parse

MERCHANT_ACCOUNT = "t_me_b6362"
MERCHANT_SECRET = "d89f33f8c9209c665f56654eafcc1da224feb857"
WAYFORPAY_API_URL = "https://api.wayforpay.com/api"


def generate_signature(params: list, secret: str) -> str:
    sign_string = ";".join(str(p) for p in params)
    return hmac.new(
        secret.encode("utf-8"),
        sign_string.encode("utf-8"),
        hashlib.md5
    ).hexdigest()


def create_payment(
    order_reference: str,
    amount: float,
    currency: str = "UAH",
    product_name: str = "Товар",
    product_price: float = None,
    product_count: int = 1,
    client_email: str = "",
    client_phone: str = "",
    domain: str = "https://example.com",
) -> str:
    """
    Створює рахунок через API WayForPay.
    Повертає пряме посилання invoiceUrl.
    """
    if product_price is None:
        product_price = amount

    order_date = int(time.time())

    sign_params = [
        MERCHANT_ACCOUNT,
        domain,
        order_reference,
        order_date,
        amount,
        currency,
        product_name,
        product_count,
        product_price,
    ]

    signature = generate_signature(sign_params, MERCHANT_SECRET)

    payload = {
        "transactionType": "CREATE_INVOICE",
        "merchantAccount": MERCHANT_ACCOUNT,
        "merchantDomainName": domain,
        "merchantSignature": signature,
        "apiVersion": 1,
        "orderReference": order_reference,
        "orderDate": order_date,
        "amount": amount,
        "currency": currency,
        "productName": [product_name],
        "productPrice": [product_price],
        "productCount": [product_count],
        "clientEmail": client_email,
        "clientPhone": client_phone,
    }

    response = requests.post(WAYFORPAY_API_URL, json=payload)
    data = response.json()

    print("Відповідь API:", json.dumps(data, ensure_ascii=False, indent=2))

    if data.get("reasonCode") == 1100:
        return data["invoiceUrl"]
    else:
        raise Exception(f"WayForPay помилка: {data.get('reason')} (код {data.get('reasonCode')})")


def verify_callback(callback_data: dict) -> bool:
    """Перевіряє підпис вхідного callback від WayForPay."""
    sign_params = [
        callback_data.get("merchantAccount", ""),
        callback_data.get("orderReference", ""),
        callback_data.get("amount", ""),
        callback_data.get("currency", ""),
        callback_data.get("authCode", ""),
        callback_data.get("cardPan", ""),
        callback_data.get("transactionStatus", ""),
        callback_data.get("reasonCode", ""),
    ]
    expected = generate_signature(sign_params, MERCHANT_SECRET)
    return expected == callback_data.get("merchantSignature", "")


def confirm_callback(order_reference: str, status: str = "accept") -> dict:
    """Формує відповідь на callback (відправити назад до WayForPay)."""
    now = int(time.time())
    signature = generate_signature([order_reference, status, now], MERCHANT_SECRET)
    return {
        "orderReference": order_reference,
        "status": status,
        "time": now,
        "signature": signature,
    }


# ──────────────── Запуск ────────────────

if __name__ == "__main__":
    order_ref = f"ORDER_{int(time.time())}"

    try:
        url = create_payment(
            order_reference=order_ref,
            amount=199.00,
            currency="UAH",
            product_name="Підписка Premium",
            product_price=199.00,
            client_email="user@example.com",
            client_phone="+380991234567",
            domain="https://example.com",
        )
        print(f"\n✅ Посилання на оплату:\n{url}")

    except Exception as e:
        print(f"\n❌ Помилка: {e}")