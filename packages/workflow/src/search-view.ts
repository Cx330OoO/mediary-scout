import type { MediaType } from "./domain.js";
import type { WorkflowRepository } from "./repository.js";

export type SearchPageState = "empty" | "ready";
export type SearchCacheStatus = "none" | "hit" | "miss";
export type SearchActionState = "can_request" | "already_tracked" | "active_workflow";

export interface MediaSearchSeason {
  seasonNumber: number;
  episodeCount: number;
  latestAiredEpisode: number;
}

export interface MediaSearchCandidate {
  tmdbId: number;
  mediaType: Extract<MediaType, "movie" | "tv">;
  title: string;
  originalTitle: string;
  year: number;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  seasons: MediaSearchSeason[];
}

export interface MediaSearchProvider {
  searchMedia(input: { query: string }): Promise<MediaSearchCandidate[]>;
}

export interface MediaSearchCache {
  get(query: string): Promise<MediaSearchCandidate[] | null>;
  set(query: string, candidates: MediaSearchCandidate[]): Promise<void>;
}

export interface SearchCandidateAction {
  state: SearchActionState;
  label: string;
  disabled: boolean;
  workflowRunId: string | null;
}

export interface SearchCandidateCard {
  id: string;
  tmdbId: number;
  mediaType: MediaSearchCandidate["mediaType"];
  title: string;
  originalTitle: string;
  year: number;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  selectedSeasonNumber: number | null;
  totalEpisodes: number | null;
  latestAiredEpisode: number | null;
  /** All known seasons of the title (tv), for per-season request entries. */
  seasonNumbers: number[];
  action: SearchCandidateAction;
}

export interface SearchPageView {
  query: string;
  state: SearchPageState;
  cacheStatus: SearchCacheStatus;
  candidates: SearchCandidateCard[];
}

export class InMemoryMediaSearchCache implements MediaSearchCache {
  private readonly values = new Map<string, MediaSearchCandidate[]>();

  async get(query: string): Promise<MediaSearchCandidate[] | null> {
    const value = this.values.get(normalizeSearchQuery(query));
    return value ? structuredClone(value) : null;
  }

  async set(query: string, candidates: MediaSearchCandidate[]): Promise<void> {
    this.values.set(normalizeSearchQuery(query), structuredClone(candidates));
  }
}

export async function getSearchPageView(input: {
  query: string;
  provider: MediaSearchProvider;
  cache: MediaSearchCache;
  repository: WorkflowRepository;
}): Promise<SearchPageView> {
  const query = normalizeSearchQuery(input.query);
  if (!query) {
    return {
      query,
      state: "empty",
      cacheStatus: "none",
      candidates: [],
    };
  }

  const cached = await input.cache.get(query);
  const candidates = cached ?? (await input.provider.searchMedia({ query }));
  if (!cached) {
    await input.cache.set(query, candidates);
  }

  return {
    query,
    state: "ready",
    cacheStatus: cached ? "hit" : "miss",
    candidates: await Promise.all(candidates.map((candidate) => toCandidateCard(candidate, input.repository))),
  };
}

function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

async function toCandidateCard(
  candidate: MediaSearchCandidate,
  repository: WorkflowRepository,
): Promise<SearchCandidateCard> {
  const selectedSeason = candidate.mediaType === "tv" ? candidate.seasons[0] : undefined;
  const id =
    candidate.mediaType === "tv" && selectedSeason
      ? trackedSeasonId(candidate.tmdbId, selectedSeason.seasonNumber)
      : mediaTitleId(candidate.mediaType, candidate.tmdbId);

  return {
    id,
    tmdbId: candidate.tmdbId,
    mediaType: candidate.mediaType,
    title: candidate.title,
    originalTitle: candidate.originalTitle,
    year: candidate.year,
    overview: candidate.overview,
    posterPath: candidate.posterPath,
    backdropPath: candidate.backdropPath,
    selectedSeasonNumber: selectedSeason?.seasonNumber ?? null,
    totalEpisodes: selectedSeason?.episodeCount ?? null,
    latestAiredEpisode: selectedSeason?.latestAiredEpisode ?? null,
    seasonNumbers:
      candidate.mediaType === "tv"
        ? candidate.seasons.map((season) => season.seasonNumber).sort((a, b) => a - b)
        : [],
    action: selectedSeason
      ? await actionForTrackedSeason(repository, trackedSeasonId(candidate.tmdbId, selectedSeason.seasonNumber))
      : canRequestAction(),
  };
}

async function actionForTrackedSeason(
  repository: WorkflowRepository,
  trackedSeasonIdValue: string,
): Promise<SearchCandidateAction> {
  const activeRun = await repository.findActiveWorkflowRun({
    trackedSeasonId: trackedSeasonIdValue,
    kind: "type2_init",
  });
  if (activeRun) {
    return {
      state: "active_workflow",
      label: "获取中",
      disabled: true,
      workflowRunId: activeRun.workflowRun.id,
    };
  }

  const episodes = await repository.listEpisodeStates(trackedSeasonIdValue);
  if (episodes.length > 0) {
    return {
      state: "already_tracked",
      label: "已追踪",
      disabled: true,
      workflowRunId: null,
    };
  }

  return canRequestAction();
}

function canRequestAction(): SearchCandidateAction {
  return {
    state: "can_request",
    label: "获取",
    disabled: false,
    workflowRunId: null,
  };
}

function mediaTitleId(mediaType: MediaSearchCandidate["mediaType"], tmdbId: number): string {
  return `tmdb_${mediaType}_${tmdbId}`;
}

function trackedSeasonId(tmdbId: number, seasonNumber: number): string {
  return `${mediaTitleId("tv", tmdbId)}_s${seasonNumber}`;
}
