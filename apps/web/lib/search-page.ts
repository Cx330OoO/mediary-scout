import {
  createTmdbSearchProviderFromEnv,
  getSearchPageView,
  InMemoryMediaSearchCache,
  type MediaSearchProvider,
  type SearchPageView,
} from "@media-track/workflow";
import { dashboardStateFromTrackedSeason, type DashboardState } from "./demo-workflow";
import { demoMediaSearchProvider } from "./demo-candidates";
import { SqliteMediaSearchCache } from "./tmdb-cache";
import {
  ensureDemoSeeded,
  getWebDatabase,
  getWorkflowRepository,
  getWorkflowStatusView,
} from "./workflow-runtime";

export interface ProductPageData {
  search: SearchPageView;
  dashboard: DashboardState;
}

let demoSearchCache: InMemoryMediaSearchCache | null = null;
let durableSearchCache: SqliteMediaSearchCache | null = null;
let tmdbSearchProvider: MediaSearchProvider | null = null;

export async function getProductPageData(query: string): Promise<ProductPageData> {
  const [search, dashboard] = await Promise.all([getSearchView(query), getLibraryDashboard()]);

  return {
    search,
    dashboard,
  };
}

export async function getSearchView(query: string): Promise<SearchPageView> {
  const repository = getWorkflowRepository();
  await ensureDemoSeeded(repository);
  return getSearchPageView({
    query,
    provider: getMediaSearchProvider(),
    cache: getSearchCache(),
    repository,
  });
}

export interface LibrarySeasonSummary {
  trackedSeasonId: string;
  seasonNumber: number;
  status: string;
  obtainedCount: number;
  latestAiredEpisode: number;
  totalEpisodes: number;
}

export interface LibraryTitleSummary {
  titleId: string;
  tmdbId: number;
  title: string;
  year: number;
  seasons: LibrarySeasonSummary[];
}

export interface LibraryDashboard extends DashboardState {
  libraryTitles: LibraryTitleSummary[];
}

export async function getLibraryDashboard(): Promise<LibraryDashboard> {
  const repository = getWorkflowRepository();
  await ensureDemoSeeded(repository);
  const trackedSeason = await getWorkflowStatusView(repository);
  if (!trackedSeason) {
    throw new Error("No tracked seasons are available");
  }
  const states = await repository.listTrackedSeasonStates();
  const byTitle = new Map<string, LibraryTitleSummary>();
  for (const state of states) {
    const entry = byTitle.get(state.title.id) ?? {
      titleId: state.title.id,
      tmdbId: state.title.tmdbId,
      title: state.title.title,
      year: state.title.year,
      seasons: [],
    };
    entry.seasons.push({
      trackedSeasonId: state.season.id,
      seasonNumber: state.season.seasonNumber,
      status: state.season.status,
      obtainedCount: state.episodes.filter((episode) => episode.obtained).length,
      latestAiredEpisode: state.season.latestAiredEpisode,
      totalEpisodes: state.season.totalEpisodes,
    });
    byTitle.set(state.title.id, entry);
  }
  const libraryTitles = [...byTitle.values()].map((title) => ({
    ...title,
    seasons: [...title.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber),
  }));
  // The notice panel shows the real notification feed, not demo copy.
  const notifications = await repository.listNotifications({ limit: 3 });
  const dashboard = dashboardStateFromTrackedSeason(trackedSeason);
  if (notifications.length > 0) {
    dashboard.events = notifications.map((notification) => ({
      title: notification.title,
      body: notification.body,
    }));
  }
  return { ...dashboard, libraryTitles };
}

function getSearchCache() {
  // Live TMDB searches are cached durably in SQLite (6h TTL) so casual
  // browsing never becomes an API storm; the demo provider stays in-memory.
  if (process.env.MEDIA_TRACK_SEARCH_PROVIDER === "tmdb") {
    durableSearchCache ??= new SqliteMediaSearchCache(getWebDatabase());
    return durableSearchCache;
  }
  demoSearchCache ??= new InMemoryMediaSearchCache();
  return demoSearchCache;
}

function getMediaSearchProvider(): MediaSearchProvider {
  if (process.env.MEDIA_TRACK_SEARCH_PROVIDER !== "tmdb") {
    return demoMediaSearchProvider;
  }
  tmdbSearchProvider ??= createTmdbSearchProviderFromEnv();
  return tmdbSearchProvider;
}
