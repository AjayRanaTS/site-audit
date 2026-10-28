"use client";

import { useEffect, useState, type FormEvent } from "react";

type Status = "pass" | "warn" | "fail" | "na";
type MetricKey = "fcp" | "lcp" | "tbt" | "cls" | "si";
type Metric = { display: string | null; value: number | null };
type Tip = { title: string; savingsMs: number };

type Speed = {
  error?: string;
  score?: number | null;
  metrics?: Record<MetricKey, Metric>;
  tips?: Tip[];
};

type Check = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  value: string;
  fix?: string;
};

type AuditResult = {
  url: string;
  status: number;
  seoScore: number;
  checks: Check[];
  performance: { mobile: Speed; desktop: Speed };
};

const STATUS_TEXT: Record<Status, string> = {
  pass: "Good",
  warn: "Improve",
  fail: "Fix",
  na: "",
};

const STATUS_COLOR: Record<Status, string> = {
  pass: "text-green-700",
  warn: "text-amber-700",
  fail: "text-red-700",
  na: "text-neutral-500",
};

const METRICS: {
  key: MetricKey;
  short: string;
  name: string;
  hint: string;
  good: number;
  poor: number;
}[] = [
  {
    key: "fcp",
    short: "FCP",
    name: "First Contentful Paint",
    hint: "When the first text or image appears",
    good: 1800,
    poor: 3000,
  },
  {
    key: "lcp",
    short: "LCP",
    name: "Largest Contentful Paint",
    hint: "When the main content finishes loading",
    good: 2500,
    poor: 4000,
  },
  {
    key: "tbt",
    short: "TBT",
    name: "Total Blocking Time",
    hint: "How long the page is frozen while loading",
    good: 200,
    poor: 600,
  },
  {
    key: "cls",
    short: "CLS",
    name: "Cumulative Layout Shift",
    hint: "How much the page jumps around",
    good: 0.1,
    poor: 0.25,
  },
  {
    key: "si",
    short: "SI",
    name: "Speed Index",
    hint: "How quickly the page looks loaded",
    good: 3400,
    poor: 5800,
  },
];

const CSS = `
@keyframes fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
@keyframes slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(300%); }
}
.reveal { animation: fade-up 0.5s ease-out both; }
.slider { animation: slide 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .reveal, .slider { animation: none; }
  .ring-arc { transition: none !important; }
}
`;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useCountUp(target: number, duration = 1200, delay = 0) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    let start: number | null = null;
    const timer = setTimeout(() => {
      const tick = (t: number) => {
        if (start === null) start = t;
        const p = Math.min((t - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(target * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, duration, delay]);

  return value;
}

function ringColor(score: number | null) {
  if (score === null) return "#9ca3af";
  return score >= 90 ? "#15803d" : score >= 50 ? "#b45309" : "#b91c1c";
}

function ScoreRing({
  score,
  label,
  delay = 0,
}: {
  score: number | null;
  label: string;
  delay?: number;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const [drawn, setDrawn] = useState(false);
  const shown = useCountUp(score ?? 0, 1200, delay);

  useEffect(() => {
    const timer = setTimeout(() => setDrawn(true), 30);
    return () => clearTimeout(timer);
  }, []);

  const value = score === null ? 0 : Math.min(Math.max(score, 0), 100);
  const offset = circumference - ((drawn ? value : 0) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative h-28 w-28 sm:h-32 sm:w-32"
        role="img"
        aria-label={score === null ? `${label}: no score` : `${label}: ${score} out of 100`}
      >
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle
            className="ring-arc"
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={ringColor(score)}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 1.2s cubic-bezier(0.2, 0.7, 0.2, 1)",
              transitionDelay: `${delay}ms`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums tracking-tight">
            {score === null ? "n/a" : shown}
          </span>
        </div>
      </div>
      <p className="text-sm text-neutral-600">{label}</p>
    </div>
  );
}

function metricStatus(key: MetricKey, value: number | null | undefined): Status {
  if (typeof value !== "number") return "na";
  const m = METRICS.find((x) => x.key === key);
  if (!m) return "na";
  return value <= m.good ? "pass" : value <= m.poor ? "warn" : "fail";
}

function MetricCell({ speed, metricKey }: { speed: Speed; metricKey: MetricKey }) {
  const m = speed.metrics?.[metricKey];
  const status = metricStatus(metricKey, m?.value);
  return (
    <td className="py-4 pr-4 align-top">
      <p className="font-medium tabular-nums">{m?.display ?? "n/a"}</p>
      {status !== "na" && (
        <p className={`text-sm ${STATUS_COLOR[status]}`}>{STATUS_TEXT[status]}</p>
      )}
    </td>
  );
}

function formatSavings(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [runId, setRunId] = useState(0);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data as AuditResult);
      setRunId((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const rank = { fail: 0, warn: 1, pass: 2 } as const;
  const fixes = result
    ? result.checks.filter((c) => c.status !== "pass").sort((a, b) => rank[a.status] - rank[b.status])
    : [];
  const passed = result ? result.checks.filter((c) => c.status === "pass") : [];

  const mobile = result?.performance.mobile;
  const desktop = result?.performance.desktop;
  const tips = mobile?.tips?.length ? mobile.tips : (desktop?.tips ?? []);
  const tipsFrom = mobile?.tips?.length ? "mobile" : "desktop";

  const headline =
    fixes.length === 0
      ? "No SEO problems found"
      : fixes.length === 1
        ? "1 SEO recommendation"
        : `${fixes.length} SEO recommendations`;

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <style>{CSS}</style>
      <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
        <h1 className="text-3xl font-semibold tracking-tight">Website audit</h1>
        <p className="mt-3 text-neutral-600">
          Check SEO and speed on mobile and desktop for any public page.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="url" className="sr-only">
            Website address
          </label>
          <input
            id="url"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.com"
            className="h-12 flex-1 rounded-lg border border-neutral-300 px-4 text-base outline-none transition-shadow placeholder:text-neutral-400 focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/20"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="h-12 rounded-lg bg-neutral-900 px-6 font-medium text-white transition-all hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Auditing..." : "Run audit"}
          </button>
        </form>

        {loading && (
          <div role="status" aria-live="polite" className="mt-10">
            <div className="h-0.5 w-full overflow-hidden bg-neutral-200">
              <div className="slider h-0.5 w-1/3 bg-neutral-900" />
            </div>
            <p className="mt-4 text-sm text-neutral-600">
              Checking SEO and running speed tests for mobile and desktop. This can take up to a minute.
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="reveal mt-10 border-l-2 border-red-700 pl-4">
            <p className="font-medium">Could not audit this page</p>
            <p className="mt-1 text-sm text-neutral-600">{error}. Check the address and try again.</p>
          </div>
        )}

        {result && (
          <div key={runId} className="mt-14">
            {/* Summary */}
            <section aria-labelledby="summary-heading">
              <h2 id="summary-heading" className="text-2xl font-semibold tracking-tight">
                {headline}
              </h2>
              <p className="mt-1 break-all text-sm text-neutral-500">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 transition-colors hover:text-neutral-900"
                >
                  {result.url}
                </a>
              </p>

              <div className="mt-10 grid grid-cols-3 gap-4 sm:gap-8">
                <ScoreRing score={result.seoScore} label="SEO" delay={0} />
                <ScoreRing score={mobile?.score ?? null} label="Mobile speed" delay={150} />
                <ScoreRing score={desktop?.score ?? null} label="Desktop speed" delay={300} />
              </div>
            </section>

            {/* SEO */}
            <section className="mt-16" aria-labelledby="seo-heading">
              <h2 id="seo-heading" className="text-xl font-semibold tracking-tight">
                SEO recommendations
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Start at the top. These affect how your page shows up in search.
              </p>

              {fixes.length === 0 ? (
                <p className="mt-6 text-neutral-700">Nothing to fix. Every SEO check passed.</p>
              ) : (
                <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
                  {fixes.map((c, i) => (
                    <li
                      key={c.id}
                      className="reveal py-5"
                      style={{ animationDelay: `${600 + Math.min(i, 8) * 70}ms` }}
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="font-medium">{c.label}</p>
                        <p className={`shrink-0 text-sm ${STATUS_COLOR[c.status]}`}>
                          {STATUS_TEXT[c.status]}
                        </p>
                      </div>
                      <p className="mt-1 break-words text-sm text-neutral-500">{c.value}</p>
                      {c.fix && <p className="mt-2">{c.fix}</p>}
                    </li>
                  ))}
                </ul>
              )}

              {passed.length > 0 && (
                <details className="mt-6 text-sm">
                  <summary className="cursor-pointer text-neutral-500 transition-colors hover:text-neutral-900">
                    Passed checks ({passed.length})
                  </summary>
                  <ul className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
                    {passed.map((c) => (
                      <li key={c.id} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-6">
                        <p className="font-medium">{c.label}</p>
                        <p className="min-w-0 break-words text-neutral-500">{c.value}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

            {/* Speed */}
            <section className="mt-16" aria-labelledby="speed-heading">
              <h2 id="speed-heading" className="text-xl font-semibold tracking-tight">
                Speed
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Results from Google PageSpeed Insights. Numbers can change a little between runs.
              </p>

              {mobile?.error && (
                <p className="mt-4 text-sm text-red-700">Mobile test: {mobile.error}</p>
              )}
              {desktop?.error && (
                <p className="mt-1 text-sm text-red-700">Desktop test: {desktop.error}</p>
              )}

              <table className="mt-6 w-full text-left">
                <caption className="sr-only">Speed metrics for mobile and desktop</caption>
                <thead>
                  <tr className="border-b border-neutral-200 text-sm text-neutral-500">
                    <th scope="col" className="py-3 pr-4 font-normal">
                      Metric
                    </th>
                    <th scope="col" className="w-24 py-3 pr-4 font-normal sm:w-32">
                      Mobile
                    </th>
                    <th scope="col" className="w-24 py-3 pr-4 font-normal sm:w-32">
                      Desktop
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 border-b border-neutral-200">
                  {METRICS.map((m, i) => (
                    <tr
                      key={m.key}
                      className="reveal"
                      style={{ animationDelay: `${300 + i * 80}ms` }}
                    >
                      <th scope="row" className="py-4 pr-4 text-left align-top font-normal">
                        <p>
                          <span className="font-medium">{m.short}</span>{" "}
                          <span className="text-sm text-neutral-500">{m.name}</span>
                        </p>
                        <p className="text-sm text-neutral-500">{m.hint}</p>
                      </th>
                      <MetricCell speed={mobile ?? {}} metricKey={m.key} />
                      <MetricCell speed={desktop ?? {}} metricKey={m.key} />
                    </tr>
                  ))}
                </tbody>
              </table>

              {tips.length > 0 && (
                <div className="mt-10">
                  <h3 className="font-medium">Speed tips</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    From the {tipsFrom} test. Biggest time savings first.
                  </p>
                  <ul className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200">
                    {tips.map((t, i) => (
                      <li
                        key={t.title}
                        className="reveal flex items-baseline justify-between gap-4 py-4"
                        style={{ animationDelay: `${700 + i * 70}ms` }}
                      >
                        <p>{t.title}</p>
                        <p className="shrink-0 text-sm text-neutral-500">
                          Save about {formatSavings(t.savingsMs)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <details className="mt-16 text-sm">
              <summary className="cursor-pointer text-neutral-500 transition-colors hover:text-neutral-900">
                Raw response
              </summary>
              <pre className="mt-3 overflow-auto rounded-lg bg-neutral-50 p-4 text-xs text-neutral-800">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}