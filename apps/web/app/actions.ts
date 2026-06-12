"use server";

import { revalidatePath } from "next/cache";
import { queueCandidateSeries, queueCandidateTracking } from "../lib/workflow-runtime";

export interface RequestTrackingActionResult {
  status: "requested" | "already_tracked" | "active_workflow" | "unsupported";
  message: string;
}

export async function requestTrackingAction(input?: {
  candidateId?: string;
  currentState?: "can_request" | "already_tracked" | "active_workflow";
}): Promise<RequestTrackingActionResult> {
  if (input?.currentState === "already_tracked") {
    return {
      status: "already_tracked",
      message: "已追踪，后台会继续按缺集状态检查。",
    };
  }

  if (input?.currentState === "active_workflow") {
    return {
      status: "active_workflow",
      message: "获取任务已在运行中，不会重复创建。",
    };
  }

  if (input?.candidateId) {
    const request = await queueCandidateTracking(input.candidateId);
    if (request.status === "already_tracked") {
      return {
        status: "already_tracked",
        message: "已追踪，后台会继续按缺集状态检查。",
      };
    }
    if (request.status === "already_running") {
      return {
        status: "active_workflow",
        message: "获取任务已在运行中，不会重复创建。",
      };
    }
    if (request.status === "unsupported") {
      return {
        status: "unsupported",
        message: request.message,
      };
    }

    revalidatePath("/");
    return {
      status: "requested",
      message: "已加入后台队列，完成后会通知你。",
    };
  }

  return {
    status: "requested",
    message: "已收到获取请求。",
  };
}

export async function requestSeriesAction(input: {
  candidateId: string;
}): Promise<RequestTrackingActionResult> {
  const request = await queueCandidateSeries(input.candidateId);
  if (request.status === "already_tracked") {
    return { status: "already_tracked", message: "全剧已追踪，后台会继续按缺集状态检查。" };
  }
  if (request.status === "already_running") {
    return { status: "active_workflow", message: "全剧获取任务已在运行中。" };
  }
  if (request.status === "unsupported") {
    return { status: "unsupported", message: request.message };
  }
  revalidatePath("/");
  return { status: "requested", message: "全剧获取已加入后台队列。" };
}

export interface ForeignWorkImportActionResult {
  status: "imported" | "failed";
  message: string;
}

export async function importForeignWorkAction(input: {
  providerFileIds: string[];
  movieTitle: string;
  year: number;
}): Promise<ForeignWorkImportActionResult> {
  const movieTitle = input.movieTitle.trim();
  const year = Number(input.year);
  if (!movieTitle || !Number.isInteger(year) || year < 1880 || year > 2100) {
    return { status: "failed", message: "请填写有效的电影名称与年份。" };
  }
  if (input.providerFileIds.length === 0) {
    return { status: "failed", message: "没有可入库的文件。" };
  }
  try {
    const { importForeignWorkFiles } = await import("../lib/workflow-runtime");
    const result = await importForeignWorkFiles({
      providerFileIds: input.providerFileIds,
      movieTitle,
      year,
    });
    revalidatePath("/notifications");
    return {
      status: "imported",
      message: `已入库到 ${movieTitle} (${year})${result.renamedTo ? `，并重命名为 ${result.renamedTo}` : ""}。`,
    };
  } catch (error) {
    return { status: "failed", message: `入库失败：${String(error)}` };
  }
}

export async function requestSeasonAction(input: {
  tmdbId: number;
  seasonNumber: number;
}): Promise<RequestTrackingActionResult> {
  const { queueSeasonTracking } = await import("../lib/title-hub");
  const request = await queueSeasonTracking(input.tmdbId, input.seasonNumber);
  if (request.status === "already_tracked") {
    return { status: "already_tracked", message: "本季已追踪。" };
  }
  if (request.status === "already_running") {
    return { status: "active_workflow", message: "本季获取任务已在运行中。" };
  }
  if (request.status === "unsupported") {
    return { status: "unsupported", message: request.message };
  }
  revalidatePath(`/show/${input.tmdbId}`);
  revalidatePath("/");
  return { status: "requested", message: `第 ${input.seasonNumber} 季已加入后台队列。` };
}

export async function requestRemainingAction(input: {
  tmdbId: number;
}): Promise<RequestTrackingActionResult> {
  const { queueRemainingSeasons } = await import("../lib/title-hub");
  const request = await queueRemainingSeasons(input.tmdbId);
  if (request.status === "already_tracked") {
    return { status: "already_tracked", message: "所有季都已在追踪。" };
  }
  if (request.status === "already_running") {
    return { status: "active_workflow", message: "获取任务已在运行中。" };
  }
  if (request.status === "unsupported") {
    return { status: "unsupported", message: request.message };
  }
  revalidatePath(`/show/${input.tmdbId}`);
  revalidatePath("/");
  return { status: "requested", message: "剩余季已加入后台队列。" };
}
