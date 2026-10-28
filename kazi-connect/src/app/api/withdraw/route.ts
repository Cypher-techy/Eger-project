import { NextResponse } from "next/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", message: "Sign in before requesting a withdrawal." }, { status: 401 });

  let body: { amount?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ status: "error", message: "Invalid request body." }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount < 100) {
    return NextResponse.json({ status: "error", message: "Enter a whole KSh amount of at least 100." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return NextResponse.json({ status: "error", message: "Withdrawal service is not configured." }, { status: 503 });

  const admin = createSupabaseAdmin(supabaseUrl, serviceKey);
  const { data, error } = await admin.rpc("request_withdrawal", {
    p_user_id: user.id,
    p_amount_kes: amount
  });
  if (error) {
    const message = error.message || "Could not submit withdrawal request.";
    const status = /insufficient available balance/i.test(message) ? 409
      : /verify your phone/i.test(message) ? 403
      : /minimum withdrawal/i.test(message) ? 400 : 500;
    return NextResponse.json({ status: "error", message }, { status });
  }

  return NextResponse.json({
    status: "success",
    requestId: data,
    message: "Withdrawal request submitted. It is pending review and payout processing; this is not confirmation that money has been sent."
  }, { status: 201 });
}
