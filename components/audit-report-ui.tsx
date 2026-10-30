"use client";

import {
  Accessibility,
  Activity,
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  Gauge,
  Globe2,
  Images,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Monitor,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import type { Device, Finding, NavItem, Speed } from "@/lib/audit-types";
import { formatBytes, scoreStatus } from "@/lib/audit-report-format";

export const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "performance", label: "Performance", icon: Gauge },
  { id: "vitals", label: "Core Web Vitals", icon: Activity },
  { id: "opportunities", label: "Opportunities", icon: Sparkles },
  { id: "diagnostics", label: "Diagnostics", icon: SearchCheck },
  { id: "accessibility", label: "Accessibility Report", icon: Accessibility },
  { id: "best-practices", label: "Best Practices", icon: ShieldCheck },
  { id: "seo", label: "SEO Report", icon: Globe2 },
  { id: "screenshots", label: "Page load filmstrip", icon: Images },
];

export const METRIC_INFO: Record<string, { label: string; fullName: string }> = {
  lcp: { label: "LCP", fullName: "Largest Contentful Paint" },
  inp: { label: "INP", fullName: "Interaction to Next Paint" },
  cls: { label: "CLS", fullName: "Cumulative Layout Shift" },
  fcp: { label: "FCP", fullName: "First Contentful Paint" },
  si: { label: "Speed Index", fullName: "Speed Index" },
  tbt: { label: "TBT", fullName: "Total Blocking Time" },
  ttfb: { label: "TTFB", fullName: "Time to First Byte" },
};

export function ScoreCard({ label, score, icon: Icon, section }: {
  label: string;
  score: number | null | undefined;
  icon: LucideIcon;
  section: string;
}) {
  const status = scoreStatus(score);
  const shown = typeof score === "number" ? Math.max(0, Math.min(score, 100)) : null;
  const radius = 23;
  const circumference = 2 * Math.PI * radius;

  return (
    <a href={`#${section}`} className="score-card group rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 transition hover:border-indigo-400/40 hover:bg-white/[0.055]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-300"><Icon size={16} className="text-indigo-300" />{label}</div>
        <ArrowUpRight size={14} className="text-slate-500 transition group-hover:text-cyan-300" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0" aria-label={`${label} score: ${shown ?? "unavailable"}`}>
          <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
            <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(148,163,184,.16)" strokeWidth="4" />
            {shown !== null && <circle className="score-ring" cx="28" cy="28" r={radius} fill="none" stroke={status.ring} strokeWidth="4" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - shown / 100)} />}
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-white">{shown ?? "--"}</span>
        </div>
        <div className="min-w-0"><p className="text-2xl font-semibold tabular-nums text-white">{shown === null ? "n/a" : `${shown}/100`}</p><p className={`mt-0.5 text-xs ${status.color}`}>{status.label}</p></div>
      </div>
    </a>
  );
}

export function SectionHeading({ eyebrow, title, description, count }: {
  eyebrow?: string;
  title: string;
  description?: string;
  count?: number;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>{eyebrow && <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>}<h2 className="text-xl font-semibold text-white sm:text-2xl">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>}</div>
      {count !== undefined && <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-slate-300">{count}</span>}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/20 px-4 py-6 text-sm text-slate-400">{label}</div>;
}

export function FindingList({ findings, empty, expandAll = false }: {
  findings: Finding[];
  empty: string;
  expandAll?: boolean;
}) {
  const actionableFindings = findings.filter((finding) => finding.status === "warn" || finding.status === "fail");
  if (!actionableFindings.length) return <EmptyState label={empty} />;
  return (
    <div className="space-y-2">
      {actionableFindings.map((finding) => {
        const resources = finding.resources ?? [];
        const priority = finding.priority;
        const priorityTone = priority === "high" ? "text-rose-300" : priority === "medium" ? "text-amber-300" : "text-slate-400";
        const savings = finding.savings;
        const savingsItems = savings
          ? [
              savings.overallMs !== null && savings.overallMs !== undefined ? `Overall ${savings.overallMs} ms` : null,
              savings.lcpMs !== null && savings.lcpMs !== undefined ? `LCP ${savings.lcpMs} ms` : null,
              savings.fcpMs !== null && savings.fcpMs !== undefined ? `FCP ${savings.fcpMs} ms` : null,
              savings.inpMs !== null && savings.inpMs !== undefined ? `INP ${savings.inpMs} ms` : null,
              savings.cls !== null && savings.cls !== undefined ? `CLS ${savings.cls}` : null,
              savings.bytes !== null && savings.bytes !== undefined ? `Bytes ${formatBytes(savings.bytes)}` : null,
            ].filter((item): item is string => item !== null)
          : [];
        return (
          <details key={finding.id} open={expandAll || undefined} className="finding-row group rounded-xl border border-white/[0.08] bg-slate-950/20 open:bg-slate-950/35">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${finding.status === "fail" ? "bg-rose-400" : "bg-amber-400"}`} />
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-100">{finding.title}</span>
              {finding.displayValue && <span className="hidden max-w-[34%] truncate text-xs text-slate-400 sm:block">{finding.displayValue}</span>}
              {priority && <span className={`shrink-0 text-[11px] ${priorityTone}`}>{priority} priority</span>}
              <ChevronDown size={15} className="shrink-0 text-slate-500 transition group-open:rotate-180" />
            </summary>
            <div className="border-t border-white/[0.07] px-4 pb-4 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Actual issue</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">{finding.title}{finding.displayValue ? ` — ${finding.displayValue}` : ""}</p>
              {typeof finding.score === "number" && <p className="mt-2 text-xs text-slate-400">Lighthouse audit score: {Math.round(finding.score * 100)}/100</p>}
              {savingsItems.length > 0 && <p className="mt-3 text-xs text-emerald-300">PageSpeed potential savings: {savingsItems.join(" · ")}</p>}
              <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Recommended solution</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">{finding.recommendation || "Insufficient PageSpeed detail for a specific fix."}</p>
              {finding.id === "uses-optimized-images" && finding.recommendation?.includes("TinyPNG") && <p className="mt-2 text-sm"><a className="underline underline-offset-2" href="https://tinypng.com/" target="_blank" rel="noreferrer">TinyPNG</a><span className="text-slate-400"> · </span><a className="underline underline-offset-2" href="https://tinyjpg.com/" target="_blank" rel="noreferrer">TinyJPG</a></p>}
              {resources.length > 0 && <div className="mt-3 space-y-2"><p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Affected resources and elements</p>{resources.map((resource, index) => <div key={`${finding.id}-${index}`} className="rounded-lg border border-white/[0.06] bg-black/20 p-3 font-mono text-[11px] leading-5 text-slate-300">{Object.entries(resource).map(([key, value]) => <div key={key} className="break-all"><span className="text-slate-500">{key}: </span>{key.toLowerCase().includes("bytes") || key === "transferSize" ? formatBytes(value) : String(value)}</div>)}</div>)}</div>}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function DeviceSelector({ device, onChange }: { device: Device; onChange: (device: Device) => void }) {
  return (
    <div role="tablist" aria-label="Audit device" className="inline-flex rounded-xl border border-white/10 bg-slate-950/40 p-1">
      {(["mobile", "desktop"] as const).map((value) => {
        const Icon = value === "mobile" ? Smartphone : Monitor;
        return <button key={value} type="button" role="tab" aria-selected={device === value} onClick={() => onChange(value)} className={`flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition ${device === value ? "bg-indigo-500/20 text-white shadow-[inset_0_0_0_1px_rgba(99,102,241,.35)]" : "text-slate-400 hover:text-white"}`}><Icon size={16} />{value === "mobile" ? "Mobile" : "Desktop"}</button>;
      })}
    </div>
  );
}

export function DevicePreview({ device, screenshot }: { device: Device; screenshot?: string }) {
  const isMobile = device === "mobile";
  return (
    <div className={`device-stage ${isMobile ? "device-stage-mobile" : "device-stage-desktop"}`}>
      {isMobile ? (
        <div className="phone-frame">
          <div className="phone-screen">
            {screenshot ? <Image src={screenshot} alt="Actual mobile audit screenshot" width={390} height={844} unoptimized /> : <div className="illustration-screen"><div className="illustration-top" /><div className="illustration-title" /><div className="illustration-lines"><i /><i /><i /></div><div className="illustration-block" /><small>Illustrative preview<br />Run an audit for a real screenshot</small></div>}
          </div>
          <div className="phone-island" />
        </div>
      ) : (
        <div className="laptop-frame">
          <div className="laptop-bezel"><div className="laptop-screen">{screenshot ? <Image src={screenshot} alt="Actual desktop audit screenshot" width={1440} height={900} unoptimized /> : <div className="illustration-screen desktop-illustration"><div className="illustration-top" /><div className="illustration-title" /><div className="illustration-columns"><div /><div /><div /></div><div className="illustration-lines"><i /><i /><i /><i /></div><small>Illustrative preview<br />Run an audit for a real screenshot</small></div>}</div><span className="camera-dot" /></div><div className="laptop-base" />
        </div>
      )}
    </div>
  );
}

export function MetricCards({ speed }: { speed: Speed | undefined }) {
  const keys = ["lcp", "inp", "cls", "fcp", "si", "tbt", "ttfb"];
  const availableKeys = keys.filter((key) =>
    typeof speed?.metrics?.[key]?.display === "string" ||
    typeof speed?.fieldMetrics?.[key]?.display === "string" ||
    typeof speed?.metrics?.[key]?.value === "number" ||
    typeof speed?.fieldMetrics?.[key]?.value === "number"
  );
  return (
    <>
      {speed?.error && <div role="status" className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-sm leading-6 text-amber-100"><p className="font-medium">PageSpeed data unavailable</p><p className="mt-1 text-amber-100/70">{speed.error}</p></div>}
      {availableKeys.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {availableKeys.map((key) => {
          const info = METRIC_INFO[key];
          const lab = speed?.metrics?.[key];
          const field = speed?.fieldMetrics?.[key];
          const value = lab?.display ?? field?.display;
          const hasLabData = typeof lab?.display === "string" || typeof lab?.value === "number";
          return <article key={key} className="rounded-xl border border-white/[0.08] bg-slate-950/25 p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-mono text-xs font-semibold text-cyan-200">{info.label}</p><p className="mt-1 text-[11px] text-slate-500">{info.fullName}</p></div><span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{hasLabData ? "Lab data" : "Field data"}</span></div><p className="mt-4 font-mono text-2xl font-medium tabular-nums text-white">{value}</p></article>;
        })}
      </div> : !speed?.error && <EmptyState label="No performance metrics were returned by PageSpeed." />}
    </>
  );
}

export function ResultSidebar({ active, collapsed, setCollapsed, drawerOpen, setDrawerOpen, device, url, counts, onNavigate, onHome }: {
  active: string;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (value: boolean) => void;
  device: Device;
  url: string;
  counts: Record<string, number>;
  onNavigate: (id: string) => void;
  onHome: () => void;
}) {
  const content = <>
    <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} border-b border-white/[0.07] px-4 py-4`}>
      {!collapsed && <a href="#top" className="flex items-center gap-2.5 text-white"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-cyan-300"><Zap size={17} fill="currentColor" /></span><span className="font-semibold">AuditPilot</span></a>}
      {collapsed && <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-cyan-300"><Zap size={17} fill="currentColor" /></span>}
      <button onClick={() => setCollapsed(!collapsed)} className="hidden rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white lg:block" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
      <button onClick={() => setDrawerOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Close navigation"><X size={18} /></button>
    </div>
    <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Audit report sections">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onNavigate(id)} title={collapsed ? label : undefined} aria-current={active === id ? "location" : undefined} className={`group relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] transition ${active === id ? "bg-indigo-500/15 text-indigo-100 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-cyan-300" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"} ${collapsed ? "justify-center px-0" : ""}`}><Icon size={17} className="shrink-0" /><span className={collapsed ? "sr-only" : "flex-1"}>{label}</span>{!collapsed && counts[id] > 0 && <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{counts[id]}</span>}</button>)}
    </nav>
    <div className="border-t border-white/[0.07] p-3">
      {!collapsed && <div className="mb-3 rounded-lg bg-slate-950/30 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Current report · {device}</p><p className="mt-1 truncate text-xs text-slate-300" title={url}>{url}</p></div>}
      <button onClick={onHome} title={collapsed ? "Back to dashboard" : undefined} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-white ${collapsed ? "justify-center px-0" : ""}`}><ArrowLeft size={16} /><span className={collapsed ? "sr-only" : ""}>Back to Dashboard</span></button>
    </div>
  </>;

  return <>
    <aside className={`report-sidebar glass-panel sticky top-5 hidden h-[calc(100vh-2.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl transition-[width] duration-200 lg:flex ${collapsed ? "w-[76px]" : "w-[252px]"}`}>{content}</aside>
    {drawerOpen && <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm lg:hidden" onClick={() => setDrawerOpen(false)}><aside className="glass-panel flex h-full w-[min(86vw,310px)] flex-col" onClick={(event) => event.stopPropagation()}>{content}</aside></div>}
  </>;
}
