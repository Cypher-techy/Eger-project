import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENVIRONMENTS: Record<string, string> = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke"
};

function timestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

async function getToken(base: string): Promise<string> {
  const key = process.env.MPESA_CONSUMER_KEY ?? process.env.DARAJA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET ?? process.env.DARAJA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error("Daraja credentials missing");
  const response = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
    signal: AbortSignal.timeout(15000), cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Daraja authentication failed");
  return data.access_token as string;
}

async function confirmWithSafaricom(checkoutRequestId: string) {
  const env = process.env.MPESA_ENVIRONMENT ?? process.env.DARAJA_ENVIRONMENT ?? "sandbox";
  const base = ENVIRONMENTS[env];
  const shortCode = process.env.MPESA_SHORTCODE ?? process.env.DARAJA_SHORTCODE;
  const passKey = process.env.MPESA_PASSKEY ?? process.env.DARAJA_PASSKEY;
  if (!base || !shortCode || !passKey) throw new Error("Daraja query configuration missing");
  const token = await getToken(base);
  const time = timestamp();
  const response = await fetch(`${base}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: shortCode,
      Password: Buffer.from(`${shortCode}${passKey}${time}`).toString("base64"),
      Timestamp: time,
      CheckoutRequestID: checkoutRequestId
    }),
    signal: AbortSignal.timeout(15000), cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok) throw new Error("Safaricom STK Query failed");
  return data;
}

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ status: "error", message: "Invalid callback body." }, { status: 400 });
  }
  const callback = body?.Body?.stkCallback;
  if (!callback || typeof callback.CheckoutRequestID !== "string" || !callback.CheckoutRequestID ||
      callback.ResultCode == null || !Number.isInteger(Number(callback.ResultCode))) {
    return NextResponse.json({ status: "error", message: "Invalid STK callback." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ status: "error", message: "Callback persistence is not configured." }, { status: 503 });
  const admin = createSupabaseAdmin(supabaseUrl, serviceKey);

  const { data: payment, error: lookupError } = await admin.from("mpesa_payments")
    .select("id,user_id,phone_e164,amount_kes,purpose,status,checkout_request_id")
    .eq("checkout_request_id", callback.CheckoutRequestID).maybeSingle();
  if (lookupError) {
    console.error("Payment lookup failed:", lookupError.message);
    return NextResponse.json({ status: "error", message: "Payment lookup failed." }, { status: 500 });
  }
  // A callback for an unrelated/old payment must not create a wallet credit or verify a user.
  if (!payment) return NextResponse.json({ ResultCode: 0, ResultDesc: "No matching pending payment" });

  const items = Array.isArray(callback.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : [];
  const metadata = Object.fromEntries(items.filter((item: any) => item && typeof item.Name === "string")
    .map((item: any) => [item.Name, item.Value ?? null]));
  const callbackCode = Number(callback.ResultCode);
  const callbackPhone = metadata.PhoneNumber == null ? null : String(metadata.PhoneNumber);
  const callbackAmount = metadata.Amount == null ? null : Number(metadata.Amount);
  const receipt = typeof metadata.MpesaReceiptNumber === "string" ? metadata.MpesaReceiptNumber : null;

  try {
    // Never use the public callback alone as proof: ask Safaricom for the checkout result too.
    const query = await confirmWithSafaricom(callback.CheckoutRequestID);
    const queryCode = Number(query.ResultCode);
    const queryDescription = String(query.ResultDesc || query.ResponseDescription || "");
    const successful = callbackCode === 0 && queryCode === 0 &&
      callbackAmount === 70 && payment.amount_kes === 70 &&
      callbackPhone === payment.phone_e164 && Boolean(receipt) &&
      queryDescription.toLowerCase().includes("success");

    if (!successful) {
      const isFailure = callbackCode !== 0;
      if (isFailure) {
        await admin.from("mpesa_payments").update({
          status: "failed", result_code: callbackCode,
          result_description: String(callback.ResultDesc || "M-Pesa payment was not completed"),
          raw_callback: body
        }).eq("id", payment.id).neq("status", "confirmed");
      }
      // If Safaricom is still processing, acknowledge the callback but do not verify the phone.
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Callback received; confirmation pending" });
    }

    const { data: current } = await admin.from("mpesa_payments").select("status").eq("id", payment.id).maybeSingle();
    if (current?.status === "confirmed") return NextResponse.json({ ResultCode: 0, ResultDesc: "Already processed" });

    // Mark the matching fee paid first; the unique checkout ID and status check make retries safe.
    const { error: paymentError } = await admin.from("mpesa_payments").update({
      status: "confirmed", result_code: 0,
      result_description: String(callback.ResultDesc || "Payment confirmed by Safaricom"),
      receipt_number: receipt, raw_callback: body, confirmed_at: new Date().toISOString()
    }).eq("id", payment.id).eq("status", "pending");
    if (paymentError) throw paymentError;

    const { error: profileError } = await admin.from("profiles").update({
      phone_e164: payment.phone_e164, phone_verified_at: new Date().toISOString()
    }).eq("id", payment.user_id);
    if (profileError) throw profileError;

    return NextResponse.json({ ResultCode: 0, ResultDesc: "Payment confirmed" });
  } catch (error) {
    console.error("Safaricom callback confirmation failed:", error instanceof Error ? error.message : "unknown error");
    // Return an error so Safaricom/reconciliation can retry; never mark verified on uncertainty.
    return NextResponse.json({ status: "error", message: "Payment confirmation is pending." }, { status: 500 });
  }
}