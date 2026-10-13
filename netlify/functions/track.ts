import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { events } from "../../db/schema.js";

const TYPES = new Set(["pageview", "section", "click", "leave"]);
const MAX_BATCH = 50;

const clip = (value: unknown, max = 300) =>
  typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;

function parseUserAgent(ua: string) {
  const device = /iPad|Tablet/i.test(ua)
    ? "Tablet"
    : /Mobi|Android|iPhone/i.test(ua)
      ? "Mobile"
      : "Desktop";

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Firefox\/|FxiOS/.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Other";

  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "Other";

  return { device, browser, os };
}

const isBot = (ua: string) => /bot|crawl|spider|slurp|headless|lighthouse/i.test(ua);

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const ua = req.headers.get("user-agent") ?? "";
  if (isBot(ua)) return new Response(null, { status: 204 });

  let body: any;
  try {
    // sendBeacon posts as text/plain, so parse the raw body
    body = JSON.parse(await req.text());
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const visitorId = clip(body?.visitorId, 64);
  const sessionId = clip(body?.sessionId, 64);
  const list = Array.isArray(body?.events) ? body.events.slice(0, MAX_BATCH) : [];
  if (!visitorId || !sessionId || list.length === 0) {
    return new Response("Missing fields", { status: 400 });
  }

  const { device, browser, os } = parseUserAgent(ua);
  const country = context.geo?.country?.name ?? null;
  const city = context.geo?.city ?? null;

  const rows = list
    .filter((e: any) => TYPES.has(e?.type))
    .map((e: any) => ({
      visitorId,
      sessionId,
      type: e.type,
      path: clip(e.path, 200) ?? "/",
      target: clip(e.target, 200),
      referrer: clip(e.referrer),
      durationMs:
        typeof e.durationMs === "number" && e.durationMs >= 0
          ? Math.min(Math.round(e.durationMs), 24 * 60 * 60 * 1000)
          : null,
      country,
      city,
      device,
      browser,
      os,
    }));

  if (rows.length > 0) await db.insert(events).values(rows);

  return new Response(null, { status: 204 });
};

export const config: Config = {
  path: "/api/track",
};
