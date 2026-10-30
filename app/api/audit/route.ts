import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

type Status = "fail";
type Check = {
  id: string;
  label: string;
  status: Status;
  value: string;
  fix?: string;
  priority?: "high" | "medium" | "low";
  resource?: string;
};
type Metric = { display: string | null; value: number | null };
type LighthouseFinding = {
  id: string;
  title: string;
  displayValue: string | null;
  score: number | null;
  status: "pass" | "warn" | "fail" | "manual";
  priority: "high" | "medium" | "low";
  recommendation: string | null;
  savings: {
    overallMs: number | null;
    lcpMs: number | null;
    fcpMs: number | null;
    cls: number | null;
    inpMs: number | null;
    bytes: number | null;
  };
  resources: Record<string, string | number | null>[];
};
type JsonRecord = Record<string, unknown>;
type PlatformDetection = {
  name: string;
  confidence: "high" | "moderate";
  evidence: string[];
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

/* ---------- Helpers ---------- */

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" ? value as JsonRecord : {};
}

async function readBodyPrefix(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (totalBytes < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - totalBytes;
    const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(chunk);
    totalBytes += chunk.byteLength;
    if (chunk.byteLength < value.byteLength) {
      await reader.cancel();
      break;
    }
  }

  await reader.cancel();
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function detectPlatform(html: string, headers: Headers): PlatformDetection | null {
  const signals: { name: string; patterns: RegExp[] }[] = [
    { name: "WordPress", patterns: [/\/wp-content\//i, /\/wp-includes\//i, /name=["']generator["'][^>]*content=["'][^"']*WordPress/i, /(?:^|\n)x-powered-by:\s*WordPress/im] },
    { name: "Shopify", patterns: [/cdn\.shopify\.com/i, /myshopify\.com/i, /\bShopify\.theme\b|shopify-section/i] },
    { name: "Wix", patterns: [/wixstatic\.com|wixsite\.com/i, /(?:^|\n)x-wix-[^:\n]+:/im] },
    { name: "Squarespace", patterns: [/squarespace\.com|squarespace-cdn\.com|static1\.squarespace/i, /(?:^|\n)x-squarespace-[^:\n]+:/im] },
    { name: "HubSpot", patterns: [/js\.hs-scripts\.com|js\.hsforms\.net/i, /hs-sites\.com|hscta\.net|hsforms\.com|hscollectedforms\.net/i, /\bhubspot\b|hs-content-id|hs_cos_wrapper/i] },
    { name: "Webflow", patterns: [/data-wf-site|webflow\.js/i, /assets\.website-files\.com/i] },
    { name: "Next.js", patterns: [/\/_next\/static\//i, /__NEXT_DATA__|self\.__next_f\.push/i, /(?:^|\n)x-powered-by:\s*Next\.js/im] },
    { name: "Nuxt", patterns: [/\/_nuxt\//i, /__NUXT__/i, /(?:^|\n)x-powered-by:\s*Nuxt/im] },
    { name: "Framer", patterns: [/framerusercontent\.com|data-framer-name/i, /framer\.website/i] },
    { name: "Drupal", patterns: [/drupalSettings|\/sites\/default\/files\//i, /name=["']generator["'][^>]*content=["'][^"']*Drupal/i] },
    { name: "Joomla", patterns: [/name=["']generator["'][^>]*content=["'][^"']*Joomla/i, /\/media\/system\/js\//i] },
    { name: "Ghost", patterns: [/name=["']generator["'][^>]*content=["'][^"']*Ghost/i, /\/ghost\/api\//i] },
    { name: "React", patterns: [/data-reactroot|data-reactid/i, /\bReactDOM\.render\b|\bcreateRoot\(/i, /__REACT_DEVTOOLS_GLOBAL_HOOK__/i] },
    { name: "Vue.js", patterns: [/data-v-[\da-f]{6,}/i, /__VUE__|__VUE_INSTANCE__/i, /\bVue\.createApp\b/i] },
    { name: "Angular", patterns: [/ng-version=["'][^"']+["']/i, /ng-app=["']|ng-server-context=["']/i] },
    { name: "Svelte", patterns: [/svelte-[\da-z]+/i, /__sveltekit/i] },
  ];
  const headerEvidence = Array.from(headers.entries())
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
  const detectableSource = `${html}\n${headerEvidence}`;
  const match = signals
    .map((signal) => ({
      name: signal.name,
      evidence: signal.patterns.reduce(
        (matched, pattern) => matched + Number(pattern.test(detectableSource)),
        0
      ),
    }))
    .find((signal) => signal.evidence > 0);
  if (!match) return null;
  return {
    name: match.name,
    confidence: match.evidence > 1 ? "high" : "moderate",
    evidence: [`${match.evidence} matching HTML or response marker${match.evidence === 1 ? "" : "s"}`],
  };
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

function resourceUrl(resource: JsonRecord) {
  const url = resource.url;
  return typeof url === "string" ? url : null;
}

function recommendationForAudit(
  id: string,
  resources: JsonRecord[],
  devicePixelRatio: number | null,
  lcpUrls: Set<string>
): string | null {
  const urls = resources.map(resourceUrl).filter((url): url is string => url !== null);
  const firstUrl = urls[0];
  const lcpUrl = [...lcpUrls][0];
  const target = firstUrl ? ` ${firstUrl}` : "";
  const firstResource = resources[0];

  switch (id) {
    case "uses-optimized-images": {
      if (!firstUrl) return null;
      const imageType = String(firstResource.mimeType ?? "").toLowerCase();
      const isJpegOrPng = /image\/(jpeg|png)/.test(imageType) || /\.(jpe?g|png)(?:[?#]|$)/i.test(firstUrl);
      return `Compress${target} and replace the delivered image. Lighthouse reports the resource size and estimated byte savings below.${isJpegOrPng ? " TinyPNG or TinyJPG can compress this JPEG/PNG asset." : ""}`;
    }
    case "modern-image-formats":
      return firstUrl
        ? `Serve${target} as WebP or AVIF and retain a fallback only if your supported browsers require one.`
        : null;
    case "uses-responsive-images":
    case "image-size-responsive": {
      if (!firstUrl) return null;
      const actualWidth = firstResource.actualWidth;
      const actualHeight = firstResource.actualHeight;
      const displayedWidth = firstResource.displayedWidth;
      const displayedHeight = firstResource.displayedHeight;
      if (
        typeof actualWidth === "number" &&
        typeof actualHeight === "number" &&
        typeof displayedWidth === "number" &&
        typeof displayedHeight === "number" &&
        devicePixelRatio !== null
      ) {
        const targetWidth = Math.ceil(displayedWidth * devicePixelRatio);
        const targetHeight = Math.ceil(displayedHeight * devicePixelRatio);
        return `Add responsive source sizes for${target}; Lighthouse measured ${actualWidth}×${actualHeight}px intrinsic and ${displayedWidth}×${displayedHeight}px rendered. At the audited ${devicePixelRatio}× device scale, a source near ${targetWidth}×${targetHeight}px is sufficient.`;
      }
      return `Provide responsive source sizes for${target} so the browser can select an image closer to the rendered size. PageSpeed did not provide enough dimension data to calculate a target size.`;
    }
    case "unsized-images":
      return firstUrl
        ? `Add intrinsic width and height attributes to${target}, preserving its actual aspect ratio, so the browser can reserve space before it loads.`
        : "Add intrinsic width and height attributes to each image element reported below, using the asset's actual dimensions to preserve its aspect ratio.";
    case "offscreen-images":
      return firstUrl
        ? `Lazy-load${target}; Lighthouse identified it as offscreen in this run. Keep the LCP image eager and prioritized.`
        : "Lazy-load only the image elements Lighthouse listed as offscreen. Do not lazy-load the LCP image.";
    case "largest-contentful-paint-element":
    case "largest-contentful-paint-image":
    case "largest-contentful-paint":
      return firstUrl || lcpUrl
        ? `Prioritize ${firstUrl ?? lcpUrl} as the LCP resource. Ensure it is discoverable in the initial HTML and do not lazy-load it.`
        : "The LCP element was identified, but PageSpeed did not provide its resource URL. Do not lazy-load this element; inspect its discovery and loading priority.";
    case "lcp-discovery-insight":
      return firstUrl || lcpUrl
        ? `Make ${firstUrl ?? lcpUrl} discoverable from the initial HTML and prioritize its request. Do not lazy-load the LCP image.`
        : null;
    case "unused-javascript":
      return firstUrl
        ? `Reduce unused code in${target} by removing unreferenced modules or splitting code that is not needed for this page.`
        : null;
    case "unused-css-rules":
      return firstUrl
        ? `Remove unused selectors from${target}, or load the stylesheet only on routes that use them.`
        : null;
    case "render-blocking-resources":
      return firstUrl
        ? `Reduce the render-blocking work from${target}. Defer this script if it is non-critical, or keep only critical CSS in the initial render path.`
        : null;
    case "uses-long-cache-ttl":
      return firstUrl
        ? `Set a longer browser cache lifetime for${target} if it is versioned or otherwise safe to cache.`
        : null;
    case "uses-text-compression":
      return firstUrl
        ? `Enable Brotli or gzip for the text resource${target} and verify the response includes the matching Content-Encoding header.`
        : null;
    case "font-display":
      return firstUrl
        ? `Add a font-display value such as swap to the @font-face rule loading${target}.`
        : null;
    case "server-response-time":
      return `The audited page${target} exceeded Lighthouse's server-response target. The API does not identify the upstream cause; inspect server processing and cache behavior for this URL before changing application code.`;
    case "cumulative-layout-shift":
      return resources.length > 0
        ? "Review the listed elements that shifted during this run. Reserve their final layout space before content loads; PageSpeed has not identified a single universal CSS fix."
        : null;
    case "interaction-to-next-paint":
      return firstUrl
        ? `Review the interaction work associated with${target} and reduce the blocking task identified by Lighthouse.`
        : null;
    case "color-contrast":
      return "Adjust the foreground or background color of each reported element until its computed contrast meets the required WCAG ratio.";
    case "image-alt":
      return "Add concise alternative text to each reported informative image. Use an empty alt attribute only for decorative images.";
    case "button-name":
      return "Give each reported button an accessible name using visible text or an aria-label that describes its action.";
    case "link-name":
      return "Give each reported link descriptive accessible text or an accessible name that identifies its destination.";
    case "label":
      return "Associate a visible label with each reported form control using a matching for/id pair or an accessible name.";
    case "document-title":
      return "Add a descriptive, page-specific <title> element to the audited document.";
    case "html-has-lang":
      return "Set the correct language code on the audited document's <html lang> attribute.";
    case "heading-order":
      return "Correct the reported heading levels so section headings follow the document's existing hierarchy.";
    case "is-on-https":
      return "Serve this page over HTTPS and redirect its HTTP URL to the HTTPS version.";
    case "is-crawlable":
      return "Remove the noindex directive from this page or its response headers only if the page should appear in search results.";
    default:
      return null;
  }
}

function categoryFindings(
  category: unknown,
  audits: JsonRecord,
  devicePixelRatio: number | null,
  lcpUrls: Set<string>
): LighthouseFinding[] {
  const categoryRecord = asRecord(category);
  const references = Array.isArray(categoryRecord.auditRefs) ? categoryRecord.auditRefs : [];
  return references
    .map((referenceValue): LighthouseFinding | null => {
      const reference = asRecord(referenceValue);
      const id = typeof reference.id === "string" ? reference.id : "";
      if (!id) return null;
      const audit = asRecord(audits[id]);
      if (
        !Object.keys(audit).length ||
        audit.scoreDisplayMode === "notApplicable" ||
        audit.scoreDisplayMode === "manual" ||
        audit.scoreDisplayMode === "informative"
      ) return null;

      const score = typeof audit.score === "number" ? audit.score : null;
      if (score === null || score >= 0.9) return null;
      const details = asRecord(audit.details);
      const metricSavings = asRecord(audit.metricSavings);
      const items = Array.isArray(details.items) ? details.items : [];
      const resources = items.map((itemValue) => {
        const item = asRecord(itemValue);
        const node = asRecord(item.node);
        const values: Record<string, string | number | null> = {};
        for (const key of [
          "url", "source", "label", "resourceType", "mimeType", "transferSize",
          "totalBytes", "wastedBytes", "wastedMs", "duration", "totalTime",
          "value", "displayedWidth", "displayedHeight", "actualWidth",
          "actualHeight", "cacheLifetimeMs", "cacheTTL", "requestStartTime",
        ]) {
          const value = item[key];
          if (typeof value === "string" || typeof value === "number") values[key] = value;
        }
        const request = asRecord(item.request);
        if (typeof values.url !== "string" && typeof request.url === "string") {
          values.url = request.url;
        }
        if (typeof values.url !== "string" && typeof node.url === "string") {
          values.url = node.url;
        }
        if (typeof node.selector === "string") values.selector = node.selector;
        if (typeof node.snippet === "string") values.snippet = node.snippet;
        if (typeof node.explanation === "string") values.explanation = node.explanation;
        return values;
      });
      const issueResources = id === "offscreen-images"
        ? resources.filter((resource) => {
            const url = resourceUrl(resource);
            return !url || !lcpUrls.has(url);
          })
        : resources;
      if (id === "offscreen-images" && resources.length > 0 && issueResources.length === 0) return null;
      const overallMs = details.overallSavingsMs;
      const lcpMs = metricSavings.LCP;
      const fcpMs = metricSavings.FCP;
      const cls = metricSavings.CLS;
      const inpMs = metricSavings.INP;
      const overallBytes = details.overallSavingsBytes;
      const savings = {
        overallMs: typeof overallMs === "number" && overallMs > 0 ? Math.round(overallMs) : null,
        lcpMs: typeof lcpMs === "number" && lcpMs > 0 ? Math.round(lcpMs) : null,
        fcpMs: typeof fcpMs === "number" && fcpMs > 0 ? Math.round(fcpMs) : null,
        cls: typeof cls === "number" && cls > 0 ? cls : null,
        inpMs: typeof inpMs === "number" && inpMs > 0 ? Math.round(inpMs) : null,
        bytes: typeof overallBytes === "number" && overallBytes > 0 ? Math.round(overallBytes) : null,
      };
      const maxMs = Math.max(savings.overallMs ?? 0, savings.lcpMs ?? 0, savings.fcpMs ?? 0, savings.inpMs ?? 0);
      const resourceBytes = issueResources.reduce(
        (sum, resource) => sum + (typeof resource.wastedBytes === "number" ? resource.wastedBytes : 0),
        0
      );
      const impactBytes = Math.max(savings.bytes ?? 0, resourceBytes);
      const priority = score < 0.5 || maxMs >= 1000 || impactBytes >= 200_000
        ? "high"
        : score < 0.75 || maxMs >= 250 || impactBytes >= 50_000
          ? "medium"
          : "low";
      const recommendation = id === "offscreen-images" && lcpUrls.size === 0
        ? null
        : recommendationForAudit(id, issueResources, devicePixelRatio, lcpUrls);

      return {
        id,
        title: typeof audit.title === "string" ? audit.title : id,
        displayValue: typeof audit.displayValue === "string" ? audit.displayValue : null,
        score,
        status: score < 0.5 ? "fail" : "warn",
        priority,
        recommendation,
        savings,
        resources: issueResources.slice(0, 12),
      } satisfies LighthouseFinding;
    })
    .filter((finding): finding is LighthouseFinding => finding !== null)
    .sort((left, right) => {
      const priorityRank = { high: 0, medium: 1, low: 2 };
      const timingSavings = (finding: LighthouseFinding) => Math.max(
        finding.savings.overallMs ?? 0,
        finding.savings.lcpMs ?? 0,
        finding.savings.fcpMs ?? 0,
        finding.savings.inpMs ?? 0
      );
      const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority];
      if (priorityDifference !== 0) return priorityDifference;
      const timingDifference = timingSavings(right) - timingSavings(left);
      return timingDifference || (right.savings.bytes ?? 0) - (left.savings.bytes ?? 0);
    });
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
    const res = await fetch(api, { signal: AbortSignal.timeout(105000) });
    const data = asRecord(await res.json());
    if (!res.ok) {
      const errorMessage = asRecord(data.error).message;
      return { error: typeof errorMessage === "string" ? errorMessage : "PageSpeed request failed" };
    }

    const lighthouse = asRecord(data.lighthouseResult);
    if (!Object.keys(lighthouse).length) {
      return { error: "PageSpeed response did not include Lighthouse audit data" };
    }
    const audits = asRecord(lighthouse.audits);
    const categories = asRecord(lighthouse.categories);
    if (!Object.keys(audits).length || !Object.keys(categories).length) {
      return { error: "PageSpeed response did not include category scores and audit results" };
    }
    const configSettings = asRecord(lighthouse.configSettings);
    const screenEmulation = asRecord(configSettings.screenEmulation);
    const devicePixelRatio = typeof screenEmulation.deviceScaleFactor === "number"
      ? screenEmulation.deviceScaleFactor
      : null;
    const raw = asRecord(categories.performance).score;
    const accessibilityScore = asRecord(categories.accessibility).score;
    const bestPracticesScore = asRecord(categories["best-practices"]).score;

    const lcpElementItems = asRecord(asRecord(audits["largest-contentful-paint-element"]).details).items;
    const lcpUrls = new Set(
      (Array.isArray(lcpElementItems) ? lcpElementItems : [])
        .map((item) => {
          const record = asRecord(item);
          return resourceUrl(record) ?? resourceUrl(asRecord(record.node));
        })
        .filter((url): url is string => url !== null)
    );
    const performanceFindings = categoryFindings(categories.performance, audits, devicePixelRatio, lcpUrls);
    const urlFieldMetrics = asRecord(asRecord(data.loadingExperience).metrics);
    const originFieldMetrics = asRecord(asRecord(data.originLoadingExperience).metrics);
    const fieldDataSource = Object.keys(urlFieldMetrics).length > 0
      ? "url"
      : Object.keys(originFieldMetrics).length > 0
        ? "origin"
        : null;
    const fieldExperience = fieldDataSource === "url"
      ? data.loadingExperience
      : fieldDataSource === "origin"
        ? data.originLoadingExperience
        : null;
    const rawCwvCategory = asRecord(fieldExperience).overall_category;
    const cwvAssessment = rawCwvCategory === "FAST"
      ? "passed"
      : rawCwvCategory === "AVERAGE" || rawCwvCategory === "SLOW"
        ? "failed"
        : null;
    const filmstripDetails = asRecord(asRecord(audits["screenshot-thumbnails"]).details);
    const filmstrip = (Array.isArray(filmstripDetails.items) ? filmstripDetails.items : [])
      .slice(0, 8)
      .flatMap((item) => {
        const frame = asRecord(item);
        return typeof frame.data === "string" ? [{ data: frame.data, timing: typeof frame.timing === "number" ? frame.timing : null }] : [];
      });
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
        inp: fieldMetric(fieldExperience, "INTERACTION_TO_NEXT_PAINT", "ms"),
        cls: fieldMetric(fieldExperience, "CUMULATIVE_LAYOUT_SHIFT_SCORE", "cls"),
        fcp: fieldMetric(fieldExperience, "FIRST_CONTENTFUL_PAINT_MS", "ms"),
        ttfb: fieldMetric(fieldExperience, "EXPERIMENTAL_TIME_TO_FIRST_BYTE", "ms"),
      },
      fieldDataSource,
      cwvAssessment,
      opportunities: performanceFindings.filter((finding) =>
        finding.savings.overallMs !== null ||
        finding.savings.lcpMs !== null ||
        finding.savings.fcpMs !== null ||
        finding.savings.inpMs !== null ||
        finding.savings.bytes !== null ||
        finding.resources.some((resource) => typeof resource.wastedBytes === "number" && resource.wastedBytes > 0)
      ),
      diagnostics: performanceFindings.filter((finding) =>
        finding.savings.overallMs === null &&
        finding.savings.lcpMs === null &&
        finding.savings.fcpMs === null &&
        finding.savings.inpMs === null &&
        finding.savings.bytes === null &&
        !finding.resources.some((resource) => typeof resource.wastedBytes === "number" && resource.wastedBytes > 0)
      ),
      accessibilityFindings: categoryFindings(categories.accessibility, audits, devicePixelRatio, lcpUrls),
      bestPracticeFindings: categoryFindings(categories["best-practices"], audits, devicePixelRatio, lcpUrls),
      seoFindings: categoryFindings(categories.seo, audits, devicePixelRatio, lcpUrls),
      filmstrip,
    };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "Unknown PageSpeed error";
    const timedOut = cause instanceof Error && (cause.name === "TimeoutError" || /aborted due to timeout/i.test(cause.message));
    return {
      error: timedOut
        ? `PageSpeed Insights did not finish within 105 seconds. Lighthouse scores and findings are unavailable for this device. Retry the audit to request fresh results.`
        : `PageSpeed Insights request failed: ${detail}`,
    };
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
    const contentType = res.headers.get("content-type") ?? "";
    let html = "";
    if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
      html = await readBodyPrefix(res, 512 * 1024);
    } else {
      await res.body?.cancel();
    }
    const platform = detectPlatform(html, res.headers);

    const [mobile, desktop, mobileCapture, desktopCapture] = await Promise.all([
      getPageSpeed(finalUrl.href, "mobile"),
      getPageSpeed(finalUrl.href, "desktop"),
      captureScreenshotOrFallback(finalUrl, { width: 390, height: 844 }, "mobile"),
      captureScreenshotOrFallback(finalUrl, { width: 1440, height: 900 }, "desktop"),
    ]);
    const screenshots = [
      mobileCapture ?? getPageSpeedScreenshot(mobile),
      desktopCapture ?? getPageSpeedScreenshot(desktop),
    ];
    const checks: Check[] = res.status >= 400
      ? [{
          id: "status",
          label: "HTTP response",
          status: "fail",
          value: `HTTP ${res.status}`,
          priority: "high",
          resource: finalUrl.href,
          fix: `The audited URL returned HTTP ${res.status}. Resolve that response for this URL before treating it as a successful page load.`,
        }]
      : [];
    return NextResponse.json({
      url: finalUrl.href,
      status: res.status,
      redirects,
      platform,
      checks,
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