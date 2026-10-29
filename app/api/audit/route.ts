import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

type Status = "pass" | "warn" | "fail";
type Check = {
  id: string;
  label: string;
  status: Status;
  value: string;
  fix?: string;
};
type Metric = { display: string | null; value: number | null };
type LighthouseFinding = {
  id: string;
  title: string;
  description: string;
  displayValue: string | null;
  score: number | null;
  status: "pass" | "warn" | "fail" | "manual";
  savingsMs: number;
  resources: Record<string, string | number | null>[];
};
type JsonRecord = Record<string, unknown>;
type ImageAuditEntry = {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
  format: string;
  loading: string;
  status: Status;
  issues: string[];
  recommendation: string;
};

/* ---------- Safe fetching (blocks private addresses) ---------- */

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return (
      v === "::1" ||
      v === "::" ||
      v.startsWith("fc") ||
      v.startsWith("fd") ||
      v.startsWith("fe80") ||
      v.startsWith("::ffff:")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function assertPublicHost(hostname: string) {
  if (hostname === "localhost") throw new Error("This URL is not allowed");
  const addrs = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("This URL is not allowed");
  }
}

async function safeFetch(startUrl: URL) {
  let current = startUrl;
  for (let i = 0; i < 5; i++) {
    if (!["http:", "https:"].includes(current.protocol)) {
      throw new Error("Only http and https URLs are allowed");
    }
    await assertPublicHost(current.hostname);

    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "SiteAuditBot/0.1" },
    });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    return { res, finalUrl: current, redirects: i };
  }
  throw new Error("Too many redirects");
}

async function fetchSmall(target: URL) {
  try {
    const { res } = await safeFetch(target);
    const type = res.headers.get("content-type") ?? "";
    const text = res.ok ? (await res.text()).slice(0, 200_000) : "";
    return { ok: res.ok, type, text };
  } catch {
    return { ok: false, type: "", text: "" };
  }
}

/* ---------- Helpers ---------- */

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function robotsBlocksAll(robots: string) {
  let inStar = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim().toLowerCase();
    if (line.startsWith("user-agent:")) {
      inStar = line.slice(11).trim() === "*";
    } else if (inStar && line.replace(/\s/g, "") === "disallow:/") {
      return true;
    }
  }
  return false;
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" ? value as JsonRecord : {};
}

function metric(audits: JsonRecord, id: string): Metric {
  const a = asRecord(audits[id]);
  const display = a.displayValue;
  const value = a.numericValue;
  return {
    display: typeof display === "string" ? display : null,
    value: typeof value === "number" ? value : null,
  };
}

function categoryFindings(category: unknown, audits: JsonRecord): LighthouseFinding[] {
  const categoryRecord = asRecord(category);
  const references = Array.isArray(categoryRecord.auditRefs) ? categoryRecord.auditRefs : [];
  return references
    .map((referenceValue): LighthouseFinding | null => {
      const reference = asRecord(referenceValue);
      const id = typeof reference.id === "string" ? reference.id : "";
      if (!id) return null;
      const audit = asRecord(audits[id]);
      if (!Object.keys(audit).length || audit.scoreDisplayMode === "notApplicable") return null;

      const score = typeof audit.score === "number" ? audit.score : null;
      const details = asRecord(audit.details);
      const metricSavings = asRecord(audit.metricSavings);
      const savings = Number(
        details.overallSavingsMs ??
        Math.max(Number(metricSavings.LCP) || 0, Number(metricSavings.FCP) || 0)
      ) || 0;
      const items = Array.isArray(details.items) ? details.items : [];
      const resources = items.slice(0, 12).map((itemValue) => {
        const item = asRecord(itemValue);
        const node = asRecord(item.node);
        const values: Record<string, string | number | null> = {};
        for (const key of ["url", "source", "label", "resourceType", "mimeType", "transferSize", "totalBytes", "wastedBytes", "wastedMs", "duration", "totalTime", "requestStartTime", "value"]) {
          const value = item[key];
          if (typeof value === "string" || typeof value === "number") values[key] = value;
        }
        if (typeof node.selector === "string") values.selector = node.selector;
        if (typeof node.snippet === "string") values.snippet = node.snippet;
        if (typeof node.explanation === "string") values.explanation = node.explanation;
        return values;
      });

      return {
        id,
        title: typeof audit.title === "string" ? audit.title : id,
        description: typeof audit.description === "string" ? audit.description : "",
        displayValue: typeof audit.displayValue === "string" ? audit.displayValue : null,
        score,
        status: audit.scoreDisplayMode === "manual" ? "manual" : score === null ? "warn" : score >= 0.9 ? "pass" : score < 0.5 ? "fail" : "warn",
        savingsMs: Math.round(savings),
        resources,
      } satisfies LighthouseFinding;
    })
    .filter((finding): finding is LighthouseFinding => finding !== null);
}

function fieldMetric(experience: unknown, key: string, unit: "ms" | "cls"): Metric {
  const metrics = asRecord(asRecord(experience).metrics);
  const value = asRecord(metrics[key]).percentile;
  const percentile = typeof value === "number" ? value : null;
  if (percentile === null) return { display: null, value: null };
  if (unit === "cls") {
    const cls = percentile / 100;
    return { display: cls.toFixed(3), value: cls };
  }
  return { display: `${(percentile / 1000).toFixed(1)} s`, value: percentile };
}

function detectImageFormat(src: string) {
  const value = (src || "").split("?")[0].split("#")[0].toLowerCase();
  if (value.includes("data:image/")) {
    return value.match(/data:image\/([a-z0-9.+-]+)/i)?.[1] || "data";
  }
  if (/\.(avif|webp|png|jpg|jpeg|gif|svg|bmp|ico)$/.test(value)) {
    return value.match(/\.(avif|webp|png|jpg|jpeg|gif|svg|bmp|ico)$/)?.[1] || "unknown";
  }
  return "unknown";
}

async function getPageSpeed(url: string, strategy: "mobile" | "desktop") {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) return { error: "PageSpeed API key is not set" };

  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url);
  api.searchParams.set("strategy", strategy);
  for (const category of ["performance", "accessibility", "best-practices", "seo"]) {
    api.searchParams.append("category", category);
  }
  api.searchParams.set("key", key);

  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(50000) });
    const data = asRecord(await res.json());
    if (!res.ok) {
      const errorMessage = asRecord(data.error).message;
      return { error: typeof errorMessage === "string" ? errorMessage : "PageSpeed request failed" };
    }

    const lighthouse = asRecord(data.lighthouseResult);
    const audits = asRecord(lighthouse.audits);
    const categories = asRecord(lighthouse.categories);
    const configSettings = asRecord(lighthouse.configSettings);
    const raw = asRecord(categories.performance).score;
    const accessibilityScore = asRecord(categories.accessibility).score;
    const bestPracticesScore = asRecord(categories["best-practices"]).score;

    const tips = Object.values(audits)
      .map((auditValue) => {
        const audit = asRecord(auditValue);
        const details = asRecord(audit.details);
        const metricSavings = asRecord(audit.metricSavings);
        const savings = details.overallSavingsMs ?? Math.max(Number(metricSavings.LCP) || 0, Number(metricSavings.FCP) || 0);
        return {
          title: typeof audit.title === "string" ? audit.title : undefined,
          savingsMs: Number(savings) || 0,
          score: typeof audit.score === "number" ? audit.score : null,
        };
      })
      .filter(
        (t) =>
          t.title &&
          t.savingsMs >= 100 &&
          (t.score === null || t.score === undefined || t.score < 0.9)
      )
      .sort((a, b) => b.savingsMs - a.savingsMs)
      .slice(0, 5)
      .map((t) => ({ title: t.title as string, savingsMs: Math.round(t.savingsMs) }));

    const performanceInsight = [
      typeof raw === "number" && raw < 0.7 ? "The page is under the usual performance target for organic visibility." : null,
      typeof asRecord(audits["largest-contentful-paint"]).numericValue === "number" && Number(asRecord(audits["largest-contentful-paint"]).numericValue) > 2500 ? "Largest Contentful Paint is slow enough to delay the page feeling ready to use." : null,
      typeof asRecord(audits["total-blocking-time"]).numericValue === "number" && Number(asRecord(audits["total-blocking-time"]).numericValue) > 200 ? "There is a measurable blocking period during page load." : null,
      typeof asRecord(audits["cumulative-layout-shift"]).numericValue === "number" && Number(asRecord(audits["cumulative-layout-shift"]).numericValue) > 0.1 ? "Layout shifts are likely making the page look unstable while it loads." : null,
    ].filter(Boolean) as string[];

    const performanceFindings = categoryFindings(categories.performance, audits);
    const passed = Object.entries(categories).flatMap(([categoryName, category]) =>
      categoryFindings(category, audits)
        .filter((finding) => finding.status === "pass")
        .map((finding) => ({ ...finding, category: categoryName }))
    );
    const fieldExperience = data.loadingExperience ?? data.originLoadingExperience;
    const filmstripDetails = asRecord(asRecord(audits["screenshot-thumbnails"]).details);
    const filmstrip = (Array.isArray(filmstripDetails.items) ? filmstripDetails.items : [])
      .slice(0, 8)
      .flatMap((item) => {
        const frame = asRecord(item);
        return typeof frame.data === "string" ? [{ data: frame.data, timing: typeof frame.timing === "number" ? frame.timing : null }] : [];
      });
    const requestDetails = asRecord(asRecord(audits["network-requests"]).details);
    const requests = Array.isArray(requestDetails.items) ? requestDetails.items : [];
    const totalTransferBytes = requests.reduce((sum, item) => sum + (Number(asRecord(item).transferSize) || 0), 0);

    return {
      score: typeof raw === "number" ? Math.round(raw * 100) : null,
      accessibility: typeof accessibilityScore === "number" ? Math.round(accessibilityScore * 100) : null,
      bestPractices: typeof bestPracticesScore === "number" ? Math.round(bestPracticesScore * 100) : null,
      seo: typeof asRecord(categories.seo).score === "number" ? Math.round(Number(asRecord(categories.seo).score) * 100) : null,
      metrics: {
        fcp: metric(audits, "first-contentful-paint"),
        lcp: metric(audits, "largest-contentful-paint"),
        tbt: metric(audits, "total-blocking-time"),
        cls: metric(audits, "cumulative-layout-shift"),
        si: metric(audits, "speed-index"),
        inp: metric(audits, "interaction-to-next-paint"),
        ttfb: metric(audits, "server-response-time"),
      },
      fieldMetrics: {
        lcp: fieldMetric(fieldExperience, "LARGEST_CONTENTFUL_PAINT_MS", "ms"),
        inp: fieldMetric(fieldExperience, "EXPERIMENTAL_INTERACTION_TO_NEXT_PAINT", "ms"),
        cls: fieldMetric(fieldExperience, "CUMULATIVE_LAYOUT_SHIFT_SCORE", "cls"),
        ttfb: fieldMetric(fieldExperience, "EXPERIMENTAL_TIME_TO_FIRST_BYTE", "ms"),
      },
      fieldDataSource: data.loadingExperience ? "url" : data.originLoadingExperience ? "origin" : null,
      opportunities: performanceFindings.filter((finding) => finding.status !== "pass" && finding.savingsMs > 0),
      diagnostics: performanceFindings.filter((finding) => finding.status !== "pass" && finding.savingsMs === 0),
      accessibilityFindings: categoryFindings(categories.accessibility, audits),
      bestPracticeFindings: categoryFindings(categories["best-practices"], audits),
      seoFindings: categoryFindings(categories.seo, audits),
      passed,
      filmstrip,
      technical: {
        finalUrl: lighthouse.finalDisplayedUrl ?? url,
        requestedUrl: lighthouse.requestedUrl ?? url,
        lighthouseVersion: lighthouse.lighthouseVersion ?? null,
        fetchTime: lighthouse.fetchTime ?? null,
        formFactor: configSettings.formFactor ?? strategy,
        throttling: configSettings.throttling ?? null,
        environment: lighthouse.environment ?? null,
        requestCount: requests.length || null,
        transferBytes: totalTransferBytes || null,
      },
      tips,
      insight: performanceInsight,
    };
  } catch {
    return { error: "The speed test timed out or failed" };
  }
}

async function capturePageScreenshot(url: URL, viewport: { width: number; height: number }, deviceName: "mobile" | "desktop") {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport,
      userAgent:
        deviceName === "mobile"
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      deviceScaleFactor: 2,
      isMobile: deviceName === "mobile",
      hasTouch: deviceName === "mobile",
    });

    await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    try {
      await page.waitForLoadState("networkidle", { timeout: 10000 });
    } catch {
      // Ignore slow or blocked network activity when the page is otherwise ready.
    }

    const image = await page.screenshot({
      type: "jpeg",
      quality: 70,
      fullPage: false,
    });

    return `data:image/jpeg;base64,${image.toString("base64")}`;
  } finally {
    await browser.close();
  }
}

async function captureScreenshotOrFallback(url: URL, viewport: { width: number; height: number }, device: "mobile" | "desktop") {
  try {
    return await capturePageScreenshot(url, viewport, device);
  } catch (cause) {
    console.warn(`Browser screenshot capture failed for ${device}; using PageSpeed filmstrip fallback when available.`, cause);
    return undefined;
  }
}

function getPageSpeedScreenshot(speed: Awaited<ReturnType<typeof getPageSpeed>>) {
  if (!("filmstrip" in speed) || !speed.filmstrip?.length) return undefined;
  return speed.filmstrip[speed.filmstrip.length - 1].data;
}

/* ---------- Route ---------- */

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Please sign in before running an audit." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Authentication is not configured on this server." }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const input = typeof body.url === "string" ? body.url.trim() : "";

  if (!input) {
    return NextResponse.json({ error: "Please enter a URL" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return NextResponse.json({ error: "Please enter a valid URL" }, { status: 400 });
  }

  try {
    const { res, finalUrl, redirects } = await safeFetch(parsed);
    const html = (await res.text()).slice(0, 2_000_000);
    const $ = cheerio.load(html);

    // Slow work runs in parallel
    const [mobile, desktop, robots, sitemapA, sitemapB, mobileCapture, desktopCapture] = await Promise.all([
      getPageSpeed(finalUrl.href, "mobile"),
      getPageSpeed(finalUrl.href, "desktop"),
      fetchSmall(new URL("/robots.txt", finalUrl.origin)),
      fetchSmall(new URL("/sitemap.xml", finalUrl.origin)),
      fetchSmall(new URL("/sitemap_index.xml", finalUrl.origin)),
      captureScreenshotOrFallback(finalUrl, { width: 390, height: 844 }, "mobile"),
      captureScreenshotOrFallback(finalUrl, { width: 1440, height: 900 }, "desktop"),
    ]);
    const screenshots = [
      mobileCapture ?? getPageSpeedScreenshot(mobile),
      desktopCapture ?? getPageSpeedScreenshot(desktop),
    ];

    const checks: Check[] = [];
    const add = (
      id: string,
      label: string,
      status: Status,
      value: string,
      fix?: string
    ) => checks.push({ id, label, status, value, ...(fix ? { fix } : {}) });

    /* Page status */
    if (res.status >= 400) {
      add(
        "status",
        "Page status",
        "fail",
        `Returns ${res.status}`,
        "Search engines cannot index a page that returns an error. Make sure this URL loads normally. Some sites also block automated tools, which can cause this."
      );
    } else {
      add("status", "Page status", "pass", `Loads normally (${res.status})`);
    }

    /* HTTPS */
    if (finalUrl.protocol === "https:") {
      add("https", "Secure connection", "pass", "Uses HTTPS");
    } else {
      add(
        "https",
        "Secure connection",
        "fail",
        "Uses HTTP",
        "Serve the site over HTTPS and redirect all http addresses to https."
      );
    }

    /* Indexing */
    const robotsMeta = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
    const robotsHeader = (res.headers.get("x-robots-tag") ?? "").toLowerCase();
    if (robotsMeta.includes("noindex") || robotsHeader.includes("noindex")) {
      add(
        "indexing",
        "Search engine indexing",
        "fail",
        "Blocked by noindex",
        "This page tells search engines not to list it. Remove the noindex setting if you want it to appear in search results."
      );
    } else {
      add("indexing", "Search engine indexing", "pass", "Allowed");
    }

    /* Title */
    const title = clean($("title").first().text());
    if (!title) {
      add(
        "title",
        "Page title",
        "fail",
        "Not set",
        "Add a unique title tag of 30 to 60 characters that includes your main keyword."
      );
    } else if (title.length > 60) {
      add(
        "title",
        "Page title",
        "warn",
        `${title} (${title.length} characters)`,
        "Search results cut titles after about 60 characters. Shorten it and put the main keyword near the start."
      );
    } else if (title.length < 30) {
      add(
        "title",
        "Page title",
        "warn",
        `${title} (${title.length} characters)`,
        "This title is short. Use 30 to 60 characters to describe the page and include your main keyword."
      );
    } else {
      add("title", "Page title", "pass", `${title} (${title.length} characters)`);
    }

    /* Meta description */
    const description = clean($('meta[name="description"]').attr("content") ?? "");
    if (!description) {
      add(
        "description",
        "Meta description",
        "fail",
        "Not set",
        "Add a meta description of 70 to 160 characters. It is often shown under your title in search results."
      );
    } else if (description.length > 160) {
      add(
        "description",
        "Meta description",
        "warn",
        `${description} (${description.length} characters)`,
        "Keep the description under 160 characters so it is not cut off in search results."
      );
    } else if (description.length < 70) {
      add(
        "description",
        "Meta description",
        "warn",
        `${description} (${description.length} characters)`,
        "This description is short. Use 70 to 160 characters to explain what the page offers."
      );
    } else {
      add(
        "description",
        "Meta description",
        "pass",
        `${description} (${description.length} characters)`
      );
    }

    /* H1 */
    const h1s = $("h1")
      .map((_, el) => clean($(el).text()))
      .get()
      .filter(Boolean);
    const emptyH1 = $("h1").length - h1s.length;
    if (h1s.length === 0) {
      add(
        "h1",
        "Main heading (H1)",
        "fail",
        emptyH1 > 0 ? "H1 exists but is empty" : "None found",
        "Add one H1 that clearly describes the page. If your H1 is a logo image, add real text instead."
      );
    } else if (h1s.length > 1) {
      add(
        "h1",
        "Main heading (H1)",
        "warn",
        `${h1s.length} found: ${h1s[0]}`,
        "Use a single H1 per page and use H2 to H6 for the other headings."
      );
    } else {
      add("h1", "Main heading (H1)", "pass", h1s[0]);
    }

    /* H2 */
    const h2Count = $("h2")
      .map((_, el) => clean($(el).text()))
      .get()
      .filter(Boolean).length;
    if (h2Count === 0) {
      add(
        "h2",
        "Subheadings (H2)",
        "warn",
        "None found",
        "Break the content into sections with H2 headings. It helps readers scan the page and helps search engines understand the topics."
      );
    } else {
      add("h2", "Subheadings (H2)", "pass", `${h2Count} found`);
    }

    /* Canonical */
    const canonicalHref = $('link[rel="canonical"]').attr("href");
    if (!canonicalHref) {
      add(
        "canonical",
        "Canonical URL",
        "warn",
        "Not set",
        "Add a canonical link tag so search engines know the preferred address of this page and do not treat duplicates as separate pages."
      );
    } else {
      let differs = false;
      try {
        const c = new URL(canonicalHref, finalUrl);
        differs = c.href.replace(/\/$/, "") !== finalUrl.href.replace(/\/$/, "");
      } catch {
        differs = true;
      }
      if (differs) {
        add(
          "canonical",
          "Canonical URL",
          "warn",
          canonicalHref,
          "The canonical address points somewhere other than this page. Make sure that is intended."
        );
      } else {
        add("canonical", "Canonical URL", "pass", canonicalHref);
      }
    }

    /* Viewport */
    const viewport = $('meta[name="viewport"]').attr("content");
    if (!viewport) {
      add(
        "viewport",
        "Mobile viewport",
        "fail",
        "Not set",
        "Add a viewport meta tag so the page displays properly on phones. Google ranks pages mostly by their mobile version."
      );
    } else {
      add("viewport", "Mobile viewport", "pass", viewport);
    }

    /* Language */
    const lang = $("html").attr("lang");
    if (!lang) {
      add(
        "lang",
        "Page language",
        "warn",
        "Not set",
        "Set the lang attribute on the html tag, for example lang=\"en\". It helps search engines and screen readers."
      );
    } else {
      add("lang", "Page language", "pass", lang);
    }

    /* Open Graph */
    const ogMissing = ["og:title", "og:description", "og:image"].filter(
      (p) => !$(`meta[property="${p}"]`).attr("content")
    );
    if (ogMissing.length > 0) {
      add(
        "og",
        "Social sharing tags",
        "warn",
        `Missing ${ogMissing.join(", ")}`,
        "Add Open Graph tags so links look good when shared on social media and chat apps."
      );
    } else {
      add("og", "Social sharing tags", "pass", "Title, description and image are set");
    }

    /* Structured data */
    const ldCount = $('script[type="application/ld+json"]').length;
    if (ldCount === 0) {
      add(
        "schema",
        "Structured data",
        "warn",
        "None found",
        "Add schema.org structured data (JSON-LD), such as LocalBusiness or Organization, to help search engines understand the business."
      );
    } else {
      add("schema", "Structured data", "pass", `${ldCount} JSON-LD block${ldCount > 1 ? "s" : ""}`);
    }

    /* Heading structure */
    const headingOrder = Array.from($("h1, h2, h3, h4, h5, h6")).map((el) => Number((el.tagName || "").replace("H", "")) || 0);
    const hasSkippedHeading = headingOrder.some((level, idx) => idx > 0 && level > headingOrder[idx - 1] + 1);
    if (hasSkippedHeading) {
      add(
        "heading-structure",
        "Heading structure",
        "warn",
        "Headings jump levels",
        "Keep heading levels in order (for example H1 > H2 > H3) so the content hierarchy is easier to follow for readers and crawlers."
      );
    } else {
      add("heading-structure", "Heading structure", "pass", "Heading order is consistent");
    }

    /* Social follow-up tags */
    const twitterTags = ["twitter:card", "twitter:title", "twitter:description"]; 
    const missingTwitterTags = twitterTags.filter((p) => !$(`meta[name="${p}"]`).length && !$(`meta[property="${p}"]`).length);
    if (missingTwitterTags.length > 0) {
      add(
        "twitter",
        "Social sharing tags",
        "warn",
        `Missing ${missingTwitterTags.join(", ")}`,
        "Add basic Twitter card metadata so previews are stronger when the page is shared in social feeds."
      );
    } else {
      add("twitter", "Social sharing tags", "pass", "Twitter card metadata is present");
    }

    /* Image audit */
    const imageEntries: ImageAuditEntry[] = $("img")
      .toArray()
      .map((el) => {
        const $img = $(el);
        const rawSrc = ($img.attr("src") ?? "").trim();
        const src = rawSrc ? new URL(rawSrc, finalUrl).href : "";
        const alt = clean($img.attr("alt") ?? "");
        const width = Number($img.attr("width")) || null;
        const height = Number($img.attr("height")) || null;
        const loading = ($img.attr("loading") ?? "not set").toLowerCase();
        const format = detectImageFormat(rawSrc || "");
        const issues: string[] = [];

        if (!rawSrc) issues.push("Image source is missing.");
        if (!alt) issues.push("Alt text is missing for accessibility and image search.");
        if (loading === "not set") issues.push("The image is not explicitly lazy-loaded or eager-loaded.");
        if (loading === "eager" && !src.includes("logo") && !src.includes("hero")) {
          issues.push("This image is eagerly loaded even though it may be below the fold.");
        }
        if ((width && width > 2000) || (height && height > 2000)) {
          issues.push("The image is oversized for its layout and can slow the page down.");
        }
        if (format === "svg" && !alt) {
          issues.push("SVG images should include accessible text or a proper title/description.");
        }

        const status: Status = issues.length === 0 ? "pass" : issues.length >= 3 ? "fail" : "warn";
        const recommendation =
          issues.length === 0
            ? "This image is well-formed and should load efficiently with the current markup."
            : issues.length >= 3
              ? "Reduce the image size, add alt text, and lazy-load non-critical images to improve page speed and accessibility."
              : "Add the missing metadata and compress the asset where possible so the page stays light and accessible.";

        return {
          src: src || rawSrc || "missing-image",
          alt: alt || "No alt text",
          width,
          height,
          format,
          loading: loading === "not set" ? "auto" : loading,
          status,
          issues,
          recommendation,
        };
      })
      .filter((img) => img.src !== "missing-image");

    const imageProblems = imageEntries.filter((img) => img.status !== "pass");
    if (imageEntries.length === 0) {
      add(
        "image-audit",
        "Images",
        "warn",
        "No images found",
        "There are no visible images on this page. Add relevant visuals only when they support the content."
      );
    } else if (imageProblems.length === 0) {
      add("image-audit", "Images", "pass", `${imageEntries.length} image${imageEntries.length > 1 ? "s" : ""} look healthy`);
    } else {
      add(
        "image-audit",
        "Images",
        imageProblems.length >= imageEntries.length / 2 ? "fail" : "warn",
        `${imageProblems.length} of ${imageEntries.length} images need attention`,
        "Review image sizes, lazy-loading, and alt text to improve accessibility and delivery speed."
      );
    }

    /* Links */
    const host = (h: string) => h.replace(/^www\./, "").toLowerCase();
    const pageHost = host(finalUrl.hostname);
    let internal = 0;
    let external = 0;
    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") ?? "").trim();
      if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) return;
      try {
        const u = new URL(href, finalUrl);
        if (!["http:", "https:"].includes(u.protocol)) return;
        if (host(u.hostname) === pageHost) internal++;
        else external++;
      } catch {
        /* ignore invalid links */
      }
    });
    if (internal === 0) {
      add(
        "links",
        "Internal links",
        "warn",
        `${internal} internal, ${external} external`,
        "Link to related pages on your own site so visitors and search engines can move around easily."
      );
    } else {
      add("links", "Internal links", "pass", `${internal} internal, ${external} external`);
    }

    /* Content length */
    const $body = $("body").clone();
    $body.find("script, style, noscript, template").remove();
    const bodyText = clean($body.text());
    const words = bodyText ? bodyText.split(" ").length : 0;
    if (words < 300) {
      add(
        "words",
        "Content length",
        "warn",
        `About ${words} words`,
        "Pages with very little text rarely rank well. Add helpful content that answers visitor questions. Text loaded with JavaScript may not be counted here."
      );
    } else {
      add("words", "Content length", "pass", `About ${words} words`);
    }

    /* Favicon */
    const faviconHref = $('link[rel~="icon"]').first().attr("href");
    let favicon: string | null = null;
    if (faviconHref) {
      try {
        favicon = new URL(faviconHref, finalUrl).href;
      } catch {
        favicon = null;
      }
    }
    if (!favicon) {
      add(
        "favicon",
        "Favicon",
        "warn",
        "Not found",
        "Add a favicon so your brand shows in browser tabs and in search results on phones."
      );
    } else {
      add("favicon", "Favicon", "pass", "Found");
    }

    /* robots.txt */
    const robotsOk = robots.ok && !robots.type.includes("html");
    if (!robotsOk) {
      add(
        "robots",
        "robots.txt",
        "warn",
        "Not found",
        "Add a robots.txt file at the root of the site to guide search engine crawlers and point them to your sitemap."
      );
    } else if (robotsBlocksAll(robots.text)) {
      add(
        "robots",
        "robots.txt",
        "fail",
        "Blocks all crawlers",
        "robots.txt disallows the whole site. Remove the Disallow: / rule if you want to appear in search results."
      );
    } else {
      add("robots", "robots.txt", "pass", "Found");
    }

    /* Sitemap */
    const isXml = (r: { ok: boolean; type: string; text: string }) =>
      r.ok && (r.type.includes("xml") || /<(urlset|sitemapindex)/i.test(r.text.slice(0, 2000)));
    const declared = robotsOk ? robots.text.match(/^\s*sitemap:\s*(\S+)/im)?.[1] : undefined;
    const sitemap =
      declared ??
      (isXml(sitemapA) ? "/sitemap.xml" : isXml(sitemapB) ? "/sitemap_index.xml" : undefined);
    if (!sitemap) {
      add(
        "sitemap",
        "XML sitemap",
        "warn",
        "Not found",
        "Add an XML sitemap and submit it in Google Search Console so new pages are found faster."
      );
    } else {
      add("sitemap", "XML sitemap", "pass", sitemap);
    }

    /* SEO score: pass = 1, warn = 0.5, fail = 0 */
    const points = checks.reduce(
      (sum, c) => sum + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0),
      0
    );
    const seoScore = Math.round((points / checks.length) * 100);

    return NextResponse.json({
      url: finalUrl.href,
      status: res.status,
      redirects,
      seoScore,
      favicon,
      checks,
      images: imageEntries,
      screenshots: {
        mobile: screenshots[0],
        desktop: screenshots[1],
      },
      performance: { mobile, desktop },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not fetch this URL";
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}