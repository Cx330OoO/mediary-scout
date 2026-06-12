import {
  createEpisodeStates,
  getTrackedSeasonStatusView,
  InMemoryWorkflowRepository,
  type EpisodeState,
  type MediaTitle,
  type TrackedSeason,
  type TrackedSeasonStatusView,
  type WorkflowRepository,
  type WorkflowRun,
} from "@media-track/workflow";

export interface DashboardState {
  trackedSeason: TrackedSeasonStatusView;
  events: Array<{
    id: string;
    kind: string;
    title: string;
    body: string;
  }>;
}

export async function getDashboardState(): Promise<DashboardState> {
  const repository = await createDemoWorkflowRepository();
  const { season } = qiaochuFixture();

  const trackedSeason = await getTrackedSeasonStatusView({
    repository,
    trackedSeasonId: season.id,
  });
  if (!trackedSeason) {
    throw new Error("Demo tracked season was not created");
  }

  return dashboardStateFromTrackedSeason(trackedSeason);
}

export async function createDemoWorkflowRepository(): Promise<InMemoryWorkflowRepository> {
  const repository = new InMemoryWorkflowRepository();
  await seedDemoWorkflowRepository(repository);
  return repository;
}

export async function seedDemoWorkflowRepository(repository: WorkflowRepository): Promise<void> {
  const { title, season } = qiaochuFixture();
  const episodes = seedEpisodes(season);
  await repository.saveWorkflowRunSnapshot({
    title,
    season,
    workflowRun: workflowRun(season),
    episodes,
    resourceSnapshots: [],
    decisions: [],
    transferAttempts: [],
    notifications: [],
  });
}

export function dashboardStateFromTrackedSeason(trackedSeason: TrackedSeasonStatusView): DashboardState {
  return {
    trackedSeason,
    events: [
      {
        id: "demo_event_obtained",
        kind: "tracking_initialized",
        title: "翘楚 S01E01-S01E12 已获取",
        body: "目标目录已验证到 12 个视频文件。",
      },
      {
        id: "demo_event_missing",
        kind: "no_coverage",
        title: "S01E13-S01E14 等待修复",
        body: "已播出但未获取，会进入后续 Type 3 检查。",
      },
      {
        id: "demo_event_health",
        kind: "already_current",
        title: "115 连接有效",
        body: "最近一次最小读验证通过。",
      },
    ],
  };
}

function qiaochuFixture(): { title: MediaTitle; season: TrackedSeason } {
  const title: MediaTitle = {
    id: "tmdb_tv_289271",
    tmdbId: 289271,
    type: "tv",
    title: "翘楚",
    originalTitle: "翘楚",
    year: 2026,
    aliases: [],
  };
  return {
    title,
    season: {
      id: "tmdb_tv_289271_s1",
      mediaTitleId: title.id,
      seasonNumber: 1,
      status: "active",
      qualityPreference: "4K",
      storageDirectoryId: "115_dir_qiaochu_s1",
      totalEpisodes: 24,
      latestAiredEpisode: 14,
      latestAiredSource: "metadata",
    },
  };
}

function seedEpisodes(season: TrackedSeason): EpisodeState[] {
  return createEpisodeStates({
    trackedSeasonId: season.id,
    seasonNumber: season.seasonNumber,
    totalEpisodes: season.totalEpisodes,
    latestAiredEpisode: season.latestAiredEpisode,
  }).map((episode) => {
    const episodeNumber = Number(episode.episodeCode.slice(-2));
    if (episodeNumber <= 12) {
      return {
        ...episode,
        obtained: true,
        verifiedFileIds: [`file_${episode.episodeCode}`],
      };
    }
    return episode;
  });
}

function workflowRun(season: TrackedSeason): WorkflowRun {
  return {
    id: "run_demo_qiaochu",
    kind: "type2_init",
    status: "succeeded",
    trackedSeasonId: season.id,
    startedAt: "2026-06-11T00:00:00.000Z",
    finishedAt: "2026-06-11T00:02:00.000Z",
    auditEvents: [],
  };
}
