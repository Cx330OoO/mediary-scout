"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { saveDailySweepTimeAction } from "../app/actions";

/**
 * Configure the time-of-day (Beijing) the daily 巡检 sweep runs. The self-hosted
 * scheduler reads this setting and fires the sweep at the chosen time.
 */
export function DailySweepForm({ initial }: { initial: string }) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);
  const [result, setResult] = useState<string | null>(null);

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveDailySweepTimeAction(value);
      setResult(res.success ? "✅ 保存成功" : `❌ ${res.message}`);
      setTimeout(() => setResult(null), 3000);
    });
  };

  return (
    <div className="push-form">
      <p className="panel-note" style={{ marginBottom: 12 }}>
        每天到这个时间（北京时间），系统会自动巡检所有追踪中的剧集，获取新播出或仍缺失的集数。
      </p>
      <div className="setting-row">
        <input
          type="time"
          className="setting-control"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="每日巡检时间"
        />
        <button type="button" className="primary-button" onClick={handleSave} disabled={isPending}>
          {isPending ? <LoaderCircle size={14} className="spin" aria-hidden /> : <Check size={14} aria-hidden />}
          保存
        </button>
      </div>
      {result ? (
        <p className="panel-note" style={{ marginTop: 10 }}>
          {result}
        </p>
      ) : null}
    </div>
  );
}
