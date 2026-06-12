import type {
  EpisodeState,
  MediaTitle,
  TrackedSeason,
  WorkflowKind,
  WorkflowRun,
} from "./domain.js";
import type { AgentNodes, ResourceProvider, StorageExecutor } from "./ports.js";
import type { WorkflowRepository } from "./repository.js";
import {
  runSeriesInitialization,
  runType2Initialization,
  runType3Monitoring,
  type AcquisitionSeasonScope,
  type SeriesInitializationResult,
  type WorkflowResult,
} from "./workflow.js";

export interface WorkflowRunMetadata {
  id: string;
  startedAt: string;
  finishedAt: string | null;
}

export async function runType2InitializationAndPersist(input: {
  title: MediaTitle;
  season: TrackedSeason;
  keyword: string;
  resourceProvider: ResourceProvider;
  storage: StorageExecutor;
  agents: AgentNodes;
  repository: WorkflowRepository;
  workflowRun: WorkflowRunMetadata;
  storageParentDirectoryId?: string;
}): Promise<WorkflowResult> {
  const result = await runType2Initialization({
    title: input.title,
    season: input.season,
    keyword: input.keyword,
    resourceProvider: input.resourceProvider,
    storage: input.storage,
    agents: input.agents,
    workflowRunId: input.workflowRun.id,
    ...(input.storageParentDirectoryId === undefined
      ? {}
      : { storageParentDirectoryId: input.storageParentDirectoryId }),
  });

  await persistWorkflowResult({
    title: input.title,
    season: result.season,
    workflowRun: toWorkflowRun("type2_init", input.season.id, input.workflowRun, result),
    result,
    repository: input.repository,
  });

  return result;
}

export async function runType3MonitoringAndPersist(input: {
  title: MediaTitle;
  season: TrackedSeason;
  episodes: EpisodeState[];
  keyword: string;
  resourceProvider: ResourceProvider;
  storage: StorageExecutor;
  agents: AgentNodes;
  repository: WorkflowRepository;
  workflowRun: WorkflowRunMetadata;
  storageParentDirectoryId?: string;
}): Promise<WorkflowResult> {
  const result = await runType3Monitoring({
    title: input.title,
    season: input.season,
    episodes: input.episodes,
    keyword: input.keyword,
    resourceProvider: input.resourceProvider,
    storage: input.storage,
    agents: input.agents,
    workflowRunId: input.workflowRun.id,
    ...(input.storageParentDirectoryId === undefined
      ? {}
      : { storageParentDirectoryId: input.storageParentDirectoryId }),
  });

  await persistWorkflowResult({
    title: input.title,
    season: result.season,
    workflowRun: toWorkflowRun("type3_monitor", input.season.id, input.workflowRun, result),
    result,
    repository: input.repository,
  });

  return result;
}

async function persistWorkflowResult(input: {
  title: MediaTitle;
  season: TrackedSeason;
  workflowRun: WorkflowRun;
  result: WorkflowResult;
  repository: WorkflowRepository;
}): Promise<void> {
  await input.repository.saveWorkflowRunSnapshot({
    title: input.title,
    season: input.season,
    workflowRun: input.workflowRun,
    episodes: input.result.episodes,
    resourceSnapshots: input.result.resourceSnapshots,
    decisions: input.result.decisions,
    transferAttempts: input.result.transferAttempts,
    notifications: input.result.notifications,
  });
}

function toWorkflowRun(
  kind: WorkflowKind,
  trackedSeasonId: string,
  metadata: WorkflowRunMetadata,
  result: WorkflowResult,
): WorkflowRun {
  return {
    id: metadata.id,
    kind,
    status: result.status,
    trackedSeasonId,
    startedAt: metadata.startedAt,
    finishedAt: metadata.finishedAt,
    auditEvents: result.auditEvents,
  };
}

export async function runSeriesInitializationAndPersist(input: {
  title: MediaTitle;
  seasons: AcquisitionSeasonScope[];
  keyword: string;
  storageParentDirectoryId: string;
  resourceProvider: ResourceProvider;
  storage: StorageExecutor;
  agents: AgentNodes;
  repository: WorkflowRepository;
  workflowRun: WorkflowRunMetadata;
  qualityPreference?: string;
  maxPlanningPasses?: number;
}): Promise<SeriesInitializationResult> {
  const result = await runSeriesInitialization({
    title: input.title,
    seasons: input.seasons,
    keyword: input.keyword,
    storageParentDirectoryId: input.storageParentDirectoryId,
    resourceProvider: input.resourceProvider,
    storage: input.storage,
    agents: input.agents,
    workflowRunId: input.workflowRun.id,
    ...(input.qualityPreference === undefined ? {} : { qualityPreference: input.qualityPreference }),
    ...(input.maxPlanningPasses === undefined ? {} : { maxPlanningPasses: input.maxPlanningPasses }),
  });

  for (const [index, seasonResult] of result.seasons.entries()) {
    const seasonRunId = `${input.workflowRun.id}_s${seasonResult.season.seasonNumber}`;
    await input.repository.saveWorkflowRunSnapshot({
      title: input.title,
      season: seasonResult.season,
      workflowRun: {
        id: seasonRunId,
        kind: "type1_package_init",
        status: result.status,
        trackedSeasonId: seasonResult.season.id,
        startedAt: input.workflowRun.startedAt,
        finishedAt: input.workflowRun.finishedAt,
        auditEvents: result.auditEvents,
      },
      episodes: seasonResult.episodes,
      // Resource evidence is attached once (first season) to avoid duplicating
      // snapshots/decisions across N season records.
      resourceSnapshots: index === 0 ? result.resourceSnapshots : [],
      decisions: index === 0 ? result.decisions : [],
      transferAttempts:
        index === 0
          ? result.transferAttempts.map((attempt) => ({ ...attempt, workflowRunId: seasonRunId }))
          : [],
      // The series notification is title-level: one feed entry per series
      // run, not one per season record. It rides on the first season only,
      // like the resource evidence.
      notifications:
        index === 0
          ? [
              {
                ...result.notification,
                id: `notification_${seasonRunId}`,
                workflowRunId: seasonRunId,
              },
            ]
          : [],
    });
  }

  return result;
}
