"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, LoaderCircle, ShieldCheck } from "lucide-react";

export default function WithdrawalForm({ verified, phone, available }: { verified: boolean; phone: string; available: number }) {
  const [amount, setAmount] = useState(String(Math.max(100, Math.min(750, Math.floor(available)))));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not submit withdrawal request.");
      setMessage(data.message);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit withdrawal request.");
    } finally {
      setBusy(false);
    }
  }

  if (!verified) return <div className="withdraw-note"><ShieldCheck size={17}/> Complete phone verification before requesting a withdrawal.</div>;
  if (!phone) return <div className="withdraw-note">Your verified phone number is not available on the account. Contact support before requesting a payout.</div>;

  return <form className="withdraw-form" onSubmit={submit}>
    <div className="withdraw-summary"><div><small>Available to request</small><strong>KSh {Math.max(0, available).toLocaleString("en-KE")}</strong></div><span>M-Pesa · {phone}</span></div>
    <label htmlFor="withdraw-amount">Withdrawal amount (KSh)</label>
    <input id="withdraw-amount" type="number" min="100" step="1" max={Math.floor(available)} value={amount} onChange={event => setAmount(event.target.value)} required />
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-success" role="status">{message}</p>}
    <button className="btn btn-primary withdraw-submit" type="submit" disabled={busy || available < 100 || !Number.isSafeInteger(Number(amount)) || Number(amount) < 100 || Number(amount) > available}>
      {busy ? <LoaderCircle className="spin" size={16}/> : <ArrowDownToLine size={16}/>}
      {busy ? "Submitting request…" : "Withdraw to M-Pesa"}
    </button>
    <p className="withdraw-disclaimer">Requests are reviewed before payout. Submission reserves this amount against duplicate requests; it does not mean M-Pesa has sent money.</p>
  </form>;
}
