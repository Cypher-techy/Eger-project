"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Smartphone } from "lucide-react";

export default function PhoneVerificationForm({ verified }: { verified: boolean }) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/stkpush", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, consent })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not start M-Pesa payment.");
      setMessage("PAYMENT PENDING — check your phone and enter your M-Pesa PIN. Waiting for Safaricom to confirm the KSh 70 payment…");
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        const statusResponse = await fetch("/api/verification-status", { cache: "no-store" });
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          if (status.verified) {
            setMessage("PAYMENT CONFIRMED — your phone is verified and the eligible KES 750 welcome bonus has been credited to your withdrawable wallet.");
            router.refresh();
            return;
          }
        }
      }
      setMessage("Your payment is still awaiting confirmation. Keep this page open or refresh your dashboard later. No bonus is credited until Safaricom confirms payment.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment. Try again.");
    } finally { setBusy(false); }
  }

  if (verified) return <div className="verification-result"><CheckCircle2 size={19}/> Your phone number is verified.</div>;
  return <form className="verify-form" onSubmit={submit}>
    <label htmlFor="verification-phone">M-Pesa phone number</label>
    <input id="verification-phone" value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" required placeholder="0712 345 678" />
    <label className="consent-line"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/> I agree to pay the disclosed KSh 70 phone-verification fee. After successful payment confirmation, the KES 750 welcome bonus is credited once if the funded promotion is enabled. The verification charge is not a job application fee and does not guarantee employment.</label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}
    <button className="btn btn-primary verify-submit" disabled={busy || !consent}>{busy ? <LoaderCircle className="spin" size={16}/> : <Smartphone size={16}/>} {busy ? "Requesting STK Push…" : "Verify & claim KES 750"}</button>
  </form>;
}