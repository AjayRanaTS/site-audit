import { NextResponse } from "next/server";

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

  return NextResponse.json({
    url: parsed.href,
    message: "Audit route is working",
  });
}