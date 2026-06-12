#!/usr/bin/env node
// Live title-level series initialization ("获取全剧"): planning agent over the
// full multi-season need set -> staging transfers -> normalization -> dedup
// -> per-season tracked persistence. Scoped to the 115 test root.
//
// Usage: node scripts/live-series-init.mjs --tmdb 76479

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

function loadDotEnv(envPath) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.tmdb) {
  console.log("Usage: node scripts/live-series-init.mjs --tmdb <id> [--quality 4K]");
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(path.join(repoRoot, ".env"));
for (const key of ["XIAOMI_MIMO_API_KEY", "PANSOU_BASE_URL", "PAN115_COOKIE", "TMDB_READ_TOKEN", "MEDIA_TRACK_115_TEST_ROOT_CID"]) {
  if (!process.env[key]) {
    console.error(`${key} is not set. Aborting.`);
    process.exit(1);
  }
}

const {
  createPanSouResourceProviderFromEnv,
  createProtectedPan115CookieStorageExecutorFromEnv,
  createTmdbMetadataProviderFromEnv,
  createXiaomiMimoAgentNodesFromEnv,
  prepareSeriesTarget,
  runSeriesInitializationAndPersist,
  SQLiteWorkflowRepository,
} = await import(path.join(repoRoot, "packages/workflow/dist/index.js"));

const tmdbId = Number(args.tmdb);
console.log(`[1/3] preparing series target for tv/${tmdbId} ...`);
const target = await prepareSeriesTarget({
  tmdbId,
  qualityPreference: args.quality ?? "4K",
  metadataProvider: createTmdbMetadataProviderFromEnv(),
});
console.log("      title:", target.title.title, `(${target.title.year})`, "aliases:", target.title.aliases);
for (const season of target.seasons) {
  console.log(`      S${season.seasonNumber}: total=${season.totalEpisodes} latestAired=${season.latestAiredEpisode}`);
}

const storage = createProtectedPan115CookieStorageExecutorFromEnv({ env: process.env });
const repository = new SQLiteWorkflowRepository(
  new DatabaseSync(path.join(repoRoot, ".media-track-live-series.sqlite")),
);

console.log("[2/3] running series initialization (planning agent + staging + normalization + dedup) ...");
const start = Date.now();
const result = await runSeriesInitializationAndPersist({
  title: target.title,
  seasons: target.seasons,
  keyword: target.keyword,
  storageParentDirectoryId: process.env.MEDIA_TRACK_115_TEST_ROOT_CID,
  resourceProvider: createPanSouResourceProviderFromEnv(),
  storage,
  agents: createXiaomiMimoAgentNodesFromEnv(process.env),
  repository,
  workflowRun: {
    id: `live_series_${Date.now()}`,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  },
});
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log(`[3/3] result (${elapsed}s)`);
console.log("      status:", result.status);
for (const entry of result.seasons) {
  console.log(
    `      S${entry.season.seasonNumber} [${entry.season.status}]: obtained ${entry.obtainedEpisodes.length}/${entry.season.totalEpisodes} -> ${entry.season.storageDirectoryId}`,
  );
}
console.log("      decisions:", JSON.stringify(result.decisions.map((d) => ({
  selected: d.selectedCandidateIds.length, confidence: d.confidence, reason: d.reason.slice(0, 200),
})), null, 2));
console.log("      attempts:", JSON.stringify(result.transferAttempts.map((a) => ({ candidateId: a.candidateId, status: a.status })), null, 2));
console.log("      notification:", result.notification.body);
console.log("      audit types:", JSON.stringify([...new Set(result.auditEvents.map((e) => e.type))]));
const planEvents = result.auditEvents.filter((e) => e.type === "acquisition_plan_created");
for (const event of planEvents) {
  const plan = event.data?.plan;
  if (plan) {
    console.log(`      pass plan: snapshot=${plan.selectedSnapshotId} keywords=${JSON.stringify(plan.searchedKeywords)}`);
    for (const d of plan.candidateDispositions.filter((x) => x.disposition === "selected")) {
      console.log(`        selected: ${d.candidateId} episodes=${d.episodes.length} reason=${d.reason.slice(0, 140)}`);
    }
  }
}
console.log("\ndone.");
