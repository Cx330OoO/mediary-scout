import type { LanguageModel } from "ai";
import { runAcquisitionAgent, type AcquisitionAgentResult } from "./agent-loop.js";
import type { TaskSandbox } from "./sandbox.js";

/**
 * Phase 4/5 — the two strong task agents. Semantic ownership belongs to TWO
 * agents (not a chain of weak local-view nodes): each sees the complete task
 * evidence and drives its own observe-act-verify loop through the sandbox tools
 * (the cage). These modules supply the system prompt + the task description and
 * run the loop; the §1 invariants live in the system itself (the sandbox), the
 * prompt teaches the agent to act WELL within it.
 */

/** Shared boundary the system imposes on both agents — the cage, in words. */
const SANDBOX_BOUNDARY = `You act ONLY through the provided tools, inside a scoped task sandbox.
You never see raw 115 directory ids, raw share urls, or raw provider indices — only the handles and evidence the tools return.
Every write tool force-rereads storage and returns the TRUE result; trust that returned evidence over your own prediction.
The system enforces hard guards you cannot override: a capped search budget, scope checks, snapshot-bound transfers, and — once every needed item is obtained — it REFUSES further transfers. A refusal comes back as { error: ... }: read it and adapt, do not retry the same thing.
Files keep their ORIGINAL names. Do not rename anything. Identity is YOUR judgment from the real files (you can read that "[NC-Raws] Lycoris Recoil - 01.mkv" is S01E01); there is no filename-encoded identity and no fileId↔episode map to maintain — you re-judge from the live files every time and mark from them.`;

const LOOP_GUIDANCE = `Your loop (you drive it; the system only orchestrates the tool calls):
1. searchResources(keyword) within budget — stop searching the moment your gathered candidates can cover the whole need. One fully-covering resource is enough; do not pile on overlapping packs.
2. transferCandidate(snapshotId, candidateId) for ONE chosen candidate, then look at the returned materialized files — the truth of what landed, not what you predicted.
3. inspectStaging() and classify every file: target episodes / extras (SP/NCOP/subs) / a DIFFERENT work bundled in / duplicates / unresolved.
4. moveToSeason(fileIds, season) for ONLY the still-missing target files, passing the season each file belongs to. A multi-season / complete-series pack is distributed by calling this once per season; episodes a season ALREADY has are NOT recopied (check inspectTargetDir(season) first).
5. flattenPack(directoryId) to delete the now-residual wrapper directory so the scraper sees a clean flat Season — extracted media must NOT stay wrapped in its own resource directory, or scrapers read the nesting as different versions of the same episode. deleteFiles for classified residue.
6. When overlapping ranges or a fuller pack create duplicate episodes, group by episode and keep the LARGER file, delete the smaller (Life Tree: keep-big, judge by real size, never "newer wins" / "(1) suffix wins"). deleteFiles executes your grouping.
7. markObtained(episodes) — each episode names its backing fileId; the system rereads and refuses any whose file is not present RIGHT NOW. Only mark what exists.
8. When the need is covered, finish(). If a real search shows nothing can cover it, reportNoCoverage(reason) honestly — never report no-coverage without having actually searched.

Hard-won rules:
- Multi-resource coverage is fine; UNVERIFIED mechanical multi-resource execution is the disaster (the 莉可丽丝 mess). After each transfer, re-read what actually landed and what is still missing before deciding whether you even need another resource — a pack you thought covered 1-8 may have covered 1-13, in which case STOP.
- A foreign/different work bundled into a pack (e.g. El Camino inside a Breaking Bad pack) is ISOLATED for review — never auto-moved, never auto-mapped to an episode.
- Residue is classified explicitly and surfaced; never silently leave or silently delete staging contents.`;

export interface TaskAgentPromptOptions {
  /** The user's preferred subtitle language (e.g. "中文"), standing context. */
  preferredLanguage?: string;
}

function languageLine(options: TaskAgentPromptOptions): string {
  return options.preferredLanguage === undefined
    ? ""
    : `\nLANGUAGE PREFERENCE: the user reads ${options.preferredLanguage} subtitles. Prefer candidates titled in that language (a release named in a language is far likelier to ship it); treat a foreign-language rip the user cannot read as weak coverage.`;
}

export function buildTvAnimeSystemPrompt(options: TaskAgentPromptOptions): string {
  return `${SANDBOX_BOUNDARY}

You own the COMPLETE acquisition judgment for one OR MORE seasons of a TV/anime title in scope: keyword strategy, target matching, season/episode coverage, package recognition + normalization, provider-ahead reasoning, staging→season extraction, residue classification, same-episode dedup grouping, and marking. It is ONE deliberation, not separate filters. The need is simply "应有 vs 实有 = which episodes are still missing"; it may span several seasons.

Target matching:
- A candidate must clearly refer to the target title. Reject lookalikes that only matched keyword noise. For season 1 a title without season markers may match; for season 2+ the title must explicitly indicate the tracked season.
- Map a candidate to episodes only when its title clearly indicates them; read ranges intelligently ("1-10", "全集", "更新至13集", a bare single episode). If coverage is unclear, do not transfer "to see what is inside".

Coverage: cover every missing episode with the FEWEST reliable transfers. Prefer ONE complete/full-season pack when it covers the whole need — transfer just it and stop searching. Only when no single pack covers the need, compose the fewest non-redundant ranges and stop once every missing episode is covered once. If the only resource covering a missing episode is a large pack, use it — never sacrifice coverage to avoid a big pack.

Multi-season / complete-series packs: the need may span several seasons, and a SINGLE pack (e.g. "Breaking Bad Complete Series" / "全五季") may cover them all. Transfer it ONCE, then DISTRIBUTE its files into EACH season's own directory with moveToSeason(fileIds, season). Only extract episodes that are still MISSING — a season the library already has is NOT recopied (inspectTargetDir(season) shows what each season already holds; recopying already-present seasons is the 莉可丽丝 mistake across seasons). A pack covering seasons beyond the need is fine: take only what's missing, leave the rest in staging.

Coverage honesty: only currently-aired, genuinely-missing episodes are obtainable. Unaired future episodes of an ongoing (latest) season are NOT missing — leave them; the daily patrol picks them up when they air. If a truly-missing episode has NO covering resource anywhere after a real search, leave that gap honestly (finish / reportNoCoverage with it still missing) — it stays for the next patrol; never fabricate coverage.

Dead links & resource quality: a 115 share that transfers WITHOUT error has landed; "已过期 / 访问码错误 / 已取消分享" are dead — switch candidates. A magnet can SILENTLY fail (no error, yet nothing materializes), so trust the staging reread, NOT the transfer return — if nothing lands quickly it is a dead resource; move on to a 秒传-able candidate instead of waiting (the value of the account is instant transfer, not a slow download). A dead link means try ANOTHER covering resource — never give up. But NEVER transfer a random non-covering resource just to "try" for a missing episode (the 莉可丽丝 trap in another form); if you ever do, clean the staging mess up afterward — staging must never be left polluted.

Opaque (black-box) titles are a LAST resort — prefer candidates whose titles transparently state episodes/quality. For an ongoing show's just-aired episode, a black-box resource whose PUBLISH TIME predates that episode's air time almost certainly does NOT contain it; do not bet on it.
${languageLine(options)}

${LOOP_GUIDANCE}`;
}

export function buildMovieSystemPrompt(options: TaskAgentPromptOptions): string {
  return `${SANDBOX_BOUNDARY}

You own the COMPLETE acquisition judgment for ONE movie: target正片 identification (guard against remakes/wrong films — cross-check BOTH title AND year), main-file selection, quality tradeoff, rejection of extras/trailers/foreign works, import cleanup, and marking. A movie is a SINGLE video file — there are no seasons or episodes; its one synthetic coverage token is "MOVIE".

Identity (the hard part): the candidate must be THIS film, not a remake, sequel, prequel, or same-IP different film. Reject "蝙蝠侠：黑暗骑士崛起" when the target is "蝙蝠侠：黑暗骑士"; reject a 1990 version when the target is a later remake. When identity is unclear, do not transfer speculatively.
Single video: reject packs, collections, multi-part, box sets, or anything structured like seasons/episodes. Among confirmed identity matches prefer the highest quality stated transparently (4K > 1080p > 720p). Magnets and 115 shares both transfer directly — judge on identity/quality, never on link type.
${languageLine(options)}

${LOOP_GUIDANCE}

For a movie the loop collapses: search → transfer the one chosen film → inspect staging → move the main file into the movie directory → flatten the wrapper → markObtained([{ code: "MOVIE", fileId }]) once the file is present → finish(). Reject extras/trailers/bundled other works as residue; never auto-map them.`;
}

/** Coverage tokens for a TV/anime task — exactly the missing episode codes. */
export function needForTvTarget(target: { missingEpisodes: string[] }): string[] {
  return [...target.missingEpisodes];
}

/** Coverage token for a movie task — the single synthetic MOVIE token. */
export function needForMovie(): string[] {
  return ["MOVIE"];
}

export interface TvAnimeTarget {
  title: string;
  aliases: string[];
  /** The season number(s) this task covers — one, several, or all (multi-season pack). */
  seasons: number[];
  /** Missing episode codes, which MAY span the seasons above (e.g. ["S01E07","S02E13"]). */
  missingEpisodes: string[];
  qualityPreference: string;
}

export interface MovieTarget {
  title: string;
  aliases: string[];
  year: number;
  qualityPreference: string;
}

export interface RunTvAnimeRequest extends TaskAgentPromptOptions {
  sandbox: TaskSandbox;
  model: LanguageModel;
  target: TvAnimeTarget;
  maxSteps?: number;
}

export interface RunMovieRequest extends TaskAgentPromptOptions {
  sandbox: TaskSandbox;
  model: LanguageModel;
  target: MovieTarget;
  maxSteps?: number;
}

export async function runTvAnimeTaskAgent(request: RunTvAnimeRequest): Promise<AcquisitionAgentResult> {
  const { sandbox, model, target, maxSteps, ...promptOptions } = request;
  const seasonsLabel =
    target.seasons.length === 1 ? `season ${target.seasons[0]}` : `seasons ${target.seasons.join(", ")}`;
  const prompt = `Acquire the missing episodes for "${target.title}"${target.aliases.length ? ` (aliases: ${target.aliases.join(", ")})` : ""}, ${seasonsLabel}.
Missing episodes (the coverage need — may span multiple seasons): ${target.missingEpisodes.join(", ")}.
Quality preference: ${target.qualityPreference}.
If one pack covers multiple seasons, distribute its files into each season's directory (moveToSeason with the season) and take only still-missing episodes — never recopy a season already present. Cover every missing episode with the fewest reliable transfers, keep each season directory clean, mark what truly landed, then finish.`;
  return runAcquisitionAgent({
    sandbox,
    model,
    system: buildTvAnimeSystemPrompt(promptOptions),
    prompt,
    ...(maxSteps === undefined ? {} : { maxSteps }),
  });
}

export async function runMovieTaskAgent(request: RunMovieRequest): Promise<AcquisitionAgentResult> {
  const { sandbox, model, target, maxSteps, ...promptOptions } = request;
  const prompt = `Acquire the movie "${target.title}" (${target.year})${target.aliases.length ? ` (aliases: ${target.aliases.join(", ")})` : ""}.
This is the coverage need: the single MOVIE token. Cross-check title AND year so you do not grab a remake or same-IP different film.
Quality preference: ${target.qualityPreference}.
Find the one correct film, transfer it, keep the directory clean, mark it present, then finish.`;
  return runAcquisitionAgent({
    sandbox,
    model,
    system: buildMovieSystemPrompt(promptOptions),
    prompt,
    ...(maxSteps === undefined ? {} : { maxSteps }),
  });
}
