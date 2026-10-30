import type { LucideIcon } from "lucide-react";

export type Device = "mobile" | "desktop";
export type AuditStatus = "pass" | "warn" | "fail" | "manual";
export type Metric = { display: string | null; value: number | null };
export type Finding = {
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
export type Speed = {
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
export type Check = {
  id: string;
  label: string;
  status: Exclude<AuditStatus, "manual">;
  value: string;
  fix?: string;
  priority?: "high" | "medium" | "low";
  resource?: string;
};
export type PlatformDetection = {
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
export type RecentAudit = {
  id: string;
  target_url: string;
  audited_at: string;
  result: AuditResult;
};
export type NavItem = { id: string; label: string; icon: LucideIcon };
