"use client";

import { Check, ChevronDown, LoaderCircle, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import {
  requestRemainingAction,
  requestSeasonAction,
  type RequestTrackingActionResult,
} from "../app/actions";

/**
 * Acquisition entry for an untracked tv title on a search card.
 * Single season: one 获取 button. Multiple seasons: 获取所有季 plus a
 * season-picker dropdown for grabbing one specific season.
 */
export function SeasonRequestMenu({
  tmdbId,
  seasonNumbers,
}: {
  tmdbId: number;
  seasonNumbers: number[];
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RequestTrackingActionResult | null>(null);
  const isLocked =
    result?.status === "requested" ||
    result?.status === "already_tracked" ||
    result?.status === "active_workflow";

  if (isLocked) {
    return (
      <span className="hub-badge tone-green" title={result?.message}>
        <Check size={12} aria-hidden />
        已请求
      </span>
    );
  }

  const requestAll = () => {
    startTransition(async () => {
      setOpen(false);
      setResult(await requestRemainingAction({ tmdbId }));
    });
  };

  const requestSeason = (seasonNumber: number) => {
    startTransition(async () => {
      setOpen(false);
      setResult(await requestSeasonAction({ tmdbId, seasonNumber }));
    });
  };

  if (seasonNumbers.length <= 1) {
    const onlySeason = seasonNumbers[0] ?? 1;
    return (
      <button
        className="primary-button"
        type="button"
        disabled={isPending}
        onClick={() => requestSeason(onlySeason)}
      >
        {isPending ? <LoaderCircle size={14} className="spin" aria-hidden /> : <Plus size={14} aria-hidden />}
        获取
      </button>
    );
  }

  return (
    <div className="season-menu">
      <button className="primary-button" type="button" disabled={isPending} onClick={requestAll}>
        {isPending ? <LoaderCircle size={14} className="spin" aria-hidden /> : <Plus size={14} aria-hidden />}
        获取所有季
      </button>
      <button
        className="season-menu-toggle"
        type="button"
        aria-label="选择要获取的季"
        disabled={isPending}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <ul className="season-menu-list" role="menu">
          {seasonNumbers.map((seasonNumber) => (
            <li key={seasonNumber} role="none">
              <button role="menuitem" type="button" onClick={() => requestSeason(seasonNumber)}>
                第 {seasonNumber} 季
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
