import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", message: "Sign in required." }, { status: 401 });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("phone_verified_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ status: "error", message: "Could not check verification status." }, { status: 500 });

  return NextResponse.json({ verified: Boolean(profile?.phone_verified_at) }, {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
