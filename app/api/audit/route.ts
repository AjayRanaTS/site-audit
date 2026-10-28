import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const maxDuration = 60;

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return (
      v === "::1" || v === "::" || v.startsWith("fc") ||
      v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
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

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

async function getPageSpeed(url: string) {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) return { error: "PageSpeed API key is not set" };

  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url);
  api.searchParams.set("strategy", "mobile");
  api.searchParams.set("category", "performance");
  api.searchParams.set("key", key);

  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(50000) });
    const data = await res.json();
    if (!res.ok) {
      return { error: data?.error?.message || "PageSpeed request failed" };
    }
    const audits = data.lighthouseResult?.audits ?? {};
    const score = data.lighthouseResult?.categories?.performance?.score;
    return {
      score: typeof score === "number" ? Math.round(score * 100) : null,
      fcp: audits["first-contentful-paint"]?.displayValue ?? null,
      lcp: audits["largest-contentful-paint"]?.displayValue ?? null,
      tbt: audits["total-blocking-time"]?.displayValue ?? null,
      cls: audits["cumulative-layout-shift"]?.displayValue ?? null,
    };
  } catch {
    return { error: "PageSpeed timed out or failed" };
  }
}

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

    const title = clean($("title").first().text());
    const description = clean($('meta[name="description"]').attr("content") ?? "");
    const h1s = $("h1")
      .map((_, el) => clean($(el).text()))
      .get()
      .filter(Boolean);
    const emptyH1Count = $("h1").length - h1s.length;

    const issues: string[] = [];
    if (!title) issues.push("Missing page title");
    else if (title.length > 60) issues.push("Title is longer than 60 characters");
    else if (title.length < 30) issues.push("Title is shorter than 30 characters");

    if (!description) issues.push("Missing meta description");
    else if (description.length > 160) issues.push("Meta description is longer than 160 characters");

    if (h1s.length === 0) {
      issues.push(emptyH1Count > 0 ? "H1 exists but is empty" : "No H1 found");
    }
    if (h1s.length > 1) issues.push("More than one H1 found");

    const performance = await getPageSpeed(finalUrl.href);
    if ("score" in performance && typeof performance.score === "number" && performance.score < 50) {
      issues.push("Mobile performance score is below 50");
    }

    return NextResponse.json({
      url: finalUrl.href,
      status: res.status,
      title,
      titleLength: title.length,
      description,
      descriptionLength: description.length,
      h1Count: h1s.length,
      h1s,
      performance,
      issues,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Could not fetch this URL" },
      { status: 400 }
    );
  }
}