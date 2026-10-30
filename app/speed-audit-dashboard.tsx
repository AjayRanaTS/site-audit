"use client";

import {
  ArrowLeft,
  Accessibility,
  ExternalLink,
  Gauge,
  Globe2,
  SearchCheck,
  ShieldCheck,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import AuditHomePage, { LOADING_STAGES } from "@/components/audit-home-page";
import AuditReportSections from "@/components/audit-report-sections";
import AuditReportToolbar from "@/components/audit-report-toolbar";
import {
  DevicePreview,
  DeviceSelector,
  METRIC_INFO,
  NAV_ITEMS,
  ResultSidebar,
  ScoreCard,
} from "@/components/audit-report-ui";
import AuthModal from "@/components/auth-modal";
import type { AuditResult, Device, RecentAudit } from "@/lib/audit-types";
import { formatBytes } from "@/lib/audit-report-format";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatAuditHistoryError } from "@/lib/audit-history-error";
import type { Paragraph as DocxParagraph, Table as DocxTable } from "docx";

export type { AuditResult } from "@/lib/audit-types";

const PENDING_AUDIT_STORAGE_KEY = "speedaudit-pending-audit-url";
const HISTORY_REPORT_KEY = "speedaudit-open-history-id";

function isAuditResult(value: unknown): value is AuditResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.url === "string" &&
    typeof candidate.status === "number" &&
    (candidate.seoScore === undefined || typeof candidate.seoScore === "number" || candidate.seoScore === null) &&
    Array.isArray(candidate.checks) &&
    Boolean(candidate.performance && typeof candidate.performance === "object");
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
  const auditFormRef = useRef<HTMLFormElement>(null);
  const activeSpeed = result?.performance[device];
  const pageSpeedTimedOut = /did not finish|timed out|aborted due to timeout/i.test(activeSpeed?.error ?? "");
  const findings = activeSpeed;
  const pageStatusIssues = result?.checks.filter(
    (check) => check.id === "status" && check.status === "fail"
  ) ?? [];
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

  function openAuditReport(report: AuditResult, reportAuditedAt: string) {
    setResult(report);
    setAuditedAt(reportAuditedAt);
    setLastAudit({ result: report, auditedAt: reportAuditedAt });
    setUrl(report.url);
    setActiveSection("overview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function scrollToAuditForm() {
    auditFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <main id="top" className="min-h-screen bg-[#080f20] text-slate-100">
      <div className="ambient-lines" aria-hidden="true"><i /><i /><i /></div>
      {!result ? (
        <AuditHomePage
          user={user}
          url={url}
          onUrlChange={setUrl}
          onSignIn={() => setAuthModalOpen(true)}
          onSignOut={() => void signOut()}
          auditFormRef={auditFormRef}
          onSubmit={runAudit}
          loading={loading}
          authReady={authReady}
          loadingStage={LOADING_STAGES[loadingStageIndex]}
          error={error}
          onRetry={() => void runAudit()}
          recentAudits={recentAudits}
          recentAuditsLoading={recentAuditsLoading}
          recentAuditsError={recentAuditsError}
          lastAudit={lastAudit}
          onOpenAudit={openAuditReport}
          onStartAudit={scrollToAuditForm}
        />
      ) : (
        <div className="relative mx-auto flex max-w-[1680px] gap-5 px-3 py-4 sm:px-5 lg:px-6">
          <ResultSidebar active={activeSection} collapsed={collapsed} setCollapsed={setCollapsed} drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} device={device} url={result.url} counts={findingsCounts} onNavigate={navigateToSection} onHome={resetDashboard} />
          <div className="min-w-0 flex-1">
            <AuditReportToolbar
              url={result.url}
              auditedAt={auditedAt}
              status={result.status}
              redirects={result.redirects}
              device={device}
              onDeviceChange={setDevice}
              user={user}
              onSignOut={() => void signOut()}
              loading={loading}
              onOpenNavigation={() => setDrawerOpen(true)}
              onRerun={() => void runAudit()}
              onShare={shareReport}
              copied={copied}
              onExportDoc={() => void exportDoc()}
              onExportPdf={() => void exportPdf()}
            />

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

              <AuditReportSections
                device={device}
                speed={activeSpeed}
                findingsCounts={findingsCounts}
                onOpenScreenshot={setScreenshotOpen}
              />

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
