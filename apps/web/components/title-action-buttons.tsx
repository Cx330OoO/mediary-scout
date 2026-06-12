"use client";

import { Check, DownloadCloud, Layers, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  requestRemainingAction,
  requestSeasonAction,
  type RequestTrackingActionResult,
} from "../app/actions";

export function RequestSeasonButton({
  tmdbId,
  seasonNumber,
}: {
  tmdbId: number;
  seasonNumber: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RequestTrackingActionResult | null>(null);
  const isLocked =
    result?.status === "requested" ||
    result?.status === "already_tracked" ||
    result?.status === "active_workflow";

  return (
    <button
      className="season-request-button"
      type="button"
      title={result?.message ?? `获取第 ${seasonNumber} 季`}
      disabled={isPending || isLocked}
      onClick={() => {
        startTransition(async () => {
          setResult(await requestSeasonAction({ tmdbId, seasonNumber }));
          router.refresh();
        });
      }}
    >
      {isPending ? (
        <LoaderCircle size={13} className="spin" aria-hidden />
      ) : isLocked ? (
        <Check size={13} aria-hidden />
      ) : (
        <DownloadCloud size={13} aria-hidden />
      )}
      {isLocked ? "已请求" : "获取本季"}
    </button>
  );
}

export function RequestRemainingButton({
  tmdbId,
  label,
}: {
  tmdbId: number;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RequestTrackingActionResult | null>(null);
  const isLocked =
    result?.status === "requested" ||
    result?.status === "already_tracked" ||
    result?.status === "active_workflow";

  return (
    <button
      className="primary-button"
      type="button"
      title={result?.message ?? label}
      disabled={isPending || isLocked}
      onClick={() => {
        startTransition(async () => {
          setResult(await requestRemainingAction({ tmdbId }));
          router.refresh();
        });
      }}
    >
      {isPending ? (
        <LoaderCircle size={14} className="spin" aria-hidden />
      ) : isLocked ? (
        <Check size={14} aria-hidden />
      ) : (
        <Layers size={14} aria-hidden />
      )}
      {isLocked ? "已请求" : label}
    </button>
  );
}
