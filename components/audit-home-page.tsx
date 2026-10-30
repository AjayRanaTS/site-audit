"use client";

import {
  Activity,
  Accessibility,
  ArrowUpRight,
  CalendarClock,
  Check,
  Globe2,
  LoaderCircle,
  SearchCheck,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { FormEventHandler, RefObject } from "react";
import type { User } from "@supabase/supabase-js";
import ProfileMenu from "@/components/profile-menu";
import type { AuditResult, RecentAudit } from "@/lib/audit-types";
import { SectionHeading } from "@/components/audit-report-ui";

export const LOADING_STAGES = ["Fetching page", "PageSpeed analysis", "Capturing screenshots"] as const;

const FEATURES: { icon: LucideIcon; title: string; text: string; color: string }[] = [
  { icon: Activity, title: "Performance & Core Web Vitals", text: "See lab and field metrics with clear thresholds and device context.", color: "text-brand-planning" },
  { icon: SearchCheck, title: "SEO & Technical Audits", text: "Review page metadata, crawl signals, images, and Lighthouse SEO checks.", color: "text-brand-authoring" },
  { icon: Accessibility, title: "Accessibility Analysis", text: "Find audited accessibility issues, affected elements, and manual checks.", color: "text-brand-execute" },
  { icon: Sparkles, title: "Actionable Recommendations", text: "Prioritize Lighthouse opportunities with estimated savings and affected resources.", color: "text-brand-analysis" },
];

const PRICING_PLANS = [
  { name: "Free", price: 0, audits: "3/month", pdf: false, doc: false, features: ["Basic features"] },
  { name: "Starter", price: 9, audits: "15/month", pdf: true, doc: true, features: ["All Free features"] },
  { name: "Pro", price: 19, audits: "40/month", pdf: true, doc: true, features: ["All Free and Starter features"] },
] as const;

type AuditHomePageProps = {
  user: User | null;
  url: string;
  onUrlChange: (value: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  auditFormRef: RefObject<HTMLFormElement | null>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  loading: boolean;
  authReady: boolean;
  loadingStage: string;
  error: string;
  onRetry: () => void;
  recentAudits: RecentAudit[];
  recentAuditsLoading: boolean;
  recentAuditsError: string;
  lastAudit: { result: AuditResult; auditedAt: string } | null;
  onOpenAudit: (result: AuditResult, auditedAt: string) => void;
  onStartAudit: () => void;
};

export default function AuditHomePage({
  user,
  url,
  onUrlChange,
  onSignIn,
  onSignOut,
  auditFormRef,
  onSubmit,
  loading,
  authReady,
  loadingStage,
  error,
  onRetry,
  recentAudits,
  recentAuditsLoading,
  recentAuditsError,
  lastAudit,
  onOpenAudit,
  onStartAudit,
}: AuditHomePageProps) {
  return (
    <>
      <header className="site-header relative z-40 border-b border-white/[0.07]">
        <div className="mx-auto flex min-h-[76px] max-w-[1320px] items-center justify-between gap-4 px-5 lg:px-8">
          <a href="#home" className="flex shrink-0 items-center gap-2.5 text-white"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-cyan-300"><Zap size={19} fill="currentColor" /></span><span className="text-[17px] font-semibold">AuditPilot</span></a>
          <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex" aria-label="Main navigation"><a href="#home" className="hover:text-white">Home</a><a href="#features" className="hover:text-white">Features</a><a href="#pricing" className="hover:text-white">Pricing</a><a href="#recent" className="hover:text-white">Reports</a></nav>
          <div className="flex shrink-0 items-center gap-2">{user ? <ProfileMenu user={user} onSignOut={onSignOut} /> : <button onClick={onSignIn} className="min-h-10 rounded-xl px-3 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">Sign in</button>}<button onClick={onStartAudit} className="primary-button hidden sm:flex"><Zap size={15} />Start audit</button></div>
        </div>
      </header>

      <section id="home" className="hero-section relative w-full px-5 py-16 sm:py-20 lg:min-h-[690px] lg:px-8 lg:py-24">
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/[0.07] px-3 py-1.5 text-xs text-indigo-100"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />Website performance intelligence</div>
          <h1 className="max-w-[760px] text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-5xl">Performance insights for a <span className="text-gradient">faster, healthier website.</span></h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">Analyze website speed, Core Web Vitals, SEO, accessibility, and technical issues in one comprehensive report.</p>

          <form ref={auditFormRef} onSubmit={onSubmit} className="audit-form mt-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b1428]/80 p-2.5 shadow-2xl shadow-black/25 backdrop-blur-xl">
            <label htmlFor="audit-url" className="sr-only">Website URL</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3"><Globe2 size={18} className="shrink-0 text-slate-500" /><input id="audit-url" type="url" inputMode="url" autoComplete="url" spellCheck={false} required value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder="https://yourwebsite.com" className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /></div>
              <button type="submit" disabled={loading || !authReady || !url.trim()} className="primary-button disabled:cursor-not-allowed disabled:opacity-50">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Zap size={16} />}{loading ? "Auditing" : "Run Audit"}</button>
            </div>
          </form>

          {loading && (
            <div role="status" aria-live="polite" aria-atomic="true" className="audit-progress mt-4 w-full max-w-2xl">
              <div className="audit-progress-header">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="audit-progress-icon" aria-hidden="true"><LoaderCircle size={18} className="animate-spin" /></span>
                  <p className="audit-progress-title">Running live audit</p>
                </div>
                <span className="audit-progress-eta">Usually under a minute</span>
              </div>
              <div className="loading-track" aria-hidden="true"><i /></div>
              <div className="audit-progress-stage">
                <span className="audit-progress-dot" aria-hidden="true" />
                <span>Current step</span>
                <span className="loading-stage-text">{loadingStage}</span>
              </div>
            </div>
          )}
          {error && <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-100"><span>{error}</span><button onClick={onRetry} className="shrink-0 font-medium underline underline-offset-2">Retry</button></div>}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-400" />Mobile & desktop</span><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-400" />Lighthouse-powered</span><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-400" />{user ? "Signed in" : "Sign in required to run an audit"}</span></div>
        </div>
      </section>

      <section id="features" className="relative border-t border-white/[0.06] bg-[#0b1428]/65 px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-[1320px]">
          <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">One clear report</p><h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">The details that move your site forward</h2></div><p className="max-w-md text-sm leading-6 text-slate-400">Evidence-led insights from PageSpeed and the page itself, organized by device and category.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{FEATURES.map(({ icon: Icon, title, text, color }) => <article key={title} className="feature-card rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.045] ${color}`}><Icon size={20} /></span><h3 className="mt-5 text-sm font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></article>)}</div>
        </div>
      </section>

      <section id="pricing" className="relative border-y border-white/[0.06] bg-[#0b1428]/45 px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-[1320px]">
          <div className="mx-auto mb-9 max-w-2xl text-center"><p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Simple, transparent plans</p><h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Pricing that grows with your audits</h2><p className="mt-3 text-sm leading-6 text-slate-400">Choose the monthly audit allowance and export options that fit your workflow.</p></div>
          <div className="grid gap-4 md:grid-cols-3">
            {PRICING_PLANS.map((plan) => (
              <article key={plan.name} className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold text-white">{plan.name}</h3>{plan.name === "Starter" && <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-cyan-200">Popular</span>}</div>
                <p className="mt-4 flex items-baseline gap-1"><span className="text-4xl font-semibold tracking-tight text-white">${plan.price}</span><span className="text-sm text-slate-400">/ month</span></p>
                <div className="mt-5 space-y-3 border-t border-white/[0.08] pt-5 pb-5 text-sm"><p className="flex items-center justify-between gap-3"><span className="text-slate-300">Audit tests</span><span className="font-medium text-white">{plan.audits}</span></p><p className="flex items-center justify-between gap-3"><span className="text-slate-300">Export results as PDF</span><span className={plan.pdf ? "font-medium text-emerald-300" : "text-slate-500"}>{plan.pdf ? "Yes" : "No"}</span></p><p className="flex items-center justify-between gap-3"><span className="text-slate-300">Export results as DOC</span><span className={plan.doc ? "font-medium text-emerald-300" : "text-slate-500"}>{plan.doc ? "Yes" : "No"}</span></p></div>
                <div className="mt-auto border-t border-white/[0.08] pt-5"><p className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Included features</p>{plan.features.map((feature) => <p key={feature} className="flex items-start gap-2 text-sm leading-5 text-slate-300"><Check size={15} className="mt-0.5 shrink-0 text-cyan-300" />{feature}</p>)}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="recent" className="mx-auto grid max-w-[1320px] gap-8 px-5 py-16 lg:grid-cols-[1.2fr_.8fr] lg:px-8">
        <div>
          <div className="flex flex-wrap items-end justify-between gap-4"><SectionHeading eyebrow="Reports" title="Recent audits" description={user ? "Your two latest saved website audits." : "Your latest audit is available during this browser session."} />{user && <Link href="/my-tests" className="secondary-button inline-flex shrink-0 items-center gap-2">View all <ArrowUpRight size={15} /></Link>}</div>
          <div className="recent-audit-card space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
            {user ? recentAuditsLoading ? (
              <div role="status" className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin text-cyan-300" />Loading your recent audits…</div>
            ) : recentAuditsError ? (
              <p role="alert" className="text-sm text-rose-200">{recentAuditsError}</p>
            ) : recentAudits.length ? recentAudits.map((audit) => (
              <div key={audit.id} className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-3 last:border-0 last:pb-0">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{audit.target_url}</p><p className="mt-1 text-xs text-slate-500">{new Date(audit.audited_at).toLocaleString()}</p></div>
                <button type="button" onClick={() => onOpenAudit(audit.result, audit.audited_at)} className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-cyan-200">Open report</button>
              </div>
            )) : (
              <div className="flex items-center gap-3 text-sm text-slate-400"><CalendarClock size={17} className="text-slate-500" />Your saved audits will appear here after you complete one.</div>
            ) : lastAudit ? (
              <button type="button" onClick={() => onOpenAudit(lastAudit.result, lastAudit.auditedAt)} className="flex w-full items-center justify-between gap-4 text-left">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{lastAudit.result.url}</p><p className="mt-1 text-xs text-slate-500">{new Date(lastAudit.auditedAt).toLocaleString()}</p></div>
                <span className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-cyan-200">Open report</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 text-sm text-slate-400"><CalendarClock size={17} className="text-slate-500" />Your completed audits will appear here during this session.</div>
            )}
          </div>
        </div>
        <div id="dashboard" className="recent-cta rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6"><p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Ready when you are</p><h2 className="mt-3 text-xl font-semibold text-white">Know what is slowing your site down.</h2><p className="mt-2 text-sm leading-6 text-slate-400">Run a mobile and desktop audit to get a prioritized, evidence-based report.</p><button onClick={onStartAudit} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-white">Start your audit <ArrowUpRight size={15} /></button></div>
      </section>

      <footer className="border-t border-white/[0.06] px-5 py-6 text-center text-xs text-slate-600">© 2026 AuditPilot. Built for clearer web performance decisions.</footer>
    </>
  );
}
