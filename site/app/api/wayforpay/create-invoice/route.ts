import { NextRequest, NextResponse } from "next/server";
import { generateInvoiceSignature } from "@/lib/wayforpay";

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
      serviceUrl,
      paymentSystems, // For installment options
      orderTimeout = 3600, // 1 hour default
      language = "UA",
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
    const publicUrl = process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_PUBLIC_URL || "http://localhost:3000";

    if (!merchantAccount || !merchantSecret) {
      console.error("[WayForPay Invoice] Missing merchant credentials");
      return NextResponse.json(
        { error: "Payment gateway configuration error" },
        { status: 500 }
      );
    }

    const orderDate = Math.floor(Date.now() / 1000);

    // Generate signature for invoice
    const merchantSignature = generateInvoiceSignature({
      merchantAccount,
      merchantDomainName,
      orderReference,
      orderDate,
      amount,
      currency,
      productName: productNames,
      productCount: productCounts,
      productPrice: productPrices,
      secretKey: merchantSecret,
    });

    // Prepare invoice data for CREATE_INVOICE API
    // WayForPay expects productName, productPrice, productCount as arrays (JSON format)
    // IMPORTANT: amount and productPrice must be sent as STRINGS with 2 decimal places for JSON API
    const invoiceData: Record<string, string | number | string[] | number[]> = {
      transactionType: "CREATE_INVOICE",
      merchantAccount,
      merchantAuthType: "SimpleSignature",
      merchantDomainName,
      merchantSignature,
      apiVersion: 1,
      language,
      orderReference,
      orderDate,
      amount: amount.toFixed(2), // Send as string "300.00"
      currency,
      orderTimeout,
      // Arrays must be sent as JSON arrays, not as indexed fields
      productName: productNames,
      productPrice: productPrices.map((p: number) => p.toFixed(2)), // Send as strings ["1000.00"]
      productCount: productCounts,
    };

    // Add customer info if provided
    if (customerName) {
      const nameParts = customerName.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        invoiceData.clientFirstName = nameParts[0];
        invoiceData.clientLastName = nameParts.slice(1).join(" ");
      } else {
        invoiceData.clientFirstName = customerName;
      }
    }

    if (customerEmail) {
      invoiceData.clientEmail = customerEmail;
    }

    if (customerPhone) {
      invoiceData.clientPhone = customerPhone;
    }

    if (serviceUrl) {
      invoiceData.serviceUrl = serviceUrl;
    } else {
      // Default service URL for webhooks
      invoiceData.serviceUrl = `${publicUrl}/api/wayforpay/webhook`;
    }

    // Add payment systems for installment
    if (paymentSystems) {
      invoiceData.paymentSystems = paymentSystems;
    }

    // Call WayForPay API to create invoice
    // WayForPay CREATE_INVOICE expects JSON format
    console.log("[WayForPay Invoice] Sending invoice data:", JSON.stringify(invoiceData, null, 2));

    const response = await fetch("https://api.wayforpay.com/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(invoiceData),
    });

    const result = await response.json();

    if (result.reasonCode === "Ok" || result.reasonCode === 1100) {
      return NextResponse.json({
        success: true,
        invoiceUrl: result.invoiceUrl,
        qrCode: result.qrCode,
        orderReference: result.orderReference || orderReference,
      });
    } else {
      console.error("[WayForPay Invoice] Error response:", result);
      return NextResponse.json(
        { 
          error: "Failed to create invoice",
          reason: result.reason,
          reasonCode: result.reasonCode,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[WayForPay Invoice] Error creating invoice:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}

