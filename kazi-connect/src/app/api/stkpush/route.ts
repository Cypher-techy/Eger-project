import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENVIRONMENTS: Record<string, string> = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke"
};

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[\s()-]/g, "");
  const normalized = phone.replace(/^\+/, "").replace(/^0/, "254");
  return /^254[17]\d{8}$/.test(normalized) ? normalized : null;
}

function timestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
}

function getConfig() {
  const env = process.env;
  const key = env.MPESA_CONSUMER_KEY ?? env.DARAJA_CONSUMER_KEY;
  const secret = env.MPESA_CONSUMER_SECRET ?? env.DARAJA_CONSUMER_SECRET;
  const shortCode = env.MPESA_SHORTCODE ?? env.DARAJA_SHORTCODE;
  const passKey = env.MPESA_PASSKEY ?? env.DARAJA_PASSKEY;
  const callbackUrl = env.MPESA_CALLBACK_URL;
  const environment = env.MPESA_ENVIRONMENT ?? env.DARAJA_ENVIRONMENT ?? "sandbox";
  const enabled = env.MPESA_ENABLED ?? "true";
  const transactionType = env.MPESA_TRANSACTION_TYPE ?? "CustomerBuyGoodsOnline";
  const partyB = env.MPESA_PARTY_B ?? (transactionType === "CustomerPayBillOnline" ? shortCode : undefined);
  return { key, secret, shortCode, passKey, callbackUrl, environment, enabled, transactionType, partyB };
}

async function darajaToken(base: string, key: string, secret: string): Promise<string> {
  const response = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
    signal: AbortSignal.timeout(15000), cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Daraja authentication failed");
  return data.access_token as string;
}

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", message: "Sign in before verifying your phone." }, { status: 401 });

  let body: { phone?: unknown; consent?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ status: "error", message: "Invalid request body." }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ status: "error", message: "Please confirm you understand the KSh 70 verification charge." }, { status: 400 });
  }
  const phone = normalizePhone(body.phone);
  if (!phone) return NextResponse.json({ status: "error", message: "Enter a valid Kenyan mobile number." }, { status: 400 });

  const cfg = getConfig();
  if (cfg.enabled === "false") return NextResponse.json({ status: "error", message: "M-Pesa payments are disabled." }, { status: 503 });
  let validCallback = false;
  try {
    const url = new URL(cfg.callbackUrl || "");
    validCallback = url.protocol === "https:" && !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch { /* invalid callback URL */ }
  if (cfg.enabled !== "true" || !cfg.key || !cfg.secret || !cfg.shortCode || !cfg.passKey ||
      !cfg.partyB || !validCallback || !ENVIRONMENTS[cfg.environment] ||
      !["CustomerPayBillOnline", "CustomerBuyGoodsOnline"].includes(cfg.transactionType)) {
    console.error("Missing or invalid Daraja configuration");
    return NextResponse.json({ status: "error", message: "M-Pesa is not configured yet." }, { status: 503 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ status: "error", message: "Payment storage is not configured." }, { status: 503 });
  const admin = createSupabaseAdmin(supabaseUrl, serviceKey);

  const { data: existing } = await admin.from("profiles").select("phone_verified_at").eq("id", user.id).maybeSingle();
  if (existing?.phone_verified_at) {
    return NextResponse.json({ status: "error", message: "Your account is already phone-verified." }, { status: 409 });
  }

  // Avoid multiple concurrent fee requests for the same account.
  const { data: pending } = await admin.from("mpesa_payments").select("id,created_at,status")
    .eq("user_id", user.id).eq("purpose", "phone_verification").in("status", ["initiated", "pending"])
    .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString()).limit(1);
  if (pending?.length) {
    return NextResponse.json({ status: "error", message: "A verification payment is already pending. Check your phone or wait for its result." }, { status: 409 });
  }

  let paymentId: string | undefined;
  try {
    const { data: payment, error: insertError } = await admin.from("mpesa_payments").insert({
      user_id: user.id, phone_e164: phone, amount_kes: 70, purpose: "phone_verification", status: "initiated"
    }).select("id").single();
    if (insertError) throw insertError;
    paymentId = payment.id;

    const base = ENVIRONMENTS[cfg.environment];
    const token = await darajaToken(base, cfg.key, cfg.secret);
    const time = timestamp();
    const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: cfg.shortCode,
        Password: Buffer.from(`${cfg.shortCode}${cfg.passKey}${time}`).toString("base64"),
        Timestamp: time,
        TransactionType: cfg.transactionType,
        Amount: 70,
        PartyA: phone,
        PartyB: cfg.partyB,
        PhoneNumber: phone,
        CallBackURL: cfg.callbackUrl,
        AccountReference: "KAZIMASHINANI",
        TransactionDesc: "Phone verification fee"
      }),
      signal: AbortSignal.timeout(15000), cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok || String(data.ResponseCode) !== "0" || !data.CheckoutRequestID) {
      await admin.from("mpesa_payments").update({
        status: "failed", result_description: String(data.errorMessage || data.ResponseDescription || "STK Push rejected")
      }).eq("id", paymentId);
      return NextResponse.json({ status: "error", message: data.errorMessage || data.ResponseDescription || "M-Pesa rejected the request." }, { status: 502 });
    }
    const { error: updateError } = await admin.from("mpesa_payments").update({
      status: "pending", checkout_request_id: data.CheckoutRequestID, merchant_request_id: data.MerchantRequestID || null
    }).eq("id", paymentId);
    if (updateError) throw updateError;

    // An accepted STK request is not proof of payment.
    return NextResponse.json({
      status: "success",
      message: data.CustomerMessage || "STK Push sent. Enter your M-Pesa PIN and wait for confirmation.",
      checkoutRequestId: data.CheckoutRequestID
    });
  } catch (error) {
    console.error("KaziConnect STK initiation failed:", error instanceof Error ? error.message : "unknown error");
    if (paymentId) await admin.from("mpesa_payments").update({ status: "failed", result_description: "Unable to initiate payment" }).eq("id", paymentId);
    return NextResponse.json({ status: "error", message: "Unable to initiate M-Pesa payment. No successful payment has been recorded." }, { status: 502 });
  }
}