"use client";

import { Accessibility, SearchCheck } from "lucide-react";
import type { Device, Speed } from "@/lib/audit-types";
import { emptyFindingsMessage, scoreStatus } from "@/lib/audit-report-format";
import {
  EmptyState,
  FindingList,
  METRIC_INFO,
  MetricCards,
  ScoreCard,
  SectionHeading,
} from "@/components/audit-report-ui";

const CORE_WEB_VITAL_KEYS = ["lcp", "inp", "cls", "fcp", "ttfb"] as const;

export default function AuditReportSections({
  device,
  speed,
  findingsCounts,
  onOpenScreenshot,
}: {
  device: Device;
  speed: Speed | undefined;
  findingsCounts: Record<string, number>;
  onOpenScreenshot: (screenshot: string) => void;
}) {
  return (
    <>
      <section id="performance" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
        <SectionHeading eyebrow={`${device} lab audit`} title="Performance" />
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.07] bg-slate-950/25 p-4"><p className="text-xs text-slate-500">Performance score</p><p className="mt-2 font-mono text-3xl text-white">{speed?.score ?? "Unavailable"}<span className="ml-1 text-sm text-slate-500">{speed?.score !== null && speed?.score !== undefined ? "/100" : ""}</span></p><p className={`mt-2 text-xs ${scoreStatus(speed?.score).color}`}>{scoreStatus(speed?.score).label}</p></div>
          <div className="rounded-xl border border-white/[0.07] bg-slate-950/25 p-4"><p className="text-xs text-slate-500">Audit strategy</p><p className="mt-2 font-mono text-xl capitalize text-white">{device}</p></div>
        </div>
        <MetricCards speed={speed} />
      </section>

      <section id="vitals" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
        <SectionHeading eyebrow="Chrome UX Report" title="Core Web Vitals" />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-slate-950/25 p-4">
          <div>
            <p className="text-sm font-medium text-slate-200">Core Web Vitals Assessment</p>
            <p className="mt-1 text-xs text-slate-500">Based on Google field data at the 75th percentile</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-sm font-medium ${speed?.cwvAssessment === "passed" ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300" : speed?.cwvAssessment === "failed" ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-300" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>
            {speed?.cwvAssessment === "passed" ? "Passed" : speed?.cwvAssessment === "failed" ? "Failed" : "Unavailable"}
          </span>
        </div>
        <p className="mb-3 text-[10px] uppercase tracking-[0.12em] text-slate-500">
          {speed?.fieldDataSource === "url" ? "URL field data" : speed?.fieldDataSource === "origin" ? "Origin field data" : "Field data unavailable; showing lab values where available"}
          {speed?.fieldDataSource && " · 75th percentile"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CORE_WEB_VITAL_KEYS.map((key) => {
            const fieldMetric = speed?.fieldMetrics?.[key];
            const labMetric = speed?.metrics?.[key];
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

      <section id="opportunities" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="PageSpeed findings" title="Opportunities" count={speed?.opportunities?.length ?? 0} /><FindingList findings={speed?.opportunities ?? []} empty={emptyFindingsMessage(speed?.score, speed?.diagnostics?.length ? "No potential savings were reported for the remaining findings." : "No failing performance audits were reported.")} /></section>
      <section id="diagnostics" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="PageSpeed findings" title="Diagnostics" count={speed?.diagnostics?.length ?? 0} /><FindingList findings={speed?.diagnostics ?? []} empty={emptyFindingsMessage(speed?.score, speed?.opportunities?.length ? "No additional findings without reported savings were returned." : "No failing performance audits were reported.")} /></section>

      <section id="accessibility" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
        <SectionHeading eyebrow="PageSpeed findings" title="Accessibility Report" count={speed?.accessibilityFindings?.length ?? 0} />
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(210px,0.8fr)_minmax(0,1.5fr)] xl:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.8fr)]">
          <ScoreCard label="Accessibility" score={speed?.accessibility} icon={Accessibility} section="accessibility" />
          <FindingList findings={speed?.accessibilityFindings ?? []} empty={emptyFindingsMessage(speed?.accessibility, "No failing accessibility audits were reported.")} />
        </div>
      </section>

      <section id="best-practices" className="report-section glass-panel rounded-2xl p-4 sm:p-6"><SectionHeading eyebrow="PageSpeed findings" title="Best Practices" count={speed?.bestPracticeFindings?.length ?? 0} /><FindingList findings={speed?.bestPracticeFindings ?? []} empty={emptyFindingsMessage(speed?.bestPractices, "No failing Best Practices audits were reported.")} /></section>

      <section id="seo" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
        <SectionHeading eyebrow="PageSpeed findings" title="SEO Report" count={findingsCounts.seo} />
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(210px,0.8fr)_minmax(0,1.5fr)] xl:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.8fr)]">
          <ScoreCard label="Lighthouse SEO" score={speed?.seo} icon={SearchCheck} section="seo" />
          <FindingList findings={speed?.seoFindings ?? []} empty={emptyFindingsMessage(speed?.seo, "No failing SEO audits were reported.")} />
        </div>
      </section>

      <section id="screenshots" className="report-section glass-panel rounded-2xl p-4 sm:p-6">
        <SectionHeading title="Page load filmstrip" />
        <h3 className="mb-3 text-sm font-medium text-white">{device === "mobile" ? "Mobile" : "Desktop"}</h3>
        {speed?.filmstrip?.length ? (
          <div className={`filmstrip-strip filmstrip-strip-${device}`}>
            {speed.filmstrip.map((frame, index) => (
              <div key={`${index}-${frame.timing}`} className="filmstrip-card">
                <button
                  type="button"
                  onClick={() => onOpenScreenshot(frame.data)}
                  className="filmstrip-image"
                  style={{ aspectRatio: device === "mobile" ? "390 / 844" : "1440 / 900" }}
                >
                  <img className="bg-white" src={frame.data} alt={`Lighthouse ${device} filmstrip frame ${index + 1}`} />
                </button>
                <p className="filmstrip-timing">{frame.timing === null ? `Frame ${index + 1}` : `${frame.timing} ms`}</p>
              </div>
            ))}
          </div>
        ) : <EmptyState label="No filmstrip frames were provided by this Lighthouse run." />}
      </section>
    </>
  );
}
