#!/usr/bin/env node
// Long-running scheduler — the GUI counterpart to the original skill's cron
// sub-agent. Two jobs:
//   • drain the acquisition queue (run-next) frequently, so a user clicking
//     "获取" actually executes shortly after;
//   • run the追更 sweep (run-type3) once a day at the user-configured time
//     (Settings → 每日定时巡检, default 06:00 Beijing), which re-syncs each
//     tracked season against TMDB and acquires newly-aired / still-missing
//     episodes. The time is read live from the app DB each tick, so changing it
//     in Settings takes effect without restarting the scheduler.
//
//   node scripts/scheduler.mjs            # run forever
//   MEDIA_TRACK_SCHEDULER_ONCE=1 node scripts/scheduler.mjs   # one pass, exit
//
// Env:
//   MEDIA_TRACK_BASE_URL              default http://localhost:3000
//   MEDIA_TRACK_WORKER_SECRET         sent as x-media-track-worker-secret if set
//   MEDIA_TRACK_RUN_NEXT_INTERVAL_MS  default 15000  (drain acquisition queue)
//   MEDIA_TRACK_WEB_DB_PATH           default .media-track-web.sqlite (read sweep time)
//   MEDIA_TRACK_SCHEDULER_ONCE        "1" → run both once and exit (cron-friendly)

import { DatabaseSync } from "node:sqlite";

const BASE = (process.env.MEDIA_TRACK_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.MEDIA_TRACK_WORKER_SECRET;
const NEXT_INTERVAL = Number(process.env.MEDIA_TRACK_RUN_NEXT_INTERVAL_MS ?? 15_000);
const DB_PATH = process.env.MEDIA_TRACK_WEB_DB_PATH ?? ".media-track-web.sqlite";
const DEFAULT_SWEEP_TIME = "06:00";
const ONCE = process.env.MEDIA_TRACK_SCHEDULER_ONCE === "1";

const headers = SECRET ? { "x-media-track-worker-secret": SECRET } : {};

function ts() {
  return new Date().toISOString().slice(11, 19);
}

/** The user-configured daily sweep time "HH:MM" (Beijing), read fresh from the
 *  app DB each tick; falls back to 06:00 if unset/malformed/unreadable. */
function configuredSweepTime() {
  try {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    try {
      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'daily_sweep_time'").get();
      const value = typeof row?.value === "string" ? row.value.trim() : "";
      return /^\d{2}:\d{2}$/.test(value) ? value : DEFAULT_SWEEP_TIME;
    } finally {
      db.close();
    }
  } catch {
    return DEFAULT_SWEEP_TIME;
  }
}

function beijingNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hhmm: `${get("hour")}:${get("minute")}` };
}

async function post(path) {
  try {
    const res = await fetch(BASE + path, { method: "POST", headers });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}

let draining = false;
// Claim-one-at-a-time worker: keep calling until the queue reports idle.
async function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    for (let i = 0; i < 50; i += 1) {
      const result = await post("/api/workflows/run-next");
      if (!result.ok) {
        console.log(`[${ts()}] run-next error: ${result.error ?? result.status}`);
        return;
      }
      if (result.body?.status === "idle") return;
      console.log(`[${ts()}] run-next: ${result.body?.status ?? "?"} ${result.body?.workflowRunId ?? ""}`.trim());
    }
  } finally {
    draining = false;
  }
}

let sweeping = false;
async function sweepType3() {
  if (sweeping) return;
  sweeping = true;
  try {
    const result = await post("/api/workflows/run-type3");
    if (!result.ok) {
      console.log(`[${ts()}] run-type3 error: ${result.error ?? result.status}`);
      return;
    }
    const count = Array.isArray(result.body?.outcomes) ? result.body.outcomes.length : 0;
    console.log(`[${ts()}] run-type3 sweep: ${count} season(s) processed`);
  } finally {
    sweeping = false;
  }
}

// Fire the daily sweep once when the Beijing clock reaches the configured time.
let lastSweepDate = null;
async function maybeSweep() {
  const { date, hhmm } = beijingNow();
  if (hhmm === configuredSweepTime() && lastSweepDate !== date) {
    lastSweepDate = date; // guard: at most one sweep per Beijing day
    await sweepType3();
  }
}

async function main() {
  if (ONCE) {
    // Cron-friendly one-shot: drain the queue and sweep immediately, then exit.
    console.log(`[${ts()}] scheduler (once) → ${BASE}`);
    await drainQueue();
    await sweepType3();
    return;
  }
  console.log(
    `[${ts()}] scheduler → ${BASE} (run-next every ${NEXT_INTERVAL}ms, daily sweep at ${configuredSweepTime()} Beijing)`,
  );
  await drainQueue();
  // Don't pre-fire the sweep at startup — it runs only when the clock reaches
  // the configured time, so a restart never triggers an off-schedule sweep.
  setInterval(drainQueue, NEXT_INTERVAL);
  setInterval(maybeSweep, 60_000); // minute granularity is enough for a daily job
}

main();
