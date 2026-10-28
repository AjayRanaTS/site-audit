import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
    return { res, finalUrl: current };
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

function metric(audits: any, id: string): Metric {
  const a = audits?.[id];
  return {
    display: a?.displayValue ?? null,
    value: typeof a?.numericValue === "number" ? a.numericValue : null,
  };
}

async function getPageSpeed(url: string, strategy: "mobile" | "desktop") {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) return { error: "PageSpeed API key is not set" };

  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url);
  api.searchParams.set("strategy", strategy);
  api.searchParams.set("category", "performance");
  api.searchParams.set("key", key);

  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(50000) });
    const data = await res.json();
    if (!res.ok) {
      return { error: data?.error?.message || "PageSpeed request failed" };
    }

    const audits = data.lighthouseResult?.audits ?? {};
    const raw = data.lighthouseResult?.categories?.performance?.score;

    // Speed tips: audits that report time savings
    const tips = (Object.values(audits) as any[])
      .map((a) => {
        const savings =
          a?.details?.overallSavingsMs ??
          Math.max(a?.metricSavings?.LCP ?? 0, a?.metricSavings?.FCP ?? 0);
        return {
          title: a?.title as string | undefined,
          savingsMs: Number(savings) || 0,
          score: a?.score as number | null | undefined,
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

    return {
      score: typeof raw === "number" ? Math.round(raw * 100) : null,
      metrics: {
        fcp: metric(audits, "first-contentful-paint"),
        lcp: metric(audits, "largest-contentful-paint"),
        tbt: metric(audits, "total-blocking-time"),
        cls: metric(audits, "cumulative-layout-shift"),
        si: metric(audits, "speed-index"),
      },
      tips,
    };
  } catch {
    return { error: "The speed test timed out or failed" };
  }
}

/* ---------- Route ---------- */

export async function POST(request: Request) {
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
    const { res, finalUrl } = await safeFetch(parsed);
    const html = (await res.text()).slice(0, 2_000_000);
    const $ = cheerio.load(html);

    // Slow work runs in parallel
    const [mobile, desktop, robots, sitemapA, sitemapB] = await Promise.all([
      getPageSpeed(finalUrl.href, "mobile"),
      getPageSpeed(finalUrl.href, "desktop"),
      fetchSmall(new URL("/robots.txt", finalUrl.origin)),
      fetchSmall(new URL("/sitemap.xml", finalUrl.origin)),
      fetchSmall(new URL("/sitemap_index.xml", finalUrl.origin)),
    ]);

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

    /* Image alt text */
    const imgs = $("img");
    const imgTotal = imgs.length;
    const imgMissing = imgs.filter((_, el) => $(el).attr("alt") === undefined).length;
    if (imgTotal === 0) {
      add("alt", "Image alt text", "pass", "No images found");
    } else if (imgMissing === 0) {
      add("alt", "Image alt text", "pass", `All ${imgTotal} images have alt text`);
    } else {
      add(
        "alt",
        "Image alt text",
        imgMissing >= imgTotal / 2 ? "fail" : "warn",
        `${imgMissing} of ${imgTotal} images have no alt text`,
        "Add short, descriptive alt text to every meaningful image. It helps accessibility and image search."
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
    if ($('link[rel~="icon"]').length === 0) {
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
      seoScore,
      checks,
      performance: { mobile, desktop },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not fetch this URL" },
      { status: 400 }
    );
  }
}