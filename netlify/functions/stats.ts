import type { Config } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { and, count, countDistinct, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { events } from "../../db/schema.js";

function isAuthorized(req: Request) {
  const expected = Netlify.env.get("DASHBOARD_PASSWORD");
  const given = req.headers.get("x-dashboard-password");
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req: Request) => {
  if (!Netlify.env.get("DASHBOARD_PASSWORD")) {
    return Response.json(
      { error: "Set the DASHBOARD_PASSWORD environment variable in Netlify to use the dashboard." },
      { status: 503 },
    );
  }
  if (!isAuthorized(req)) {
    return Response.json({ error: "Wrong password" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const inRange = gte(events.createdAt, since);

  const topBy = (column: any, where = inRange, limit = 10) =>
    db
      .select({ label: column, total: count() })
      .from(events)
      .where(and(where, isNotNull(column)))
      .groupBy(column)
      .orderBy(desc(count()))
      .limit(limit);

  const [totals] = await db
    .select({
      visitors: countDistinct(events.visitorId),
      sessions: countDistinct(events.sessionId),
      pageviews: sql<number>`count(*) filter (where ${events.type} = 'pageview')`.mapWith(Number),
      clicks: sql<number>`count(*) filter (where ${events.type} = 'click')`.mapWith(Number),
      avgDurationMs: sql<number>`coalesce(avg(${events.durationMs}) filter (where ${events.type} = 'leave'), 0)`.mapWith(Number),
    })
    .from(events)
    .where(inRange);

  const day = sql<string>`to_char(date_trunc('day', ${events.createdAt}), 'YYYY-MM-DD')`;
  const [daily, sections, clicks, referrers, countries, devices, browsers] = await Promise.all([
    db
      .select({ day, visitors: countDistinct(events.visitorId), pageviews: count() })
      .from(events)
      .where(and(inRange, eq(events.type, "pageview")))
      .groupBy(day)
      .orderBy(day),
    topBy(events.target, and(inRange, eq(events.type, "section"))),
    topBy(events.target, and(inRange, eq(events.type, "click"))),
    topBy(events.referrer, and(inRange, eq(events.type, "pageview"))),
    topBy(events.country, and(inRange, eq(events.type, "pageview"))),
    topBy(events.device, and(inRange, eq(events.type, "pageview"))),
    topBy(events.browser, and(inRange, eq(events.type, "pageview"))),
  ]);

  // Most recent sessions with their full activity timeline
  const recentSessions = await db
    .select({ sessionId: events.sessionId, lastSeen: sql<string>`max(${events.createdAt})` })
    .from(events)
    .where(inRange)
    .groupBy(events.sessionId)
    .orderBy(desc(sql`max(${events.createdAt})`))
    .limit(25);

  const sessionIds = recentSessions.map((s) => s.sessionId);
  const sessionEvents = sessionIds.length
    ? await db
        .select()
        .from(events)
        .where(inArray(events.sessionId, sessionIds))
        .orderBy(events.createdAt)
    : [];

  const sessions = recentSessions.map((s) => {
    const list = sessionEvents.filter((e) => e.sessionId === s.sessionId);
    const first = list[0];
    return {
      sessionId: s.sessionId,
      visitorId: first?.visitorId,
      startedAt: first?.createdAt,
      lastSeen: s.lastSeen,
      country: first?.country,
      city: first?.city,
      device: first?.device,
      browser: first?.browser,
      os: first?.os,
      referrer: list.find((e) => e.type === "pageview")?.referrer ?? null,
      events: list.map((e) => ({
        type: e.type,
        target: e.target,
        path: e.path,
        durationMs: e.durationMs,
        at: e.createdAt,
      })),
    };
  });

  return Response.json({
    days,
    totals,
    daily,
    sections,
    clicks,
    referrers,
    countries,
    devices,
    browsers,
    sessions,
  });
};

export const config: Config = {
  path: "/api/stats",
};
