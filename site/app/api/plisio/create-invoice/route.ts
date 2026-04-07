import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      orderNumber,
      orderName,
      amount,
      email,
      callbackUrl,
      successCallbackUrl,
      failCallbackUrl,
    } = body;

    // Validate required fields
    if (!orderNumber || !orderName || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: orderNumber, orderName, amount" },
        { status: 400 }
      );
    }

    const apiKey = process.env.PLISIO_API_KEY;
    if (!apiKey) {
      console.error("[Plisio] Missing API key");
      return NextResponse.json(
        { error: "Payment gateway configuration error" },
        { status: 500 }
      );
    }

    // Build query parameters
    // Не вказуємо currency - дозволяємо вибір будь-якої доступної криптовалюти
    const params = new URLSearchParams({
      api_key: apiKey,
      order_number: String(orderNumber),
      order_name: orderName,
      source_currency: "USD",
      source_amount: String(amount),
      // Дозволяємо популярні криптовалюти (опціонально, можна прибрати для всіх доступних)
      // allowed_psys_cids: "BTC,ETH,USDT,USDC,LTC,BCH,XRP,DOGE,TRX,BNB,MATIC,ADA,SOL",
    });

    // Add optional parameters
    if (email) {
      params.append("email", email);
    }

    if (callbackUrl) {
      params.append("callback_url", callbackUrl);
    }

    if (successCallbackUrl) {
      params.append("success_callback_url", successCallbackUrl);
    }

    if (failCallbackUrl) {
      params.append("fail_callback_url", failCallbackUrl);
    }

    // Add json=true for JSON response in callbacks
    if (callbackUrl) {
      const callbackWithJson = callbackUrl.includes("?")
        ? `${callbackUrl}&json=true`
        : `${callbackUrl}?json=true`;
      params.set("callback_url", callbackWithJson);
    }

    // Create invoice via Plisio API
    const plisioUrl = `https://api.plisio.net/api/v1/invoices/new?${params.toString()}`;
    
    console.log("[Plisio] Creating invoice:", plisioUrl.replace(apiKey, "***"));

    const response = await fetch(plisioUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      console.error("[Plisio] Error creating invoice:", data);
      return NextResponse.json(
        {
          error: "Failed to create invoice",
          details: data.data?.message || "Unknown error",
        },
        { status: response.status || 500 }
      );
    }

    console.log("[Plisio] Invoice created successfully:", data.data.txn_id);

    return NextResponse.json({
      success: true,
      invoiceUrl: data.data.invoice_url,
      txnId: data.data.txn_id,
      invoiceData: data.data,
    });
  } catch (error) {
    console.error("[Plisio] Error creating invoice:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}

