"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, LoaderCircle, Smartphone } from "lucide-react";

export default function PhoneVerificationForm({ verified }: { verified: boolean }) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
      setMessage("STK Push sent. Enter your M-Pesa PIN, then wait for server-side confirmation. The prompt alone does not verify your phone.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment. Try again.");
    } finally { setBusy(false); }
  }

  if (verified) return <div className="verification-result"><CheckCircle2 size={19}/> Your phone number is verified.</div>;
  return <form className="verify-form" onSubmit={submit}>
    <label htmlFor="verification-phone">M-Pesa phone number</label>
    <input id="verification-phone" value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" required placeholder="0712 345 678" />
    <label className="consent-line"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/> I agree to pay the disclosed KSh 70 phone-verification fee. This is a verification charge, not a job application fee or a guarantee of earnings.</label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}
    <button className="btn btn-primary verify-submit" disabled={busy || !consent}>{busy ? <LoaderCircle className="spin" size={16}/> : <Smartphone size={16}/>} {busy ? "Requesting STK Push…" : "Pay KSh 70 with M-Pesa"}</button>
  </form>;
}