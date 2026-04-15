import hmac, hashlib, json, requests

SECRET_KEY = "igbgtIIsblFvy9XBWKRb8pGxnyknOAW33bFO1uNJOMainkB48gBwRK1mhTXUudAp"

data = {
    "amount": "0.00002842",
    "comment": "",
    "currency": "BTC",
    "ipn_type": "invoice",
    "merchant": "test",
    "merchant_id": "123",
    "order_name": "Test Order",
    "order_number": "GWPMNZZ8VZJA162C7CAFC",  # <-- заміни на свіжий
    "psys_cid": "BTC",
    "source_amount": "2",
    "source_currency": "USD",
    "source_rate": "0.00008525",
    "status": "completed",
    "txn_id": "69df78c2d31817513406b125",  # <-- заміни на свіжий
}

h = hmac.new(SECRET_KEY.encode(), json.dumps(data).encode(), hashlib.sha1).hexdigest()
data["verify_hash"] = h

r = requests.post(
    "https://bmw-giveaway.telebots.site/api/plisio/webhook?json=true",
    json=data,
)
print(r.status_code, r.text)