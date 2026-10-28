"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";

export default function AccountPage() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/callback` }
        });
        if (error) throw error;
        if (data.session) router.push("/dashboard");
        else setMessage("Account created. Check your email to confirm your address, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard"); router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not complete your request. Please try again.");
    } finally { setLoading(false); }
  }

  return <main className="auth-page"><div className="auth-brand"><Link className="brand" href="/"><span className="brand-icon">K</span><span>Kazi<span className="brand-green">Mashinani</span> Jobs<small>KENYA</small></span></Link><Link href="/" className="back-link"><ArrowLeft size={15}/> Back to home</Link></div><section className="auth-card"><div className="auth-symbol"><ShieldCheck size={22}/></div><div className="eyebrow">YOUR OPPORTUNITY STARTS HERE</div><h1>{mode === "signup" ? "Create your account." : "Welcome back."}</h1><p className="auth-sub">{mode === "signup" ? "Join KaziMashinani Jobs to explore opportunities and keep your work organised." : "Sign in to see your opportunities and account activity."}</p><div className="auth-tabs"><button className={mode === "signup" ? "active" : ""} onClick={() => {setMode("signup");setError("");setMessage("");}}>Create account</button><button className={mode === "signin" ? "active" : ""} onClick={() => {setMode("signin");setError("");setMessage("");}}>Sign in</button></div><form onSubmit={submit}>{mode === "signup" && <label>Full name<input value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name" required minLength={2} placeholder="Your full name"/></label>}<label>Email address<input value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="you@example.com"/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} placeholder="At least 8 characters"/></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button className="btn btn-primary auth-submit" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17}/> : null}{loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</button></form><p className="auth-terms">By continuing, you agree to use the platform honestly. Opportunity availability and reward terms are shown before you apply.</p></section><p className="auth-footer">KaziMashinani Jobs Kenya · Built around clarity and trust</p></main>;
}