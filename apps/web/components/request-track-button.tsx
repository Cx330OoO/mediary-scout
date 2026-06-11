"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { requestTrackingAction, type RequestTrackingActionResult } from "../app/actions";

export function RequestTrackButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RequestTrackingActionResult | null>(null);

  return (
    <div>
      <button
        className="primary-button"
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setResult(await requestTrackingAction());
          });
        }}
      >
        {isPending ? <LoaderCircle size={16} className="spin" aria-hidden /> : <Plus size={16} aria-hidden />}
        {isPending ? "请求中" : "获取"}
      </button>
      {result ? <p className="request-result">{result.message}</p> : null}
    </div>
  );
}
