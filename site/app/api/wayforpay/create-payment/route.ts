import { NextRequest, NextResponse } from "next/server";
import { generatePurchaseSignature } from "@/lib/wayforpay";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      orderReference,
      amount,
      currency = "USD",
      productNames,
      productCounts,
      productPrices,
      customerName,
      customerEmail,
      customerPhone,
      returnUrl,
      serviceUrl,
    } = body;

    // Validate required fields
    if (
      !orderReference ||
      !amount ||
      !productNames?.length ||
      !productCounts?.length ||
      !productPrices?.length
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const merchantAccount = process.env.MERCHANT_ACCOUNT || process.env.WAYFORPAY_MERCHANT_ACCOUNT;
    const merchantSecret = process.env.MERCHANT_SECRET || process.env.WAYFORPAY_MERCHANT_SECRET;
    const merchantDomainName = process.env.MERCHANT_DOMAIN || process.env.WAYFORPAY_MERCHANT_DOMAIN || "13vplus.com";

    if (!merchantAccount || !merchantSecret) {
      console.error("[WayForPay] Missing merchant credentials");
      return NextResponse.json(
        { error: "Payment gateway configuration error" },
        { status: 500 }
      );
    }

    const orderDate = Math.floor(Date.now() / 1000);

    // Generate signature
    const merchantSignature = generatePurchaseSignature({
      merchantAccount,
      merchantDomainName,
      orderReference,
      orderDate,
      amount,
      currency,
      productNames,
      productCounts,
      productPrices,
      secretKey: merchantSecret,
    });

    // Prepare payment data
    const paymentData: Record<string, string | number> = {
      merchantAccount,
      merchantDomainName,
      merchantTransactionType: "AUTO",
      merchantTransactionSecureType: "AUTO",
      merchantSignature,
      apiVersion: 1,
      language: "UA",
      orderReference,
      orderDate,
      amount: amount.toFixed(2),
      currency,
    };

    // Add product arrays
    productNames.forEach((name: string, index: number) => {
      paymentData[`productName[${index}]`] = name;
      paymentData[`productCount[${index}]`] = productCounts[index];
      paymentData[`productPrice[${index}]`] = productPrices[index].toFixed(2);
    });

    // Add customer info if provided
    if (customerName) {
      const nameParts = customerName.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        paymentData.clientFirstName = nameParts[0];
        paymentData.clientLastName = nameParts.slice(1).join(" ");
      } else {
        paymentData.clientFirstName = customerName;
      }
    }

    if (customerEmail) {
      paymentData.clientEmail = customerEmail;
    }

    if (customerPhone) {
      paymentData.clientPhone = customerPhone;
    }

    if (returnUrl) {
      paymentData.returnUrl = returnUrl;
    }

    if (serviceUrl) {
      paymentData.serviceUrl = serviceUrl;
    }

    // Return payment form data
    return NextResponse.json({
      success: true,
      paymentUrl: "https://secure.wayforpay.com/pay",
      paymentData,
    });
  } catch (error) {
    console.error("[WayForPay] Error creating payment:", error);
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}

