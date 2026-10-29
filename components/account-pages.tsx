"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, Check, LoaderCircle, Save, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import ProfileMenu from "@/components/profile-menu";
import ThemeSwitch from "@/components/theme-switch";
import { getUserDisplayName, getUserInitials } from "@/lib/profile";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatAuditHistoryError } from "@/lib/audit-history-error";

const HISTORY_REPORT_KEY = "speedaudit-open-history-id";

type HistoryRecord = {
  id: string;
  target_url: string;
  audited_at: string;
  audit_status: string;
  result: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeHistoryRows(value: unknown): HistoryRecord[] {
  if (!Array.isArray(value)) throw new Error("The audit history response was invalid.");
  return value.map((row): HistoryRecord => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.target_url !== "string" ||
      typeof row.audited_at !== "string" || typeof row.audit_status !== "string" || !isRecord(row.result)) {
      throw new Error("An audit history entry could not be read.");
    }
    return {
      id: row.id,
      target_url: row.target_url,
      audited_at: row.audited_at,
      audit_status: row.audit_status,
      result: row.result,
    };
  });
}

function useRequiredUser(path: string) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const supabase = getSupabaseClient();
    const loginPath = `/login?next=${encodeURIComponent(path)}`;
    async function initialize() {
      if (!supabase) {
        setAuthError("Authentication is not configured. Check the Supabase URL and publishable key.");
        setReady(true);
        return;
      }
      const subscription = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (!currentUser) router.replace(loginPath);
      }).data.subscription;
      unsubscribe = () => subscription.unsubscribe();
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) {
          setAuthError(error.message);
        } else if (data.session?.user) {
          setUser(data.session.user);
        } else {
          router.replace(loginPath);
        }
      } catch (cause) {
        if (active) setAuthError(cause instanceof Error ? cause.message : "Could not verify your session.");
      } finally {
        if (active) setReady(true);
      }
    }

    void initialize();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [path, router]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthError("Authentication is not configured.");
      return;
    }
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setAuthError(error.message);
        return;
      }
      router.replace("/");
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Could not log out.");
    }
  }, [router]);

  return { user, setUser, ready, authError, signOut };
}

function AccountFrame({ user, signOut, title, description, children }: {
  user: User;
  signOut: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const initials = getUserInitials(user);

  return (
    <main className="min-h-screen bg-[#080f20] text-slate-100">
      <header className="site-header relative z-40 border-b border-white/[0.07]">
        <div className="mx-auto flex min-h-[76px] max-w-[1080px] items-center justify-between gap-4 px-5 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-cyan-300"><UserRound size={19} /></span>
            <span className="text-[17px] font-semibold">SpeedAudit</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeSwitch />
            <ProfileMenu user={user} onSignOut={signOut} />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[900px] px-5 py-10 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"><ArrowLeft size={15} />Back to home</Link>
        <div className="mb-7 mt-7 flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-indigo-300/30 bg-gradient-to-br from-indigo-500/30 to-cyan-500/20 text-sm font-semibold text-cyan-100">{initials}</span>
          <div><h1 className="text-2xl font-semibold text-white">{title}</h1><p className="mt-1 text-sm text-slate-400">{description}</p></div>
        </div>
        {children}
      </div>
      <footer className="border-t border-white/[0.06] px-5 py-6 text-center text-xs text-slate-600">© 2026 SpeedAudit. Built for clearer web performance decisions.</footer>
    </main>
  );
}

function PageStatus({ error, message }: { error: string; message: string }) {
  return (
    <>
      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-sm text-emerald-200">{message}</p>}
    </>
  );
}

export function ProfilePage() {
  const account = useRequiredUser("/profile");
  const [editedName, setEditedName] = useState<{ userId: string; firstName: string; lastName: string } | null>(null);
  const [password, setPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const profileMetadata = account.user?.user_metadata;
  const initialFirstName = typeof profileMetadata?.first_name === "string" ? profileMetadata.first_name : "";
  const initialLastName = typeof profileMetadata?.last_name === "string" ? profileMetadata.last_name : "";
  const activeDraft = account.user && editedName?.userId === account.user.id ? editedName : null;
  const displayedFirstName = activeDraft?.firstName ?? initialFirstName;
  const displayedLastName = activeDraft?.lastName ?? initialLastName;

  async function updateName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!displayedFirstName.trim() || !displayedLastName.trim()) {
      setError("Enter both your first and last name.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Authentication is not configured.");
      return;
    }
    setSavingName(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({
        data: { first_name: displayedFirstName.trim(), last_name: displayedLastName.trim() },
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      account.setUser(data.user);
      setEditedName(null);
      setMessage("Your name has been updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your name.");
    } finally {
      setSavingName(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 6) {
      setError("Your password must be at least 6 characters.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Authentication is not configured.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setPassword("");
      setMessage("Your password has been changed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your password.");
    } finally {
      setSavingPassword(false);
    }
  }

  if (!account.ready || !account.user) {
    return <main className="flex min-h-screen items-center justify-center bg-[#080f20] text-slate-100">{account.authError ? <p role="alert" className="text-sm text-rose-200">{account.authError}</p> : <LoaderCircle className="animate-spin text-cyan-300" />}</main>;
  }

  return (
    <AccountFrame user={account.user} signOut={() => void account.signOut()} title="My profile" description="Manage the name shown on your account and update your password.">
      <PageStatus error={error || account.authError} message={message} />
      <div className="grid gap-5 md:grid-cols-2">
        <section className="glass-panel rounded-2xl p-5 sm:p-6">
          <h2 className="text-base font-semibold text-white">Personal details</h2>
          <p className="mt-1 text-sm text-slate-400">Your initials in the header update when you save your name.</p>
          <form onSubmit={updateName} className="mt-5 space-y-4">
            <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-300">First name</span><input autoComplete="given-name" maxLength={80} required value={displayedFirstName} onChange={(event) => account.user && setEditedName({ userId: account.user.id, firstName: event.target.value, lastName: displayedLastName })} className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/30 px-3 text-sm text-white outline-none focus:border-indigo-400/50" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-300">Last name</span><input autoComplete="family-name" maxLength={80} required value={displayedLastName} onChange={(event) => account.user && setEditedName({ userId: account.user.id, firstName: displayedFirstName, lastName: event.target.value })} className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/30 px-3 text-sm text-white outline-none focus:border-indigo-400/50" /></label>
            <div className="rounded-lg border border-white/[0.08] bg-slate-950/20 px-3 py-2.5"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Email</p><p className="mt-1 break-all text-sm text-slate-200">{account.user.email ?? "Not available"}</p></div>
            <button type="submit" disabled={savingName} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 text-sm font-semibold text-white disabled:opacity-60">{savingName ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}Save name</button>
          </form>
        </section>

        <section className="glass-panel rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-cyan-300" /><h2 className="text-base font-semibold text-white">Change password</h2></div>
          <p className="mt-1 text-sm text-slate-400">Choose a new password for your SpeedAudit account.</p>
          <form onSubmit={updatePassword} className="mt-5 space-y-4">
            <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-300">New password</span><input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" className="h-11 w-full rounded-lg border border-white/10 bg-slate-950/30 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400/50" /></label>
            <p className="text-xs leading-5 text-slate-500">You are currently signed in as {getUserDisplayName(account.user)}.</p>
            <button type="submit" disabled={savingPassword} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-60">{savingPassword ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}Update password</button>
          </form>
        </section>
      </div>
    </AccountFrame>
  );
}

export function MyTestsPage() {
  const account = useRequiredUser("/my-tests");
  const router = useRouter();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const userId = account.user?.id;
    if (!userId) return;
    let active = true;
    async function loadHistory() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Authentication is not configured.");
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data, error: queryError } = await supabase
          .from("audit_history")
          .select("id, target_url, audited_at, audit_status, result")
          .eq("user_id", userId)
          .order("audited_at", { ascending: false });
        if (!active) return;
        if (queryError) {
          setError(formatAuditHistoryError("Could not load your audit history.", queryError));
        } else {
          try {
            setRecords(decodeHistoryRows(data));
            setError("");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not read the audit history.");
          }
        }
        setLoading(false);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Could not load your audit history.");
        setLoading(false);
      }
    }

    void loadHistory();
    return () => { active = false; };
  }, [account.user]);

  function openReport(record: HistoryRecord) {
    window.sessionStorage.setItem(HISTORY_REPORT_KEY, record.id);
    router.push("/");
  }

  if (!account.ready || !account.user) {
    return <main className="flex min-h-screen items-center justify-center bg-[#080f20] text-slate-100">{account.authError ? <p role="alert" className="text-sm text-rose-200">{account.authError}</p> : <LoaderCircle className="animate-spin text-cyan-300" />}</main>;
  }

  return (
    <AccountFrame user={account.user} signOut={() => void account.signOut()} title="My tests" description="Review completed website audits saved to your account.">
      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">{error}</p>}
      {loading ? (
        <div role="status" className="glass-panel flex min-h-32 items-center justify-center gap-3 rounded-2xl text-sm text-slate-400"><LoaderCircle size={18} className="animate-spin text-cyan-300" />Loading your audits…</div>
      ) : records.length ? (
        <div className="space-y-3">
          {records.map((record) => {
            const performance = isRecord(record.result.performance) ? record.result.performance : {};
            const mobile = isRecord(performance.mobile) ? performance.mobile : {};
            const desktop = isRecord(performance.desktop) ? performance.desktop : {};
            const mobileScore = typeof mobile.score === "number" ? mobile.score : null;
            const desktopScore = typeof desktop.score === "number" ? desktop.score : null;
            return (
              <article key={record.id} className="glass-panel rounded-2xl p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <a href={record.target_url} target="_blank" rel="noreferrer" className="block truncate text-sm font-semibold text-white hover:text-cyan-200">{record.target_url}</a>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400"><CalendarClock size={13} />{new Date(record.audited_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2.5 py-1 text-xs text-emerald-300">{record.audit_status}</span>
                    <button type="button" onClick={() => openReport(record)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 text-sm font-semibold text-white">Open report</button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4 sm:grid-cols-4">
                  <p className="text-xs text-slate-400">Mobile performance <span className="ml-1 font-mono text-sm text-white">{mobileScore ?? "—"}{mobileScore === null ? "" : "/100"}</span></p>
                  <p className="text-xs text-slate-400">Desktop performance <span className="ml-1 font-mono text-sm text-white">{desktopScore ?? "—"}{desktopScore === null ? "" : "/100"}</span></p>
                  <p className="text-xs text-slate-400">HTTP status <span className="ml-1 font-mono text-sm text-white">{typeof record.result.status === "number" ? record.result.status : "—"}</span></p>
                  <p className="text-xs text-slate-400">SEO score <span className="ml-1 font-mono text-sm text-white">{typeof record.result.seoScore === "number" ? record.result.seoScore : "—"}</span></p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel flex min-h-52 flex-col items-center justify-center rounded-2xl p-6 text-center">
          <CalendarClock size={24} className="text-cyan-300" />
          <h2 className="mt-3 text-base font-semibold text-white">No saved audits yet</h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-slate-400">Completed audits run while signed in will appear here and remain private to your account.</p>
          <Link href="/" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 text-sm font-semibold text-white">Start an audit</Link>
        </div>
      )}
    </AccountFrame>
  );
}
