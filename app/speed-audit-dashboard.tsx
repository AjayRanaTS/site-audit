"use client";

import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Accessibility,
  CalendarClock,
  Check,
  ChevronDown,
  CircleCheck,
  Download,
  ExternalLink,
  Gauge,
  Globe2,
  Images,
  Info,
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
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import AuthModal from "@/components/auth-modal";
import ProfileMenu from "@/components/profile-menu";
import ThemeSwitch from "@/components/theme-switch";
import { getSupabaseClient } from "@/lib/supabase/client";

type Device = "mobile" | "desktop";
type AuditStatus = "pass" | "warn" | "fail" | "manual";
type Metric = { display: string | null; value: number | null };
type Finding = {
  id: string;
  title: string;
  description: string;
  displayValue: string | null;
  score: number | null;
  status: AuditStatus;
  savingsMs: number;
  resources: Record<string, string | number | null>[];
  category?: string;
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
  opportunities?: Finding[];
  diagnostics?: Finding[];
  accessibilityFindings?: Finding[];
  bestPracticeFindings?: Finding[];
  seoFindings?: Finding[];
  passed?: Finding[];
  tips?: { title: string; savingsMs: number }[];
  insight?: string[];
  filmstrip?: { data: string; timing: number | null }[];
  technical?: Record<string, unknown>;
};
type Check = { id: string; label: string; status: Exclude<AuditStatus, "manual">; value: string; fix?: string };
type ImageEntry = {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
  format: string;
  loading: string;
  status: Exclude<AuditStatus, "manual">;
  issues: string[];
  recommendation: string;
};
export type AuditResult = {
  url: string;
  status: number;
  redirects?: number;
  seoScore: number;
  favicon?: string | null;
  checks: Check[];
  images?: ImageEntry[];
  screenshots?: { mobile?: string; desktop?: string };
  performance: { mobile: Speed; desktop: Speed };
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
  { id: "passed", label: "Passed Audits", icon: CircleCheck },
  { id: "technical", label: "Technical Details", icon: Info },
  { id: "screenshots", label: "Screenshots & Filmstrip", icon: Images },
];

const METRIC_INFO: Record<string, { label: string; fullName: string; good: number; poor: number; unit: string; explanation: string }> = {
  lcp: { label: "LCP", fullName: "Largest Contentful Paint", good: 2500, poor: 4000, unit: "ms", explanation: "Time until the largest visible content element is rendered." },
  inp: { label: "INP", fullName: "Interaction to Next Paint", good: 200, poor: 500, unit: "ms", explanation: "How quickly the page responds visually to user interactions. Field data only." },
  cls: { label: "CLS", fullName: "Cumulative Layout Shift", good: 0.1, poor: 0.25, unit: "", explanation: "Measures unexpected movement of visible page content." },
  fcp: { label: "FCP", fullName: "First Contentful Paint", good: 1800, poor: 3000, unit: "ms", explanation: "Time until the first text or image is rendered." },
  si: { label: "Speed Index", fullName: "Speed Index", good: 3400, poor: 5800, unit: "ms", explanation: "How quickly page content is visually populated." },
  tbt: { label: "TBT", fullName: "Total Blocking Time", good: 200, poor: 600, unit: "ms", explanation: "Time the main thread is blocked and unable to respond during loading." },
  ttfb: { label: "TTFB", fullName: "Time to First Byte", good: 800, poor: 1800, unit: "ms", explanation: "Time between the request and the first response byte. Field data may be unavailable." },
};

const FEATURES: { icon: LucideIcon; title: string; text: string; color: string }[] = [
  { icon: Activity, title: "Performance & Core Web Vitals", text: "See lab and field metrics with clear thresholds and device context.", color: "text-cyan-300" },
  { icon: SearchCheck, title: "SEO & Technical Audits", text: "Review page metadata, crawl signals, images, and Lighthouse SEO checks.", color: "text-indigo-300" },
  { icon: Accessibility, title: "Accessibility Analysis", text: "Find audited accessibility issues, affected elements, and manual checks.", color: "text-emerald-300" },
  { icon: Sparkles, title: "Actionable Recommendations", text: "Prioritize Lighthouse opportunities with estimated savings and affected resources.", color: "text-amber-300" },
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
    typeof candidate.seoScore === "number" &&
    Array.isArray(candidate.checks) &&
    Boolean(candidate.performance && typeof candidate.performance === "object");
}

function scoreStatus(score: number | null | undefined) {
  if (typeof score !== "number") return { label: "Unavailable", color: "text-slate-400", ring: "#64748b" };
  if (score >= 90) return { label: "Good", color: "text-emerald-300", ring: "#10b981" };
  if (score >= 50) return { label: "Needs improvement", color: "text-amber-300", ring: "#f59e0b" };
  return { label: "Poor", color: "text-rose-300", ring: "#ef4444" };
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
  if (!findings.length) return <EmptyState label={empty} />;
  return (
    <div className="space-y-2">
      {findings.map((finding) => {
        const status = scoreStatus(finding.score === null ? null : finding.score * 100);
        const tone = finding.status === "pass" ? "text-emerald-300" : finding.status === "fail" ? "text-rose-300" : finding.status === "manual" ? "text-cyan-300" : "text-amber-300";
        return (
          <details key={finding.id} open={expandAll || undefined} className="finding-row group rounded-xl border border-white/[0.08] bg-slate-950/20 open:bg-slate-950/35">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${finding.status === "pass" ? "bg-emerald-400" : finding.status === "fail" ? "bg-rose-400" : finding.status === "manual" ? "bg-cyan-300" : "bg-amber-400"}`} />
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-100">{finding.title}</span>
              {finding.displayValue && <span className="hidden max-w-[34%] truncate text-xs text-slate-400 sm:block">{finding.displayValue}</span>}
              {finding.savingsMs > 0 && <span className="shrink-0 rounded-md bg-emerald-400/10 px-2 py-1 font-mono text-[11px] text-emerald-300">-{(finding.savingsMs / 1000).toFixed(2)}s</span>}
              <span className={`shrink-0 text-[11px] ${tone}`}>{finding.status === "manual" ? "Manual check" : status.label}</span>
              <ChevronDown size={15} className="shrink-0 text-slate-500 transition group-open:rotate-180" />
            </summary>
            <div className="border-t border-white/[0.07] px-4 pb-4 pt-3">
              {finding.displayValue && <p className="mb-2 text-xs text-cyan-200 sm:hidden">{finding.displayValue}</p>}
              <p className="text-sm leading-6 text-slate-300">{finding.description || "No further explanation was supplied by Lighthouse."}</p>
              {finding.resources.length > 0 && <div className="mt-3 space-y-2"><p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Affected items</p>{finding.resources.map((resource, index) => <div key={`${finding.id}-${index}`} className="rounded-lg border border-white/[0.06] bg-black/20 p-3 font-mono text-[11px] leading-5 text-slate-300">{Object.entries(resource).map(([key, value]) => <div key={key} className="break-all"><span className="text-slate-500">{key}: </span>{String(value)}</div>)}</div>)}</div>}
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
  return (
    <>
    {speed?.error && <div role="status" className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-sm leading-6 text-amber-100"><p className="font-medium">PageSpeed data unavailable</p><p className="mt-1 text-amber-100/70">{speed.error}</p></div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {keys.map((key) => {
        const info = METRIC_INFO[key];
        const lab = speed?.metrics?.[key];
        const field = speed?.fieldMetrics?.[key];
        const value = lab?.display ?? field?.display;
        const numeric = lab?.value ?? field?.value;
        const status = typeof numeric !== "number" ? null : numeric <= info.good ? "Good" : numeric <= info.poor ? "Needs improvement" : "Poor";
        const color = status === "Good" ? "text-emerald-300" : status === "Needs improvement" ? "text-amber-300" : status === "Poor" ? "text-rose-300" : "text-slate-500";
        return <article key={key} className="rounded-xl border border-white/[0.08] bg-slate-950/25 p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-mono text-xs font-semibold text-cyan-200">{info.label}</p><p className="mt-1 text-[11px] text-slate-500">{info.fullName}</p></div><Info size={14} className="mt-0.5 shrink-0 text-slate-600" aria-label={info.explanation} /></div><p className="mt-4 font-mono text-2xl font-medium tabular-nums text-white">{value ?? "Unavailable"}</p><div className="mt-2 flex items-center justify-between gap-2"><span className={`text-xs ${color}`}>{status ?? "No data"}</span><span className="text-[10px] text-slate-500">{lab?.value !== null && lab?.value !== undefined ? "Lab data" : field?.value !== null && field?.value !== undefined ? "Field data" : "No data"}</span></div><p className="mt-3 text-xs leading-5 text-slate-500">{info.explanation}</p></article>;
      })}
    </div>
    </>
  );
}

function ResultSidebar({ active, collapsed, setCollapsed, drawerOpen, setDrawerOpen, device, url, counts, onNavigate, onHome }: {
  active: string; collapsed: boolean; setCollapsed: (value: boolean) => void; drawerOpen: boolean; setDrawerOpen: (value: boolean) => void;
  device: Device; url: string; counts: Record<string, number>; onNavigate: (id: string) => void; onHome: () => void;
}) {
  const content = <>
    <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} border-b border-white/[0.07] px-4 py-4`}>
      {!collapsed && <a href="#top" className="flex items-center gap-2.5 text-white"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-cyan-300"><Zap size={17} fill="currentColor" /></span><span className="font-semibold">SpeedAudit</span></a>}
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [url, setUrl] = useState("");
  const [device, setDevice] = useState<Device>("mobile");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [showCapturedPreviews, setShowCapturedPreviews] = useState(false);
  const [auditedAt, setAuditedAt] = useState<string | null>(null);
  const [lastAudit, setLastAudit] = useState<{ result: AuditResult; auditedAt: string } | null>(null);
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
  const auditFormRef = useRef<HTMLFormElement>(null);
  const activeSpeed = result?.performance[device];
  const findings = activeSpeed;
  const localIssues = result?.checks.filter((check) => check.status !== "pass") ?? [];
  const findingsCounts: Record<string, number> = {
    opportunities: findings?.opportunities?.length ?? 0,
    diagnostics: findings?.diagnostics?.length ?? 0,
    accessibility: findings?.accessibilityFindings?.filter((item) => item.status !== "pass").length ?? 0,
    "best-practices": findings?.bestPracticeFindings?.filter((item) => item.status !== "pass").length ?? 0,
    seo: (findings?.seoFindings?.filter((item) => item.status !== "pass").length ?? 0) + localIssues.length,
    passed: findings?.passed?.length ?? 0,
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
      const savedTheme = window.localStorage.getItem("speedaudit-theme");
      const initialTheme = savedTheme === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = initialTheme;
      setTheme(initialTheme);
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
        setShowCapturedPreviews(false);
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
    if (!loading) return;
    const timer = window.setInterval(() => {
      setLoadingStageIndex((index) => (index + 1) % LOADING_STAGES.length);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!showCapturedPreviews) return;
    const timer = window.setTimeout(() => setShowCapturedPreviews(false), 3200);
    return () => window.clearTimeout(timer);
  }, [showCapturedPreviews]);

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
    setShowCapturedPreviews(false);
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ url: auditUrl }),
        signal: AbortSignal.timeout(58_000),
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
      setShowCapturedPreviews(true);
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
          const { error: saveError } = await supabase.from("audit_history").insert({
            user_id: user.id,
            target_url: completedResult.url,
            audited_at: completedAt,
            audit_status: "completed",
            result: storedResult,
          });
          if (saveError) {
            setHistorySaveError(`Audit completed, but it could not be saved to My tests. ${saveError.message}`);
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
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    setResult(null);
    setShowCapturedPreviews(false);
    router.replace("/");
  }

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("speedaudit-theme", nextTheme);
    setTheme(nextTheme);
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
    const summary = `SpeedAudit report for ${result.url}\nPerformance: ${activeSpeed?.score ?? "Unavailable"}/100 · Accessibility: ${activeSpeed?.accessibility ?? "Unavailable"}/100 · Best Practices: ${activeSpeed?.bestPractices ?? "Unavailable"}/100 · SEO: ${activeSpeed?.seo ?? "Unavailable"}/100`;
    try {
      if (navigator.share) await navigator.share({ title: `SpeedAudit report: ${result.url}`, text: summary });
      else {
        await navigator.clipboard.writeText(summary);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      setError("Sharing was cancelled or is not supported in this browser.");
    }
  }

  function exportReport() {
    if (!result) return;
    const file = new Blob([JSON.stringify({ auditedAt, device, ...result }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `speedaudit-${new URL(result.url).hostname}-${device}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const mobileScreenshot = result?.screenshots?.mobile;
  const desktopScreenshot = result?.screenshots?.desktop;
  const unavailableFindings = (message: string) => <EmptyState label={message} />;

  return (
    <main id="top" className="min-h-screen bg-[#080f20] text-slate-100">
      <div className="ambient-lines" aria-hidden="true"><i /><i /><i /></div>
      {!result || showCapturedPreviews ? (
        <>
          <header className="site-header relative z-10 border-b border-white/[0.07]">
            <div className="mx-auto flex min-h-[76px] max-w-[1320px] items-center justify-between gap-4 px-5 lg:px-8">
              <a href="#home" className="flex shrink-0 items-center gap-2.5 text-white"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-cyan-300"><Zap size={19} fill="currentColor" /></span><span className="text-[17px] font-semibold">SpeedAudit</span></a>
              <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex" aria-label="Main navigation"><a href="#home" className="hover:text-white">Home</a><a href="#features" className="hover:text-white">Features</a><a href="#pricing" className="hover:text-white">Pricing</a><a href="#recent" className="hover:text-white">Reports</a></nav>
              <div className="flex shrink-0 items-center gap-2">{user ? <ProfileMenu user={user} onSignOut={() => void signOut()} /> : <button onClick={() => setAuthModalOpen(true)} className="min-h-10 rounded-xl px-3 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">Sign in</button>}<ThemeSwitch theme={theme} onToggle={toggleTheme} /><button onClick={() => auditFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} className="hidden min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 text-sm font-semibold text-white transition hover:brightness-110 sm:flex"><Zap size={15} />Start audit</button></div>
            </div>
          </header>

          <section id="home" className="hero-section relative mx-auto grid max-w-[1320px] items-center gap-12 px-5 pb-16 pt-14 lg:min-h-[690px] lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-20">
            <div className="relative z-10 max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/[0.07] px-3 py-1.5 text-xs text-indigo-100"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />Website performance intelligence</div>
              <h1 className="max-w-[680px] text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-5xl">Performance insights for a <span className="text-gradient">faster, healthier website.</span></h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-400">Analyze website speed, Core Web Vitals, SEO, accessibility, and technical issues in one comprehensive report.</p>

              <form ref={auditFormRef} onSubmit={runAudit} className="audit-form mt-8 rounded-2xl border border-white/10 bg-[#0b1428]/80 p-2.5 shadow-2xl shadow-black/25 backdrop-blur-xl">
                <label htmlFor="audit-url" className="sr-only">Website URL</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3"><Globe2 size={18} className="shrink-0 text-slate-500" /><input id="audit-url" type="url" inputMode="url" autoComplete="url" spellCheck={false} required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://yourwebsite.com" className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /></div>
                  <button type="submit" disabled={loading || !authReady || !url.trim()} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Zap size={16} />}{loading ? "Auditing" : "Run Audit"}</button>
                </div>
              </form>

              {loading && <div role="status" aria-live="polite" aria-atomic="true" className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4"><div className="flex items-center justify-between text-xs text-slate-300"><span>Running live audit</span><span>Usually under a minute</span></div><div className="loading-track mt-3"><i /></div><div className="mt-3 min-h-5 text-xs text-cyan-100"><span key={loadingStageIndex} className="loading-stage-text inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />{LOADING_STAGES[loadingStageIndex]}</span></div></div>}
              {error && <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-100"><span>{error}</span><button onClick={() => runAudit()} className="shrink-0 font-medium underline underline-offset-2">Retry</button></div>}

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-400" />Mobile & desktop</span><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-400" />Lighthouse-powered</span><span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-400" />{user ? "Signed in" : "Sign in required to run an audit"}</span></div>
            </div>

            <div className="device-showcase relative mx-auto grid w-full max-w-[690px] grid-cols-[.65fr_1.35fr] items-end gap-3 sm:gap-6 lg:gap-4">
              <div className="relative z-10"><DevicePreview device="mobile" screenshot={showCapturedPreviews ? result?.screenshots?.mobile : undefined} /><p className="mt-3 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500">{showCapturedPreviews && result?.screenshots?.mobile ? "Mobile · captured" : "Mobile preview"}</p></div>
              <div className="relative"><DevicePreview device="desktop" screenshot={showCapturedPreviews ? result?.screenshots?.desktop : undefined} /><p className="mt-3 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500">{showCapturedPreviews && result?.screenshots?.desktop ? "Desktop · captured" : "Desktop preview"}</p></div>
              <div className="absolute -inset-x-10 bottom-10 -z-10 h-48 rounded-full bg-indigo-500/[0.08] blur-3xl" />
              <p className="col-span-2 mt-1 text-center text-[10px] text-slate-600">{showCapturedPreviews ? "Captured screenshots are shown where available. Opening your full report…" : "Illustrative previews only. Real device screenshots appear after an audit."}</p>
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
                  <article key={plan.name} className={`flex h-full flex-col rounded-2xl border p-5 sm:p-6 ${plan.name === "Starter" ? "border-indigo-400/40 bg-gradient-to-b from-indigo-500/[0.12] to-cyan-500/[0.035] shadow-xl shadow-indigo-950/20" : "border-white/[0.08] bg-white/[0.025]"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                      {plan.name === "Starter" && <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-cyan-200">Popular</span>}
                    </div>
                    <p className="mt-4 flex items-baseline gap-1"><span className="text-4xl font-semibold tracking-tight text-white">${plan.price}</span><span className="text-sm text-slate-400">/ month</span></p>
                    <div className="mt-5 space-y-3 border-t border-white/[0.08] pt-5 text-sm">
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
            <div><SectionHeading eyebrow="Reports" title="Recent audits" description="The latest audit is retained in this browser session only. Persistent report history is not enabled." /><div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">{lastAudit ? <button onClick={() => { setResult(lastAudit.result); setAuditedAt(lastAudit.auditedAt); setUrl(lastAudit.result.url); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex w-full items-center justify-between gap-4 text-left"><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{lastAudit.result.url}</p><p className="mt-1 text-xs text-slate-500">{new Date(lastAudit.auditedAt).toLocaleString()}</p></div><span className="rounded-lg border border-white/10 px-3 py-2 text-xs text-cyan-200">Open report</span></button> : <div className="flex items-center gap-3 text-sm text-slate-400"><CalendarClock size={17} className="text-slate-500" />Your completed audits will appear here during this session.</div>}</div></div>
            <div id="dashboard" className="rounded-2xl border border-indigo-400/15 bg-gradient-to-br from-indigo-500/[0.10] to-cyan-500/[0.04] p-6"><p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300">Ready when you are</p><h2 className="mt-3 text-xl font-semibold text-white">Know what is slowing your site down.</h2><p className="mt-2 text-sm leading-6 text-slate-400">Run a mobile and desktop audit to get a prioritized, evidence-based report.</p><button onClick={() => auditFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-white">Start your audit <ArrowUpRight size={15} /></button></div>
          </section>

          <footer className="border-t border-white/[0.06] px-5 py-6 text-center text-xs text-slate-600">© 2026 SpeedAudit. Built for clearer web performance decisions.</footer>
        </>
      ) : (
        <div className="relative mx-auto flex max-w-[1680px] gap-5 px-3 py-4 sm:px-5 lg:px-6">
          <ResultSidebar active={activeSection} collapsed={collapsed} setCollapsed={setCollapsed} drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} device={device} url={result.url} counts={findingsCounts} onNavigate={navigateToSection} onHome={resetDashboard} />
          <div className="min-w-0 flex-1">
            <div className="glass-panel sticky top-3 z-30 mb-5 flex min-h-14 items-center justify-between gap-3 rounded-xl px-3 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-2"><button onClick={() => setDrawerOpen(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Open report navigation"><Menu size={19} /></button><div className="min-w-0"><p className="truncate text-sm font-medium text-white">{result.url}</p><p className="hidden text-[11px] text-slate-500 sm:block">{auditedAt ? new Date(auditedAt).toLocaleString() : "Audit completed"} · {result.status} response · {result.redirects ?? "n/a"} redirects</p></div></div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">{user && <ProfileMenu user={user} onSignOut={() => void signOut()} />}<ThemeSwitch theme={theme} onToggle={toggleTheme} /><button onClick={() => runAudit()} disabled={loading} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-xs text-slate-300 hover:bg-white/[0.08] disabled:opacity-50 sm:px-3"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /><span className="hidden sm:inline">Re-run Audit</span></button><button onClick={shareReport} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-xs text-slate-300 hover:bg-white/[0.08] sm:px-3"><Share2 size={14} /><span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span></button><button onClick={exportReport} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-indigo-500/20 px-2.5 text-xs text-indigo-100 hover:bg-indigo-500/30 sm:px-3"><Download size={14} /><span className="hidden sm:inline">Export</span></button></div>
            </div>

            <div className="space-y-5">
              {historySaveError && <p role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-sm text-amber-200">{historySaveError}</p>}
              <section id="overview" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-center gap-3">{result.favicon ? <Image src={result.favicon} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 p-2" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-200"><Globe2 size={18} /></span>}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="max-w-full break-all text-lg font-semibold text-white">{new URL(result.url).hostname}</p><a href={result.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-cyan-300" aria-label="Open audited website"><ExternalLink size={15} /></a></div><p className="mt-1 truncate text-xs text-slate-500">{result.url}</p></div></div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:justify-end"><span className="text-xs text-slate-500">{auditedAt ? new Date(auditedAt).toLocaleString() : "Audit time unavailable"}</span><DeviceSelector device={device} onChange={setDevice} /></div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ScoreCard label="Performance" score={activeSpeed?.score} icon={Gauge} section="performance" /><ScoreCard label="Accessibility" score={activeSpeed?.accessibility} icon={Accessibility} section="accessibility" /><ScoreCard label="Best Practices" score={activeSpeed?.bestPractices} icon={ShieldCheck} section="best-practices" /><ScoreCard label="SEO" score={activeSpeed?.seo ?? result.seoScore} icon={SearchCheck} section="seo" /></div>
                <div className="mt-6 rounded-xl border border-white/[0.07] bg-slate-950/20 p-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-medium text-white">{device === "mobile" ? "Mobile" : "Desktop"} device preview</p><span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{result.screenshots?.[device] ? "Actual audit capture" : "Screenshot unavailable"}</span></div><div className="mx-auto max-w-[680px]"><DevicePreview device={device} screenshot={result.screenshots?.[device]} /></div></div>
              </section>

              <section id="performance" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow={`${device} lab audit`} title="Performance" description="Scores and measurements are from the selected device's PageSpeed Insights run. Missing results are shown as unavailable." /><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/[0.07] bg-slate-950/25 p-4"><p className="text-xs text-slate-500">Performance score</p><p className="mt-2 font-mono text-3xl text-white">{activeSpeed?.score ?? "Unavailable"}<span className="ml-1 text-sm text-slate-500">{activeSpeed?.score !== null && activeSpeed?.score !== undefined ? "/100" : ""}</span></p><p className={`mt-2 text-xs ${scoreStatus(activeSpeed?.score).color}`}>{scoreStatus(activeSpeed?.score).label}</p></div><div className="rounded-xl border border-white/[0.07] bg-slate-950/25 p-4"><p className="text-xs text-slate-500">Audit strategy</p><p className="mt-2 font-mono text-xl capitalize text-white">{device}</p><p className="mt-2 text-xs text-slate-500">Separate PageSpeed run</p></div><div className="rounded-xl border border-white/[0.07] bg-slate-950/25 p-4"><p className="text-xs text-slate-500">Top opportunity</p><p className="mt-2 line-clamp-2 text-sm text-white">{activeSpeed?.opportunities?.[0]?.title ?? "No opportunity data"}</p><p className="mt-2 text-xs text-slate-500">{activeSpeed?.opportunities?.[0] ? `Potential ${Math.round(activeSpeed.opportunities[0].savingsMs)} ms savings` : "Unavailable for this audit"}</p></div></div><MetricCards speed={activeSpeed} />{activeSpeed?.insight?.length ? <div className="mt-4 space-y-2">{activeSpeed.insight.map((line) => <p key={line} className="rounded-lg border border-cyan-400/10 bg-cyan-400/[0.035] px-3 py-2 text-xs leading-5 text-cyan-100/80">{line}</p>)}</div> : null}</section>

              <section id="vitals" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="Real-user and lab signals" title="Core Web Vitals" description="Field data reflects eligible real-user visits; lab data is a controlled Lighthouse run. Field data may not be available for every URL." /><div className="mb-3 text-[10px] uppercase tracking-[0.12em] text-slate-500">Source: {activeSpeed?.fieldDataSource === "url" ? "this URL" : activeSpeed?.fieldDataSource === "origin" ? "origin aggregate" : "unavailable"} · 75th percentile</div><div className="grid gap-4 lg:grid-cols-2">{(["lcp", "inp", "cls"] as const).map((key) => { const metric = activeSpeed?.fieldMetrics?.[key]; const info = METRIC_INFO[key]; return <div key={key} className="rounded-xl border border-white/[0.07] bg-slate-950/25 p-4"><div className="flex items-center justify-between"><span className="font-mono text-sm text-cyan-200">{info.label}</span><span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Field data</span></div><p className="mt-3 font-mono text-2xl text-white">{metric?.display ?? "Unavailable"}</p><p className="mt-2 text-xs leading-5 text-slate-400">{info.explanation}</p></div>; })}</div><p className="mt-4 rounded-lg border border-amber-400/10 bg-amber-400/[0.035] px-3 py-2 text-xs leading-5 text-slate-400">INP and field Core Web Vitals require sufficient Chrome UX Report data. When unavailable, Lighthouse lab metrics remain separate and are not substituted for field data.</p></section>

              <section id="opportunities" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="Potential improvements" title="Opportunities" description="Lighthouse opportunities include estimated savings and affected resources when supplied by PageSpeed." count={activeSpeed?.opportunities?.length ?? 0} /><FindingList findings={activeSpeed?.opportunities ?? []} empty="No opportunity details were returned for this device, or the audit did not identify savings." /></section>

              <section id="diagnostics" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="Investigation" title="Diagnostics" description="Diagnostic audits include available main-thread, JavaScript, payload, DOM, layout, and resource details." count={activeSpeed?.diagnostics?.length ?? 0} /><FindingList findings={activeSpeed?.diagnostics ?? []} empty="No diagnostic findings were returned by Lighthouse." /></section>

              <section id="accessibility" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="Inclusive experience" title="Accessibility Report" description="Lighthouse flags automated checks; manual audits still need human verification." count={activeSpeed?.accessibilityFindings?.filter((item) => item.status !== "pass").length ?? 0} /><div className="mb-4 flex items-center gap-4 rounded-xl border border-white/[0.07] bg-slate-950/25 p-4"><ScoreCard label="Accessibility" score={activeSpeed?.accessibility} icon={Accessibility} section="accessibility" /><p className="max-w-xl text-xs leading-5 text-slate-400">Affected element selectors and snippets are included when Lighthouse provides them. Findings marked Manual check need a person to verify.</p></div><FindingList findings={activeSpeed?.accessibilityFindings ?? []} empty="Accessibility category data is unavailable for this run." /></section>

              <section id="best-practices" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="Browser and platform checks" title="Best Practices" description="Lighthouse browser, security, JavaScript, and platform checks for the selected device." count={activeSpeed?.bestPracticeFindings?.filter((item) => item.status !== "pass").length ?? 0} /><FindingList findings={activeSpeed?.bestPracticeFindings ?? []} empty="Best Practices category data is unavailable for this run." /></section>

              <section id="seo" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="Search discovery" title="SEO Report" description="Lighthouse SEO checks are not a complete SEO audit and do not measure every ranking factor." count={findingsCounts.seo} /><div className="mb-4 flex items-center gap-4 rounded-xl border border-white/[0.07] bg-slate-950/25 p-4"><ScoreCard label="Lighthouse SEO" score={activeSpeed?.seo} icon={SearchCheck} section="seo" /><p className="text-xs leading-5 text-slate-400">The page-level checks below inspect metadata and technical signals directly from the fetched HTML.</p></div><h3 className="mb-3 text-sm font-medium text-slate-200">Lighthouse SEO checks</h3><FindingList findings={activeSpeed?.seoFindings ?? []} empty="Lighthouse SEO category data is unavailable for this run." /><h3 className="mb-3 mt-6 text-sm font-medium text-slate-200">Page and technical checks</h3>{result.checks.length ? <div className="space-y-2">{result.checks.map((check) => <details key={check.id} className="finding-row rounded-xl border border-white/[0.08] bg-slate-950/20"><summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3"><span className={`h-2 w-2 rounded-full ${check.status === "pass" ? "bg-emerald-400" : check.status === "fail" ? "bg-rose-400" : "bg-amber-400"}`} /><span className="flex-1 text-sm text-slate-200">{check.label}</span><span className={`text-xs ${check.status === "pass" ? "text-emerald-300" : check.status === "fail" ? "text-rose-300" : "text-amber-300"}`}>{check.status}</span><ChevronDown size={14} className="text-slate-500" /></summary><div className="border-t border-white/[0.07] px-4 py-3 text-sm text-slate-300"><p>{check.value}</p>{check.fix && <p className="mt-2 text-slate-400">Recommendation: {check.fix}</p>}</div></details>)}</div> : unavailableFindings("No page checks were returned.")}</section>

              <section id="passed" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="Validated checks" title="Passed Audits" description="Successful Lighthouse checks across categories for the selected device." count={activeSpeed?.passed?.length ?? 0} /><FindingList findings={activeSpeed?.passed ?? []} empty="Passed-audit details are unavailable." expandAll={false} /></section>

              <section id="technical" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="Run metadata" title="Technical Details" description="Available Lighthouse environment, throttling, request, and transfer metadata." /><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{([ ["Final URL", activeSpeed?.technical?.finalUrl], ["Requested URL", activeSpeed?.technical?.requestedUrl], ["Lighthouse version", activeSpeed?.technical?.lighthouseVersion], ["Fetch time", activeSpeed?.technical?.fetchTime], ["Form factor", activeSpeed?.technical?.formFactor], ["Request count", activeSpeed?.technical?.requestCount], ["Transfer size", formatBytes(activeSpeed?.technical?.transferBytes)], ["Response status", result.status], ["Throttling", activeSpeed?.technical?.throttling ? JSON.stringify(activeSpeed.technical.throttling) : null], ["Environment", activeSpeed?.technical?.environment ? JSON.stringify(activeSpeed.technical.environment) : null] ] as [string, unknown][]).map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-white/[0.07] bg-slate-950/25 p-3"><p className="text-[10px] uppercase tracking-[0.13em] text-slate-500">{label}</p><p className="mt-2 break-all font-mono text-xs leading-5 text-slate-200">{value === null || value === undefined || value === "" ? "Unavailable" : typeof value === "string" ? value : String(value)}</p></div>)}</div><div className="mt-5 border-t border-white/[0.07] pt-4"><h3 className="mb-3 text-sm font-medium text-slate-200">Image delivery analysis</h3>{(result.images ?? []).length ? <div className="space-y-2">{result.images?.map((image, index) => <details key={`${image.src}-${index}`} className="finding-row rounded-xl border border-white/[0.07] bg-slate-950/25"><summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3"><span className={`h-2 w-2 rounded-full ${image.status === "pass" ? "bg-emerald-400" : image.status === "fail" ? "bg-rose-400" : "bg-amber-400"}`} /><span className="min-w-0 flex-1 truncate text-xs text-slate-200">{image.src}</span><span className="text-[10px] text-slate-500">{image.format} · {image.width ?? "?"}×{image.height ?? "?"}</span><ChevronDown size={14} className="text-slate-500" /></summary><div className="grid gap-3 border-t border-white/[0.07] p-4 sm:grid-cols-[120px_1fr]"><img src={image.src} alt={image.alt} className="h-24 w-full rounded-lg border border-white/10 bg-black/20 object-contain" /><div className="text-xs leading-5 text-slate-300"><p>Alt: {image.alt || "Missing"} · Loading: {image.loading}</p><p className="mt-1">{image.recommendation}</p>{image.issues.map((issue) => <p key={issue} className="mt-1 text-amber-200">{issue}</p>)}</div></div></details>)}</div> : <EmptyState label="No image analysis data was returned." />}</div></section>

              <section id="screenshots" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
                <SectionHeading
                  eyebrow="Captured from the audited page"
                  title="Screenshots & Filmstrip"
                  description="Full browser screenshots are preferred; the final PageSpeed filmstrip frame is used when browser capture is unavailable."
                />
                <div className="grid gap-4 xl:grid-cols-2">
                  {([["Mobile screenshot", mobileScreenshot], ["Desktop screenshot", desktopScreenshot]] as [string, string | undefined][]).map(([label, screenshot]) => (
                    <div key={label} className="rounded-xl border border-white/[0.07] bg-slate-950/25 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-medium text-white">{label}</p>
                        {screenshot && <button onClick={() => setScreenshotOpen(screenshot)} className="text-xs text-cyan-200 hover:text-white">Enlarge</button>}
                      </div>
                      {screenshot ? (
                        <button onClick={() => setScreenshotOpen(screenshot)} className="block w-full overflow-hidden rounded-lg border border-white/10 bg-black/30">
                          <img src={screenshot} alt={label} className="max-h-[460px] w-full object-contain" />
                        </button>
                      ) : <EmptyState label="A screenshot could not be captured for this device." />}
                    </div>
                  ))}
                </div>
                <h3 className="mb-3 mt-6 text-sm font-medium text-white">Lighthouse filmstrip · {device}</h3>
                {activeSpeed?.filmstrip?.length ? (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {activeSpeed.filmstrip.map((frame, index) => (
                      <div key={`${index}-${frame.timing}`} className="overflow-hidden rounded-lg border border-white/[0.08] bg-slate-950/30">
                        <button onClick={() => setScreenshotOpen(frame.data)} className="block w-full">
                          <img src={frame.data} alt={`Lighthouse filmstrip frame ${index + 1}`} className="aspect-video w-full object-cover" />
                        </button>
                        <p className="p-2 font-mono text-[10px] text-slate-500">{frame.timing === null ? `Frame ${index + 1}` : `${frame.timing} ms`}</p>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState label="No filmstrip frames were provided by this Lighthouse run." />}
              </section>

              <footer className="flex items-center justify-between border-t border-white/[0.06] py-5 text-xs text-slate-600"><button onClick={resetDashboard} className="inline-flex items-center gap-2 hover:text-slate-300"><ArrowLeft size={14} />Dashboard</button><span>SpeedAudit · Lighthouse-based report</span></footer>
            </div>
          </div>
        </div>
      )}
      {screenshotOpen && <div role="dialog" aria-modal="true" aria-label="Enlarged screenshot" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setScreenshotOpen(null)}><button onClick={() => setScreenshotOpen(null)} className="absolute right-5 top-5 rounded-lg bg-white/10 p-2 text-white" aria-label="Close screenshot"><X size={20} /></button><img src={screenshotOpen} alt="Enlarged audit screenshot" className="max-h-[92vh] max-w-[96vw] object-contain" onClick={(event) => event.stopPropagation()} /></div>}
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} onAuthenticated={(authenticatedUser) => setUser(authenticatedUser)} />
    </main>
  );
}
