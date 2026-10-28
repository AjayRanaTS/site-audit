"use client";

import { LockKeyhole, Mail, UserRoundPlus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

type AuthMode = "login" | "register";

type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: User) => void;
};

export default function AuthModal({ open, onClose, onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("Supabase config is missing. Add the project URL and publishable key to .env.local, then restart the dev server.");
      }

      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
            },
          },
        });
        if (signUpError) throw signUpError;
        if (data.user && data.session) {
          onAuthenticated(data.user);
          onClose();
        } else {
          setMessage("Account created. Check your email to confirm your address, then sign in.");
          setMode("login");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        onAuthenticated(data.user);
        onClose();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#030712]/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="auth-title" className="glass-panel w-full max-w-[420px] rounded-2xl p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-cyan-200">
              {mode === "login" ? <LockKeyhole size={19} /> : <UserRoundPlus size={19} />}
            </div>
            <h2 id="auth-title" className="text-xl font-semibold text-white">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-400">{mode === "login" ? "Sign in to continue auditing websites." : "Create an account to keep auditing after your 3 free tests."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close authentication dialog" className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "register" && <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">First name</span>
              <input type="text" autoComplete="given-name" required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/30 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/50" placeholder="First name" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">Last name</span>
              <input type="text" autoComplete="family-name" required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/30 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/50" placeholder="Last name" />
            </label>
          </div>}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Email address</span>
            <span className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/30 px-3 focus-within:border-indigo-400/50">
              <Mail size={15} className="text-slate-500" />
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-full w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600" placeholder="you@example.com" />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Password</span>
            <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/30 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/50" placeholder="At least 6 characters" />
          </label>
          {mode === "register" && <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Confirm password</span>
            <input type="password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/30 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/50" placeholder="Re-enter your password" />
          </label>}

          {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-xs leading-5 text-rose-200">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-xs leading-5 text-emerald-200">{message}</p>}

          <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-400">
          {mode === "login" ? "New to SpeedAudit?" : "Already have an account?"}{" "}
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setMessage(""); }} className="font-medium text-cyan-200 hover:text-white">
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
      </section>
    </div>
  );
}
