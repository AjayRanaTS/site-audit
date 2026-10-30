"use client";

import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Accessibility,
  CalendarClock,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Gauge,
  Globe2,
  Images,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  SearchCheck,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import AuthModal from "@/components/auth-modal";
import ProfileMenu from "@/components/profile-menu";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatAuditHistoryError } from "@/lib/audit-history-error";
import type { Paragraph as DocxParagraph, Table as DocxTable } from "docx";

type Device = "mobile" | "desktop";
type AuditStatus = "pass" | "warn" | "fail" | "manual";
type Metric = { display: string | null; value: number | null };
type Finding = {
  id: string;
  title: string;
  displayValue: string | null;
  score: number | null;
  status: AuditStatus;
  priority?: "high" | "medium" | "low";
  recommendation?: string | null;
  savings?: {
    overallMs: number | null;
    lcpMs: number | null;
    fcpMs: number | null;
    cls: number | null;
    inpMs: number | null;
    bytes: number | null;
  };
  resources?: Record<string, string | number | null>[];
};
type Speed = {
  error?: string;
  score?: number | null;
  accessibility?: number | null;
  bestPractices?: number | null;
  seo?: number | null;
  metrics?: Record<string, Metric>;
  fieldMetrics?: Record<string, Metric>;
  fieldDataSource?: "url" | "origin" | null;
  cwvAssessment?: "passed" | "failed" | null;
  opportunities?: Finding[];
  diagnostics?: Finding[];
  accessibilityFindings?: Finding[];
  bestPracticeFindings?: Finding[];
  seoFindings?: Finding[];
  filmstrip?: { data: string; timing: number | null }[];
};
type Check = {
  id: string;
  label: string;
  status: Exclude<AuditStatus, "manual">;
  value: string;
  fix?: string;
  priority?: "high" | "medium" | "low";
  resource?: string;
};
type PlatformDetection = {
  name: string;
  confidence: "high" | "moderate";
  evidence: string[];
};
export type AuditResult = {
  url: string;
  status: number;
  redirects?: number;
  platform?: PlatformDetection | null;
  seoScore?: number | null;
  favicon?: string | null;
  checks: Check[];
  screenshots?: { mobile?: string; desktop?: string };
  performance: { mobile: Speed; desktop: Speed };
};
type RecentAudit = {
  id: string;
  target_url: string;
  audited_at: string;
  result: AuditResult;
};
type NavItem = { id: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
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

const METRIC_INFO: Record<string, { label: string; fullName: string }> = {
  lcp: { label: "LCP", fullName: "Largest Contentful Paint" },
  inp: { label: "INP", fullName: "Interaction to Next Paint" },
  cls: { label: "CLS", fullName: "Cumulative Layout Shift" },
  fcp: { label: "FCP", fullName: "First Contentful Paint" },
  si: { label: "Speed Index", fullName: "Speed Index" },
  tbt: { label: "TBT", fullName: "Total Blocking Time" },
  ttfb: { label: "TTFB", fullName: "Time to First Byte" },
};

const FEATURES: { icon: LucideIcon; title: string; text: string; color: string }[] = [
  { icon: Activity, title: "Performance & Core Web Vitals", text: "See lab and field metrics with clear thresholds and device context.", color: "text-brand-planning" },
  { icon: SearchCheck, title: "SEO & Technical Audits", text: "Review page metadata, crawl signals, images, and Lighthouse SEO checks.", color: "text-brand-authoring" },
  { icon: Accessibility, title: "Accessibility Analysis", text: "Find audited accessibility issues, affected elements, and manual checks.", color: "text-brand-execute" },
  { icon: Sparkles, title: "Actionable Recommendations", text: "Prioritize Lighthouse opportunities with estimated savings and affected resources.", color: "text-brand-analysis" },
];

const LOADING_STAGES = ["Fetching page", "PageSpeed analysis", "Capturing screenshots"] as const;
const PENDING_AUDIT_STORAGE_KEY = "speedaudit-pending-audit-url";
const HISTORY_REPORT_KEY = "speedaudit-open-history-id";

const PRICING_PLANS = [
  { name: "Free", price: 0, audits: "3/month", pdf: false, doc: false, features: ["Basic features"] },
  { name: "Starter", price: 9, audits: "15/month", pdf: true, doc: true, features: ["All Free features"] },
  { name: "Pro", price: 19, audits: "40/month", pdf: true, doc: true, features: ["All Free and Starter features"] },
] as const;

function isAuditResult(value: unknown): value is AuditResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.url === "string" &&
    typeof candidate.status === "number" &&
    (candidate.seoScore === undefined || typeof candidate.seoScore === "number" || candidate.seoScore === null) &&
    Array.isArray(candidate.checks) &&
    Boolean(candidate.performance && typeof candidate.performance === "object");
}

function scoreStatus(score: number | null | undefined) {
  if (typeof score !== "number") return { label: "Unavailable", color: "text-slate-400", ring: "#64748b" };
  if (score >= 90) return { label: "Good", color: "text-emerald-300", ring: "#10b981" };
  if (score >= 50) return { label: "Needs improvement", color: "text-amber-300", ring: "#f59e0b" };
  return { label: "Poor", color: "text-rose-300", ring: "#ef4444" };
}

function emptyFindingsMessage(score: number | null | undefined, verifiedMessage: string) {
  return typeof score === "number" ? verifiedMessage : "PageSpeed category data is unavailable for this run.";
}

function ScoreCard({ label, score, icon: Icon, section }: { label: string; score: number | null | undefined; icon: LucideIcon; section: string }) {
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

function SectionHeading({ eyebrow, title, description, count }: { eyebrow?: string; title: string; description?: string; count?: number }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>{eyebrow && <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>}<h2 className="text-xl font-semibold text-white sm:text-2xl">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>}</div>
      {count !== undefined && <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-slate-300">{count}</span>}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/20 px-4 py-6 text-sm text-slate-400">{label}</div>;
}

function FindingList({ findings, empty, expandAll = false }: { findings: Finding[]; empty: string; expandAll?: boolean }) {
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

function DeviceSelector({ device, onChange }: { device: Device; onChange: (device: Device) => void }) {
  return (
    <div role="tablist" aria-label="Audit device" className="inline-flex rounded-xl border border-white/10 bg-slate-950/40 p-1">
      {(["mobile", "desktop"] as const).map((value) => {
        const Icon = value === "mobile" ? Smartphone : Monitor;
        return <button key={value} type="button" role="tab" aria-selected={device === value} onClick={() => onChange(value)} className={`flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition ${device === value ? "bg-indigo-500/20 text-white shadow-[inset_0_0_0_1px_rgba(99,102,241,.35)]" : "text-slate-400 hover:text-white"}`}><Icon size={16} />{value === "mobile" ? "Mobile" : "Desktop"}</button>;
      })}
    </div>
  );
}

function DevicePreview({ device, screenshot }: { device: Device; screenshot?: string }) {
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
          <div className="laptop-bezel"><div className="laptop-screen">{screenshot ? <Image src={screenshot} alt="Actual desktop audit screenshot" width={1440} height={900} unoptimized /> : <div className="illustration-screen desktop-illustration"><div className="illustration-top" /><div className="illustration-title" /><div className="illustration-columns"><div /><div /><div /></div><div className="illustration-lines"><i /><i /><i /><i /></div><small>Illustrative preview<br />Run an audit for a real screenshot</small></div>}</div><span className="camera-dot" /></div><div className="laptop-base" /></div>
      )}
    </div>
  );
}

function formatBytes(bytes: unknown) {
  if (typeof bytes !== "number") return "Unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function MetricCards({ speed }: { speed: Speed | undefined }) {
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

function ResultSidebar({ active, collapsed, setCollapsed, drawerOpen, setDrawerOpen, device, url, counts, onNavigate, onHome }: {
  active: string; collapsed: boolean; setCollapsed: (value: boolean) => void; drawerOpen: boolean; setDrawerOpen: (value: boolean) => void;
  device: Device; url: string; counts: Record<string, number>; onNavigate: (id: string) => void; onHome: () => void;
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

export default function SpeedAuditDashboard() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [device, setDevice] = useState<Device>("mobile");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [auditedAt, setAuditedAt] = useState<string | null>(null);
  const [lastAudit, setLastAudit] = useState<{ result: AuditResult; auditedAt: string } | null>(null);
  const [recentAudits, setRecentAudits] = useState<RecentAudit[]>([]);
  const [recentAuditsLoading, setRecentAuditsLoading] = useState(false);
  const [recentAuditsError, setRecentAuditsError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [error, setError] = useState("");
  const [historySaveError, setHistorySaveError] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const auditFormRef = useRef<HTMLFormElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const activeSpeed = result?.performance[device];
  const pageSpeedTimedOut = /did not finish|timed out|aborted due to timeout/i.test(activeSpeed?.error ?? "");
  const findings = activeSpeed;
  const pageStatusIssues = result?.checks.filter(
    (check) => check.id === "status" && check.status === "fail"
  ) ?? [];
  const coreWebVitalKeys = ["lcp", "inp", "cls", "fcp", "ttfb"] as const;
  const findingsCounts: Record<string, number> = {
    opportunities: findings?.opportunities?.length ?? 0,
    diagnostics: findings?.diagnostics?.length ?? 0,
    accessibility: findings?.accessibilityFindings?.filter((item) => item.status !== "pass").length ?? 0,
    "best-practices": findings?.bestPracticeFindings?.filter((item) => item.status !== "pass").length ?? 0,
    seo: findings?.seoFindings?.length ?? 0,
  };

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;
    const restorePendingAuditUrl = () => {
      const pendingAuditUrl = window.sessionStorage.getItem(PENDING_AUDIT_STORAGE_KEY);
      if (!pendingAuditUrl) return;
      window.sessionStorage.removeItem(PENDING_AUDIT_STORAGE_KEY);
      setUrl(pendingAuditUrl);
    };
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      const authenticatedUser = session?.user ?? null;
      setUser(authenticatedUser);
      if (authenticatedUser) restorePendingAuditUrl();
    }).data.subscription;

    async function initializeAuth() {
      const sessionResult = supabase ? await supabase.auth.getSession() : await Promise.resolve(null);
      if (!active) return;
      const authenticatedUser = sessionResult?.data.session?.user ?? null;
      setUser(authenticatedUser);
      if (authenticatedUser) restorePendingAuditUrl();
      setAuthReady(true);
    }

    void initializeAuth();

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    const userId = user.id;
    const historyId = window.sessionStorage.getItem(HISTORY_REPORT_KEY);
    if (!historyId) return;
    window.sessionStorage.removeItem(HISTORY_REPORT_KEY);

    let active = true;
    async function restoreHistoryReport() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Authentication is not configured.");
        return;
      }
      try {
        const { data, error: historyError } = await supabase
          .from("audit_history")
          .select("audited_at, result")
          .eq("user_id", userId)
          .eq("id", historyId)
          .maybeSingle();
        if (!active) return;
        if (historyError) {
          setError(`Could not open this saved report. ${historyError.message}`);
          return;
        }
        if (!data || !isAuditResult(data.result)) {
          setError("This saved report is unavailable or has invalid data.");
          return;
        }
        setResult(data.result);
        setUrl(data.result.url);
        setAuditedAt(data.audited_at);
        setLastAudit({ result: data.result, auditedAt: data.audited_at });
        setActiveSection("overview");
        window.scrollTo({ top: 0 });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not open this saved report.");
      }
    }

    void restoreHistoryReport();
    return () => { active = false; };
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) return;

    const userId = user.id;
    let active = true;
    async function loadRecentAudits() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setRecentAuditsError("Authentication is not configured.");
        return;
      }

      setRecentAuditsLoading(true);
      setRecentAuditsError("");
      try {
        const { data, error: historyError } = await supabase
          .from("audit_history")
          .select("id, target_url, audited_at, result")
          .eq("user_id", userId)
          .order("audited_at", { ascending: false })
          .limit(2);
        if (!active) return;
        if (historyError) {
          setRecentAuditsError(formatAuditHistoryError("Could not load your recent audits.", historyError));
          return;
        }
        if (!Array.isArray(data)) {
          setRecentAuditsError("The recent audit history response was invalid.");
          return;
        }
        const parsed: RecentAudit[] = [];
        for (const row of data) {
          if (!row || typeof row.id !== "string" || typeof row.target_url !== "string" ||
            typeof row.audited_at !== "string" || !isAuditResult(row.result)) {
            setRecentAuditsError("A recent audit entry could not be read.");
            return;
          }
          parsed.push({
            id: row.id,
            target_url: row.target_url,
            audited_at: row.audited_at,
            result: row.result,
          });
        }
        setRecentAudits(parsed);
      } catch (cause) {
        if (active) setRecentAuditsError(cause instanceof Error ? cause.message : "Could not load your recent audits.");
      } finally {
        if (active) setRecentAuditsLoading(false);
      }
    }

    void loadRecentAudits();
    return () => { active = false; };
  }, [authReady, user]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => {
      setLoadingStageIndex((index) => (index + 1) % LOADING_STAGES.length);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    function dismissExportMenu(event: Event) {
      if (event.type === "keydown" && (event as KeyboardEvent).key === "Escape") {
        setExportMenuOpen(false);
      } else if (event.type === "pointerdown" && !(event.target instanceof Node && exportMenuRef.current?.contains(event.target))) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", dismissExportMenu);
    document.addEventListener("keydown", dismissExportMenu);
    return () => {
      document.removeEventListener("pointerdown", dismissExportMenu);
      document.removeEventListener("keydown", dismissExportMenu);
    };
  }, [exportMenuOpen]);

  useEffect(() => {
    if (!result) return;
    const nodes = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter((node): node is HTMLElement => node !== null);
    if (!nodes.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.2, 0.5, 1] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [result, device]);

  const runAudit = useCallback(async (event?: FormEvent, auditUrl = url) => {
    event?.preventDefault();
    if (!auditUrl.trim() || loading || !authReady) return;
    if (!user) {
      window.sessionStorage.setItem(PENDING_AUDIT_STORAGE_KEY, auditUrl);
      router.push("/login");
      return;
    }
    let accessToken: string | undefined;
    try {
      const supabase = getSupabaseClient();
      const sessionResult = await supabase?.auth.getSession();
      if (sessionResult?.error) throw sessionResult.error;
      accessToken = sessionResult?.data.session?.access_token;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to verify your sign-in. Please try again.");
      return;
    }
    if (!accessToken) {
      window.sessionStorage.setItem(PENDING_AUDIT_STORAGE_KEY, auditUrl);
      router.push("/login");
      return;
    }

    setLoadingStageIndex(0);
    setLoading(true);
    setError("");
    setHistorySaveError("");
    setResult(null);
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ url: auditUrl }),
        signal: AbortSignal.timeout(118_000),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.sessionStorage.setItem(PENDING_AUDIT_STORAGE_KEY, auditUrl);
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The audit request failed.");
      if (!data.performance || !data.url || !Array.isArray(data.checks)) throw new Error("The audit returned incomplete report data. Please retry.");
      const completedResult = data as AuditResult;
      const completedAt = new Date().toISOString();
      setResult(completedResult);
      setUrl(completedResult.url);
      setAuditedAt(completedAt);
      setLastAudit({ result: completedResult, auditedAt: completedAt });
      setActiveSection("overview");
      window.scrollTo({ top: 0, behavior: "smooth" });
      const supabase = getSupabaseClient();
      if (!supabase) {
        setHistorySaveError("Audit completed, but history could not be saved because authentication is not configured.");
      } else {
        const storedResult = { ...completedResult, screenshots: undefined };
        try {
          const { data: savedAudit, error: saveError } = await supabase.from("audit_history").insert({
            user_id: user.id,
            target_url: completedResult.url,
            audited_at: completedAt,
            audit_status: "completed",
            result: storedResult,
          }).select("id").single();
          if (saveError) {
            setHistorySaveError(formatAuditHistoryError("Audit completed, but it could not be saved to My tests.", saveError));
          } else {
            setRecentAudits((current) => [{
              id: savedAudit.id,
              target_url: completedResult.url,
              audited_at: completedAt,
              result: storedResult,
            }, ...current.filter((audit) => audit.id !== savedAudit.id)].slice(0, 2));
          }
        } catch (cause) {
          setHistorySaveError(`Audit completed, but it could not be saved to My tests. ${cause instanceof Error ? cause.message : "The history request failed."}`);
        }
      }
    } catch (cause) {
      const reason = cause instanceof Error && cause.name === "TimeoutError" ? "The audit took too long to finish. Please retry." : cause instanceof Error ? cause.message : "Unable to complete this audit.";
      setError(reason);
    } finally {
      setLoading(false);
    }
  }, [authReady, loading, router, user, url]);

  async function signOut() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Authentication is not configured.");
      return;
    }
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
        return;
      }
      setResult(null);
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not log out.");
    }
  }

  function navigateToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
    setDrawerOpen(false);
  }

  function resetDashboard() {
    setResult(null);
    setError("");
    setActiveSection("overview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function shareReport() {
    if (!result) return;
    const summary = `AuditPilot report for ${result.url}\nPerformance: ${activeSpeed?.score ?? "Unavailable"}/100 · Accessibility: ${activeSpeed?.accessibility ?? "Unavailable"}/100 · Best Practices: ${activeSpeed?.bestPractices ?? "Unavailable"}/100 · SEO: ${activeSpeed?.seo ?? "Unavailable"}/100`;
    try {
      if (navigator.share) await navigator.share({ title: `AuditPilot report: ${result.url}`, text: summary });
      else {
        await navigator.clipboard.writeText(summary);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      setError("Sharing was cancelled or is not supported in this browser.");
    }
  }

  function getExportFilename() {
    if (!result) return "auditpilot-report";
    return `auditpilot-${new URL(result.url).hostname.replace(/[^a-z0-9.-]/gi, "-")}-${device}`;
  }

  async function exportDoc() {
    if (!result) return;
    setExportMenuOpen(false);
    setError("");

    try {
      const {
        BorderStyle,
        Document,
        HeadingLevel,
        Packer,
        Paragraph,
        Table,
        TableCell,
        TableRow,
        TextRun,
        WidthType,
      } = await import("docx");
      const speed = result.performance[device];
      const children: (DocxParagraph | DocxTable)[] = [
        new Paragraph({
          children: [new TextRun({ text: "AUDITPILOT  /  WEBSITE AUDIT", bold: true, color: "EA580C", size: 18 })],
          spacing: { after: 160 },
        }),
        new Paragraph({
          text: "Website audit report",
          heading: HeadingLevel.TITLE,
          spacing: { after: 120 },
        }),
        new Paragraph({ children: [new TextRun({ text: result.url, bold: true, color: "121212" })], spacing: { after: 100 } }),
        new Paragraph({
          children: [new TextRun({
            text: `Device: ${device}  |  Audited: ${auditedAt ? new Date(auditedAt).toLocaleString() : "Unavailable"}  |  HTTP status: ${result.status}${result.platform?.name ? `  |  Built with: ${result.platform.name}` : ""}`,
            color: "5F5F5F",
            size: 18,
          })],
          spacing: { after: 260 },
        }),
        new Paragraph({ text: "Score summary", heading: HeadingLevel.HEADING_1, spacing: { before: 160, after: 120 } }),
      ];

      const scoreCells = [
        ["Performance", speed.score],
        ["Accessibility", speed.accessibility],
        ["Best Practices", speed.bestPractices],
        ["SEO", speed.seo],
      ].map(([label, score]) => new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        margins: { top: 120, bottom: 120, left: 120, right: 120 },
        children: [
          new Paragraph({ children: [new TextRun({ text: String(label), color: "5F5F5F", size: 18 })] }),
          new Paragraph({ children: [new TextRun({ text: typeof score === "number" ? `${score}/100` : "Unavailable", bold: true, color: "121212", size: 24 })] }),
        ],
      }));
      children.push(new Table({
        rows: [new TableRow({ children: scoreCells })],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: "E3E1DB" },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: "E3E1DB" },
          left: { style: BorderStyle.SINGLE, size: 4, color: "E3E1DB" },
          right: { style: BorderStyle.SINGLE, size: 4, color: "E3E1DB" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E3E1DB" },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E3E1DB" },
        },
      }));

      const metrics = Object.keys(METRIC_INFO).filter((key) => {
        return typeof speed.metrics?.[key]?.display === "string" ||
          typeof speed.fieldMetrics?.[key]?.display === "string";
      });
      if (metrics.length) {
        children.push(new Paragraph({ text: "Available performance metrics", heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 } }));
        metrics.forEach((key) => {
          const metric = speed.metrics?.[key] ?? speed.fieldMetrics?.[key];
          const source = speed.metrics?.[key]?.display ? "Lab data" : "Field data";
          children.push(new Paragraph({
            children: [
              new TextRun({ text: `${METRIC_INFO[key].label} (${METRIC_INFO[key].fullName}): `, bold: true }),
              new TextRun({ text: `${metric?.display ?? "Unavailable"} (${source})`, color: "5F5F5F" }),
            ],
            bullet: { level: 0 },
            spacing: { after: 60 },
          }));
        });
      }

      const categories = [
        { title: "Opportunities", findings: speed.opportunities ?? [], score: speed.score },
        { title: "Diagnostics", findings: speed.diagnostics ?? [], score: speed.score },
        { title: "Accessibility", findings: speed.accessibilityFindings ?? [], score: speed.accessibility },
        { title: "Best Practices", findings: speed.bestPracticeFindings ?? [], score: speed.bestPractices },
        { title: "SEO", findings: speed.seoFindings ?? [], score: speed.seo },
      ];
      categories.forEach(({ title, findings, score }) => {
        children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 } }));
        const actionableFindings = findings.filter((finding) => finding.status === "warn" || finding.status === "fail");
        if (!actionableFindings.length) {
          children.push(new Paragraph({
            children: [new TextRun({
              text: typeof score === "number" ? "No failing audits were reported." : "Category data is unavailable for this run.",
              color: "5F5F5F",
            })],
            spacing: { after: 100 },
          }));
          return;
        }

        actionableFindings.forEach((finding) => {
          children.push(new Paragraph({
            text: finding.title,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 120, after: 80 },
          }));
          const addDetail = (label: string, value: string) => {
            children.push(new Paragraph({
              children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value })],
              indent: { left: 240 },
              spacing: { after: 60 },
            }));
          };
          if (finding.displayValue) addDetail("Measured value", finding.displayValue);
          if (finding.priority) addDetail("Priority", finding.priority);
          if (finding.savings) {
            const savings = Object.entries(finding.savings)
              .filter(([, value]) => value !== null && value !== undefined)
              .map(([key, value]) => `${key}: ${key === "bytes" ? formatBytes(value) : value}`)
              .join(" | ");
            if (savings) addDetail("PageSpeed potential savings", savings);
          }
          if (finding.recommendation) addDetail("Recommended solution", finding.recommendation);
          finding.resources?.forEach((resource) => {
            const details = Object.entries(resource)
              .map(([key, value]) => `${key}: ${value ?? "Unavailable"}`)
              .join(" | ");
            addDetail("Affected resource", details);
          });
        });
      });

      const document = new Document({
        sections: [{
          properties: {
            page: {
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          children,
        }],
      });
      const file = await Packer.toBlob(document);
      const objectUrl = URL.createObjectURL(file);
      const link = window.document.createElement("a");
      link.href = objectUrl;
      link.download = `${getExportFilename()}.docx`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? `Could not create the DOCX report. ${cause.message}` : "Could not create the DOCX report.");
    }
  }

  async function exportPdf() {
    if (!result) return;
    setExportMenuOpen(false);
    setError("");

    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ format: "a4", unit: "pt" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 44;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      function addText(text: string, options?: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number }) {
        const { size = 10, bold = false, color = [95, 95, 95], indent = 0, gap = 5 } = options ?? {};
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(text, contentWidth - indent);
        const lineHeight = size * 1.45;
        if (y + lines.length * lineHeight > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(lines, margin + indent, y);
        y += lines.length * lineHeight + gap;
      }

      function addSection(title: string) {
        if (y + 40 > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        y += 8;
        pdf.setDrawColor(227, 225, 219);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 19;
        addText(title, { size: 15, bold: true, color: [18, 18, 18], gap: 7 });
      }

      const speed = result.performance[device];
      addText("AUDITPILOT  /  WEBSITE AUDIT", { size: 9, bold: true, color: [234, 88, 12], gap: 8 });
      addText("Website audit report", { size: 24, bold: true, color: [18, 18, 18], gap: 5 });
      addText(result.url, { size: 11, color: [18, 18, 18], gap: 4 });
      addText(`Device: ${device}  |  Audited: ${auditedAt ? new Date(auditedAt).toLocaleString() : "Unavailable"}  |  HTTP status: ${result.status}${result.platform?.name ? `  |  Built with: ${result.platform.name}` : ""}`, { size: 9, gap: 12 });

      addSection("Category scores");
      const scoreColumns = [
        ["Performance", speed.score],
        ["Accessibility", speed.accessibility],
        ["Best Practices", speed.bestPractices],
        ["SEO", speed.seo],
      ] as const;
      scoreColumns.forEach(([label, score]) => {
        addText(`${label}: ${typeof score === "number" ? `${score}/100` : "Unavailable"}`, { size: 10, bold: true, color: [18, 18, 18], indent: 8, gap: 3 });
      });

      const metricKeys = Object.keys(METRIC_INFO);
      const availableMetrics = metricKeys.filter((key) => {
        const metric = speed.metrics?.[key];
        const fieldMetric = speed.fieldMetrics?.[key];
        return typeof metric?.display === "string" || typeof fieldMetric?.display === "string";
      });
      if (availableMetrics.length) {
        addSection("Available performance metrics");
        availableMetrics.forEach((key) => {
          const metric = speed.metrics?.[key] ?? speed.fieldMetrics?.[key];
          const source = speed.metrics?.[key]?.display ? "Lab" : "Field";
          addText(`${METRIC_INFO[key].label} (${METRIC_INFO[key].fullName}): ${metric?.display ?? "Unavailable"} [${source}]`, { size: 9, indent: 8, gap: 3 });
        });
      }

      const categories = [
        { title: "Opportunities", findings: speed.opportunities ?? [], score: speed.score },
        { title: "Diagnostics", findings: speed.diagnostics ?? [], score: speed.score },
        { title: "Accessibility", findings: speed.accessibilityFindings ?? [], score: speed.accessibility },
        { title: "Best Practices", findings: speed.bestPracticeFindings ?? [], score: speed.bestPractices },
        { title: "SEO", findings: speed.seoFindings ?? [], score: speed.seo },
      ];
      categories.forEach(({ title, findings, score }) => {
        addSection(title);
        const actionableFindings = findings.filter((finding) => finding.status === "warn" || finding.status === "fail");
        if (!actionableFindings.length) {
          addText(typeof score === "number" ? "No failing audits were reported." : "Category data is unavailable for this run.", { size: 9, indent: 8, gap: 3 });
          return;
        }
        actionableFindings.forEach((finding) => {
          addText(finding.title, { size: 11, bold: true, color: [18, 18, 18], indent: 8, gap: 4 });
          if (finding.displayValue) addText(`Measured value: ${finding.displayValue}`, { size: 9, indent: 16, gap: 3 });
          if (finding.priority) addText(`Priority: ${finding.priority}`, { size: 9, indent: 16, gap: 3 });
          if (finding.savings) {
            const savings = Object.entries(finding.savings)
              .filter(([, value]) => value !== null && value !== undefined)
              .map(([key, value]) => `${key}: ${key === "bytes" ? formatBytes(value) : value}`)
              .join(" | ");
            if (savings) addText(`PageSpeed potential savings: ${savings}`, { size: 9, indent: 16, gap: 3 });
          }
          if (finding.recommendation) addText(`Recommended solution: ${finding.recommendation}`, { size: 9, indent: 16, gap: 3 });
          finding.resources?.forEach((resource) => {
            const details = Object.entries(resource).map(([key, value]) => `${key}: ${value ?? "Unavailable"}`).join(" | ");
            addText(`Affected resource: ${details}`, { size: 8, indent: 16, gap: 3 });
          });
          y += 5;
        });
      });

      const pageCount = pdf.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(122, 122, 122);
        pdf.text(`AuditPilot  |  ${page} / ${pageCount}`, pageWidth - margin, pageHeight - 20, { align: "right" });
      }
      pdf.save(`${getExportFilename()}.pdf`);
    } catch (cause) {
      setError(cause instanceof Error ? `Could not create the PDF report. ${cause.message}` : "Could not create the PDF report.");
    }
  }

  const mobileScreenshot = result?.screenshots?.mobile;
  const desktopScreenshot = result?.screenshots?.desktop;

  return (
    <main id="top" className="min-h-screen bg-[#080f20] text-slate-100">
      <div className="ambient-lines" aria-hidden="true"><i /><i /><i /></div>
      {!result ? (
        <>
          <header className="site-header relative z-40 border-b border-white/[0.07]">
            <div className="mx-auto flex min-h-[76px] max-w-[1320px] items-center justify-between gap-4 px-5 lg:px-8">
              <a href="#home" className="flex shrink-0 items-center gap-2.5 text-white"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-cyan-300"><Zap size={19} fill="currentColor" /></span><span className="text-[17px] font-semibold">AuditPilot</span></a>
              <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex" aria-label="Main navigation"><a href="#home" className="hover:text-white">Home</a><a href="#features" className="hover:text-white">Features</a><a href="#pricing" className="hover:text-white">Pricing</a><a href="#recent" className="hover:text-white">Reports</a></nav>
              <div className="flex shrink-0 items-center gap-2">{user ? <ProfileMenu user={user} onSignOut={() => void signOut()} /> : <button onClick={() => setAuthModalOpen(true)} className="min-h-10 rounded-xl px-3 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">Sign in</button>}<button onClick={() => auditFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} className="primary-button hidden sm:flex"><Zap size={15} />Start audit</button></div>
            </div>
          </header>

          <section id="home" className="hero-section relative w-full px-5 py-16 sm:py-20 lg:min-h-[690px] lg:px-8 lg:py-24">
            <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/[0.07] px-3 py-1.5 text-xs text-indigo-100"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />Website performance intelligence</div>
              <h1 className="max-w-[760px] text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-5xl">Performance insights for a <span className="text-gradient">faster, healthier website.</span></h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400">Analyze website speed, Core Web Vitals, SEO, accessibility, and technical issues in one comprehensive report.</p>

              <form ref={auditFormRef} onSubmit={runAudit} className="audit-form mt-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b1428]/80 p-2.5 shadow-2xl shadow-black/25 backdrop-blur-xl">
                <label htmlFor="audit-url" className="sr-only">Website URL</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3"><Globe2 size={18} className="shrink-0 text-slate-500" /><input id="audit-url" type="url" inputMode="url" autoComplete="url" spellCheck={false} required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://yourwebsite.com" className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /></div>
                  <button type="submit" disabled={loading || !authReady || !url.trim()} className="primary-button disabled:cursor-not-allowed disabled:opacity-50">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Zap size={16} />}{loading ? "Auditing" : "Run Audit"}</button>
                </div>
              </form>

              {loading && (
                <div role="status" aria-live="polite" aria-atomic="true" className="audit-progress mt-4 w-full max-w-2xl">
                  <div className="audit-progress-header">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="audit-progress-icon" aria-hidden="true">
                        <LoaderCircle size={18} className="animate-spin" />
                      </span>
                      <p className="audit-progress-title">Running live audit</p>
                    </div>
                    <span className="audit-progress-eta">Usually under a minute</span>
                  </div>
                  <div className="loading-track" aria-hidden="true"><i /></div>
                  <div className="audit-progress-stage">
                    <span className="audit-progress-dot" aria-hidden="true" />
                    <span>Current step</span>
                    <span key={loadingStageIndex} className="loading-stage-text">{LOADING_STAGES[loadingStageIndex]}</span>
                  </div>
                </div>
              )}
              {error && <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-100"><span>{error}</span><button onClick={() => runAudit()} className="shrink-0 font-medium underline underline-offset-2">Retry</button></div>}

              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-400" />Mobile & desktop</span><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-400" />Lighthouse-powered</span><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-400" />{user ? "Signed in" : "Sign in required to run an audit"}</span></div>
            </div>
          </section>

          <section id="features" className="relative border-t border-white/[0.06] bg-[#0b1428]/65 px-5 py-16 lg:px-8">
            <div className="mx-auto max-w-[1320px]"><div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">One clear report</p><h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">The details that move your site forward</h2></div><p className="max-w-md text-sm leading-6 text-slate-400">Evidence-led insights from PageSpeed and the page itself, organized by device and category.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{FEATURES.map(({ icon: Icon, title, text, color }) => <article key={title} className="feature-card rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.045] ${color}`}><Icon size={20} /></span><h3 className="mt-5 text-sm font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></article>)}</div></div>
          </section>

          <section id="pricing" className="relative border-y border-white/[0.06] bg-[#0b1428]/45 px-5 py-16 lg:px-8">
            <div className="mx-auto max-w-[1320px]">
              <div className="mx-auto mb-9 max-w-2xl text-center">
                <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Simple, transparent plans</p>
                <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Pricing that grows with your audits</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">Choose the monthly audit allowance and export options that fit your workflow.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {PRICING_PLANS.map((plan) => (
                  <article key={plan.name} className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                      {plan.name === "Starter" && <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-cyan-200">Popular</span>}
                    </div>
                    <p className="mt-4 flex items-baseline gap-1"><span className="text-4xl font-semibold tracking-tight text-white">${plan.price}</span><span className="text-sm text-slate-400">/ month</span></p>
                    <div className="mt-5 space-y-3 border-t border-white/[0.08] pt-5 pb-5 text-sm">
                      <p className="flex items-center justify-between gap-3"><span className="text-slate-300">Audit tests</span><span className="font-medium text-white">{plan.audits}</span></p>
                      <p className="flex items-center justify-between gap-3"><span className="text-slate-300">Export results as PDF</span><span className={plan.pdf ? "font-medium text-emerald-300" : "text-slate-500"}>{plan.pdf ? "Yes" : "No"}</span></p>
                      <p className="flex items-center justify-between gap-3"><span className="text-slate-300">Export results as DOC</span><span className={plan.doc ? "font-medium text-emerald-300" : "text-slate-500"}>{plan.doc ? "Yes" : "No"}</span></p>
                    </div>
                    <div className="mt-auto border-t border-white/[0.08] pt-5">
                      <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Included features</p>
                      {plan.features.map((feature) => <p key={feature} className="flex items-start gap-2 text-sm leading-5 text-slate-300"><Check size={15} className="mt-0.5 shrink-0 text-cyan-300" />{feature}</p>)}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="recent" className="mx-auto grid max-w-[1320px] gap-8 px-5 py-16 lg:grid-cols-[1.2fr_.8fr] lg:px-8">
            <div>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <SectionHeading eyebrow="Reports" title="Recent audits" description={user ? "Your two latest saved website audits." : "Your latest audit is available during this browser session."} />
                {user && <Link href="/my-tests" className="secondary-button inline-flex shrink-0 items-center gap-2">View all <ArrowUpRight size={15} /></Link>}
              </div>
              <div className="recent-audit-card space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                {user ? recentAuditsLoading ? (
                  <div role="status" className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin text-cyan-300" />Loading your recent audits…</div>
                ) : recentAuditsError ? (
                  <p role="alert" className="text-sm text-rose-200">{recentAuditsError}</p>
                ) : recentAudits.length ? recentAudits.map((audit) => (
                  <div key={audit.id} className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-3 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{audit.target_url}</p>
                      <p className="mt-1 text-xs text-slate-500">{new Date(audit.audited_at).toLocaleString()}</p>
                    </div>
                    <button type="button" onClick={() => {
                      setResult(audit.result);
                      setAuditedAt(audit.audited_at);
                      setLastAudit({ result: audit.result, auditedAt: audit.audited_at });
                      setUrl(audit.target_url);
                      setActiveSection("overview");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }} className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-cyan-200">Open report</button>
                  </div>
                )) : (
                  <div className="flex items-center gap-3 text-sm text-slate-400"><CalendarClock size={17} className="text-slate-500" />Your saved audits will appear here after you complete one.</div>
                ) : lastAudit ? (
                  <button type="button" onClick={() => { setResult(lastAudit.result); setAuditedAt(lastAudit.auditedAt); setUrl(lastAudit.result.url); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex w-full items-center justify-between gap-4 text-left">
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{lastAudit.result.url}</p><p className="mt-1 text-xs text-slate-500">{new Date(lastAudit.auditedAt).toLocaleString()}</p></div>
                    <span className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-cyan-200">Open report</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 text-sm text-slate-400"><CalendarClock size={17} className="text-slate-500" />Your completed audits will appear here during this session.</div>
                )}
              </div>
            </div>
            <div id="dashboard" className="recent-cta rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6"><p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Ready when you are</p><h2 className="mt-3 text-xl font-semibold text-white">Know what is slowing your site down.</h2><p className="mt-2 text-sm leading-6 text-slate-400">Run a mobile and desktop audit to get a prioritized, evidence-based report.</p><button onClick={() => auditFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-white">Start your audit <ArrowUpRight size={15} /></button></div>
          </section>

          <footer className="border-t border-white/[0.06] px-5 py-6 text-center text-xs text-slate-600">© 2026 AuditPilot. Built for clearer web performance decisions.</footer>
        </>
      ) : (
        <div className="relative mx-auto flex max-w-[1680px] gap-5 px-3 py-4 sm:px-5 lg:px-6">
          <ResultSidebar active={activeSection} collapsed={collapsed} setCollapsed={setCollapsed} drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} device={device} url={result.url} counts={findingsCounts} onNavigate={navigateToSection} onHome={resetDashboard} />
          <div className="min-w-0 flex-1">
            <div className="glass-panel sticky top-3 z-30 mb-5 flex min-h-14 items-center justify-between gap-3 rounded-xl px-3 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-2"><button onClick={() => setDrawerOpen(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Open report navigation"><Menu size={19} /></button><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{result.url}</p><p className="hidden text-[11px] text-slate-500 sm:block">{auditedAt ? new Date(auditedAt).toLocaleString() : "Audit completed"} · {result.status} response · {result.redirects ?? "n/a"} redirects</p></div></div>
              <div className="hidden shrink-0 lg:block"><DeviceSelector device={device} onChange={setDevice} /></div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                {user && <ProfileMenu user={user} onSignOut={() => void signOut()} />}
                <button onClick={() => runAudit()} disabled={loading} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-xs text-slate-300 hover:bg-white/[0.08] disabled:opacity-50 sm:px-3"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /><span className="hidden sm:inline">Re-run Audit</span></button>
                <button onClick={shareReport} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-xs text-slate-300 hover:bg-white/[0.08] sm:px-3"><Share2 size={14} /><span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span></button>
                <div ref={exportMenuRef} className="relative">
                  <button type="button" aria-haspopup="menu" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen((open) => !open)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-indigo-500/20 px-2.5 text-xs text-indigo-100 hover:bg-indigo-500/30 sm:px-3">
                    <Download size={14} /><span>Export</span><ChevronDown size={13} className={`transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
                  </button>
                  {exportMenuOpen && <div role="menu" aria-label="Export report" className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#101a2d] p-1.5 shadow-xl shadow-black/30">
                    <button type="button" role="menuitem" onClick={exportDoc} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-white/[0.07]"><FileText size={15} className="text-slate-400" />Export as DOCX</button>
                    <button type="button" role="menuitem" onClick={exportPdf} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-200 hover:bg-white/[0.07]"><FileDown size={15} className="text-slate-400" />Export as a PDF</button>
                  </div>}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200">{error}</p>}
              {historySaveError && <p role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-sm text-amber-200">{historySaveError}</p>}
              <section id="overview" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-center gap-3">{result.favicon ? <Image src={result.favicon} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 p-2" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-200"><Globe2 size={18} /></span>}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="max-w-full break-all text-lg font-semibold text-white">{new URL(result.url).hostname}</p><a href={result.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-cyan-300" aria-label="Open audited website"><ExternalLink size={15} /></a></div><p className="mt-1 truncate text-xs text-slate-500">{result.url}</p><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"><span className="font-medium text-slate-500">Built with</span>{result.platform ? <><span className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 font-medium text-orange-800">{result.platform.name}</span><span className="text-slate-500">{result.platform.confidence === "high" ? "Strong match" : "Likely match"}</span></> : <span className="text-slate-500">Not detected from available site markers</span>}</div></div></div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:justify-end"><span className="text-xs text-slate-500">{auditedAt ? new Date(auditedAt).toLocaleString() : "Audit time unavailable"}</span><div className="lg:hidden"><DeviceSelector device={device} onChange={setDevice} /></div></div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ScoreCard label="Performance" score={activeSpeed?.score} icon={Gauge} section="performance" /><ScoreCard label="Accessibility" score={activeSpeed?.accessibility} icon={Accessibility} section="accessibility" /><ScoreCard label="Best Practices" score={activeSpeed?.bestPractices} icon={ShieldCheck} section="best-practices" /><ScoreCard label="SEO" score={activeSpeed?.seo} icon={SearchCheck} section="seo" /></div>
                {activeSpeed?.error && <div role="status" className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm leading-6 text-amber-100">
                    <p className="font-medium">PageSpeed data unavailable for {device}</p>
                    <p className="mt-1 break-words text-amber-100/70">{activeSpeed.error}</p>
                    {pageSpeedTimedOut && (mobileScreenshot || desktopScreenshot) && <p className="mt-1 text-amber-100/70">The page capture succeeded, but Lighthouse did not return results before the time limit.</p>}
                  </div>
                  {pageSpeedTimedOut && <button type="button" onClick={() => void runAudit()} disabled={loading} className="shrink-0 rounded-lg border border-amber-200/20 px-3 py-2 text-sm text-amber-100 hover:bg-amber-100/10 disabled:cursor-not-allowed disabled:opacity-50">Retry audit</button>}
                </div>}
                {pageStatusIssues.length > 0 && <div className="mt-4 space-y-2">{pageStatusIssues.map((check) => <div key={check.id} className="rounded-xl border border-rose-400/10 bg-rose-400/[0.035] p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-200">{check.label}: {check.value}</p>{check.priority && <span className="text-[11px] text-rose-300">{check.priority} priority</span>}</div>{check.resource && <p className="mt-1 break-all font-mono text-xs text-slate-400">Affected URL: {check.resource}</p>}{check.fix && <p className="mt-1 text-xs leading-5 text-slate-400">Recommended solution: {check.fix}</p>}</div>)}</div>}
                <div className="device-captures mt-6 grid gap-8 border-t border-white/[0.07] pt-5 sm:grid-cols-2">
                  {([
                    ["mobile", "Mobile capture", mobileScreenshot],
                    ["desktop", "Desktop capture", desktopScreenshot],
                  ] as [Device, string, string | undefined][]).map(([captureDevice, label, screenshot]) => (
                    <div key={captureDevice} className="min-w-0">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">{label}</p>
                        {screenshot ? <button type="button" onClick={() => setScreenshotOpen(screenshot)} className="text-xs text-cyan-200 hover:text-white">Enlarge</button> : <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Unavailable</span>}
                      </div>
                      {screenshot ? (
                        <DevicePreview device={captureDevice} screenshot={screenshot} />
                      ) : (
                        <p className="text-xs text-slate-500">No capture was returned for this device.</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section id="performance" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
                <SectionHeading eyebrow={`${device} lab audit`} title="Performance" />
                <div className="mb-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.07] bg-slate-950/25 p-4"><p className="text-xs text-slate-500">Performance score</p><p className="mt-2 font-mono text-3xl text-white">{activeSpeed?.score ?? "Unavailable"}<span className="ml-1 text-sm text-slate-500">{activeSpeed?.score !== null && activeSpeed?.score !== undefined ? "/100" : ""}</span></p><p className={`mt-2 text-xs ${scoreStatus(activeSpeed?.score).color}`}>{scoreStatus(activeSpeed?.score).label}</p></div>
                  <div className="rounded-xl border border-white/[0.07] bg-slate-950/25 p-4"><p className="text-xs text-slate-500">Audit strategy</p><p className="mt-2 font-mono text-xl capitalize text-white">{device}</p></div>
                </div>
                <MetricCards speed={activeSpeed} />
              </section>

              <section id="vitals" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
                <SectionHeading eyebrow="Chrome UX Report" title="Core Web Vitals" />
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-slate-950/25 p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-200">Core Web Vitals Assessment</p>
                    <p className="mt-1 text-xs text-slate-500">Based on Google field data at the 75th percentile</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-sm font-medium ${activeSpeed?.cwvAssessment === "passed" ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300" : activeSpeed?.cwvAssessment === "failed" ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-300" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>
                    {activeSpeed?.cwvAssessment === "passed" ? "Passed" : activeSpeed?.cwvAssessment === "failed" ? "Failed" : "Unavailable"}
                  </span>
                </div>
                <p className="mb-3 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  {activeSpeed?.fieldDataSource === "url" ? "URL field data" : activeSpeed?.fieldDataSource === "origin" ? "Origin field data" : "Field data unavailable; showing lab values where available"}
                  {activeSpeed?.fieldDataSource && " · 75th percentile"}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {coreWebVitalKeys.map((key) => {
                    const fieldMetric = activeSpeed?.fieldMetrics?.[key];
                    const labMetric = activeSpeed?.metrics?.[key];
                    const metric = typeof fieldMetric?.display === "string" || typeof fieldMetric?.value === "number"
                      ? fieldMetric
                      : labMetric;
                    const isFieldMetric = metric === fieldMetric;
                    const display = metric?.display ?? (typeof metric?.value === "number" ? String(metric.value) : "Unavailable");
                    return (
                      <article key={key} className="rounded-xl border border-white/[0.07] bg-slate-950/25 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm leading-5 text-slate-200">{METRIC_INFO[key].fullName} <span className="font-mono text-xs text-slate-500">({METRIC_INFO[key].label})</span></p>
                          <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-slate-500">{display === "Unavailable" ? "Unavailable" : isFieldMetric ? "Field" : "Lab"}</span>
                        </div>
                        <p className="mt-3 font-mono text-2xl text-white">{display}</p>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section id="opportunities" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="PageSpeed findings" title="Opportunities" count={activeSpeed?.opportunities?.length ?? 0} /><FindingList findings={activeSpeed?.opportunities ?? []} empty={emptyFindingsMessage(activeSpeed?.score, activeSpeed?.diagnostics?.length ? "No potential savings were reported for the remaining findings." : "No failing performance audits were reported.")} /></section>

              <section id="diagnostics" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="PageSpeed findings" title="Diagnostics" count={activeSpeed?.diagnostics?.length ?? 0} /><FindingList findings={activeSpeed?.diagnostics ?? []} empty={emptyFindingsMessage(activeSpeed?.score, activeSpeed?.opportunities?.length ? "No additional findings without reported savings were returned." : "No failing performance audits were reported.")} /></section>

              <section id="accessibility" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
                <SectionHeading eyebrow="PageSpeed findings" title="Accessibility Report" count={activeSpeed?.accessibilityFindings?.length ?? 0} />
                <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(210px,0.8fr)_minmax(0,1.5fr)] xl:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.8fr)]">
                  <ScoreCard label="Accessibility" score={activeSpeed?.accessibility} icon={Accessibility} section="accessibility" />
                  <FindingList findings={activeSpeed?.accessibilityFindings ?? []} empty={emptyFindingsMessage(activeSpeed?.accessibility, "No failing accessibility audits were reported.")} />
                </div>
              </section>

              <section id="best-practices" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="PageSpeed findings" title="Best Practices" count={activeSpeed?.bestPracticeFindings?.length ?? 0} /><FindingList findings={activeSpeed?.bestPracticeFindings ?? []} empty={emptyFindingsMessage(activeSpeed?.bestPractices, "No failing Best Practices audits were reported.")} /></section>

              <section id="seo" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
                <SectionHeading eyebrow="PageSpeed findings" title="SEO Report" count={findingsCounts.seo} />
                <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(210px,0.8fr)_minmax(0,1.5fr)] xl:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.8fr)]">
                  <ScoreCard label="Lighthouse SEO" score={activeSpeed?.seo} icon={SearchCheck} section="seo" />
                  <FindingList findings={activeSpeed?.seoFindings ?? []} empty={emptyFindingsMessage(activeSpeed?.seo, "No failing SEO audits were reported.")} />
                </div>
              </section>

              <section id="screenshots" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
                <SectionHeading
                  title="Page load filmstrip"
                />
                <h3 className="mb-3 text-sm font-medium text-white">{device === "mobile" ? "Mobile" : "Desktop"}</h3>
                {activeSpeed?.filmstrip?.length ? (
                  <div className={`filmstrip-strip filmstrip-strip-${device}`}>
                    {activeSpeed.filmstrip.map((frame, index) => (
                      <div key={`${index}-${frame.timing}`} className="filmstrip-card">
                        <button
                          type="button"
                          onClick={() => setScreenshotOpen(frame.data)}
                          className="filmstrip-image"
                          style={{ aspectRatio: device === "mobile" ? "390 / 844" : "1440 / 900" }}
                        >
                          <img className="bg-white"  src={frame.data} alt={`Lighthouse ${device} filmstrip frame ${index + 1}`} />
                        </button>
                        <p className="filmstrip-timing">{frame.timing === null ? `Frame ${index + 1}` : `${frame.timing} ms`}</p>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState label="No filmstrip frames were provided by this Lighthouse run." />}
              </section>

              <footer className="flex items-center justify-between border-t border-white/[0.06] py-5 text-xs text-slate-600"><button onClick={resetDashboard} className="inline-flex items-center gap-2 hover:text-slate-300"><ArrowLeft size={14} />Dashboard</button><span>AuditPilot · Lighthouse-based report</span></footer>
            </div>
          </div>
        </div>
      )}
      {screenshotOpen && <div role="dialog" aria-modal="true" aria-label="Enlarged screenshot" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setScreenshotOpen(null)}><button onClick={() => setScreenshotOpen(null)} className="absolute right-5 top-5 rounded-lg bg-white/10 p-2 text-white" aria-label="Close screenshot"><X size={20} /></button><img src={screenshotOpen} alt="Enlarged audit screenshot" className="max-h-[92vh] max-w-[96vw] object-contain" onClick={(event) => event.stopPropagation()} /></div>}
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} onAuthenticated={(authenticatedUser) => setUser(authenticatedUser)} />
    </main>
  );
}
