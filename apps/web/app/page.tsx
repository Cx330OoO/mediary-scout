import {
  Bell,
  CheckCircle2,
  Clock3,
  Cloud,
  Film,
  Home,
  Library,
  RefreshCcw,
  Search,
  TriangleAlert,
  Wifi,
} from "lucide-react";
import { RequestTrackButton } from "../components/request-track-button";
import { getDashboardState } from "../lib/demo-workflow";

const displayLabels = {
  obtained: "已获取",
  provider_ahead: "超前",
  missing_aired: "缺集",
  unaired: "未播",
  unknown: "未知",
} as const;

export default async function Page() {
  const dashboard = await getDashboardState();
  const tracked = dashboard.trackedSeason;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Film size={18} aria-hidden />
          </span>
          <span>Media Track</span>
        </div>

        <ul className="nav-list">
          <li className="nav-item is-active">
            <Home size={16} aria-hidden />
            总览
          </li>
          <li className="nav-item">
            <Library size={16} aria-hidden />
            追踪
          </li>
          <li className="nav-item">
            <RefreshCcw size={16} aria-hidden />
            同步
          </li>
        </ul>

        <div className="sidebar-footer">
          <ul className="account-list">
            <li className="account-item">
              <Wifi size={16} aria-hidden />
              115 已连接
            </li>
            <li className="account-item">
              <Cloud size={16} aria-hidden />
              后台工作流
            </li>
          </ul>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="page-title">追踪中的资源</h1>
            <p className="page-subtitle">点击获取后，页面只显示状态；搜索、判定、转存和验证都在服务端完成。</p>
          </div>
          <div className="search-row">
            <label className="search-box">
              <Search size={16} aria-hidden />
              <input aria-label="搜索媒体" defaultValue="翘楚" />
            </label>
            <RequestTrackButton />
          </div>
        </header>

        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">
                  {tracked.title} 第 {tracked.seasonNumber} 季
                </h2>
                <p className="panel-note">
                  TMDB 最新已播 {tracked.latestAiredEpisode} / 总集数 {tracked.totalEpisodes}
                </p>
              </div>
              <span className="status-pill">
                <CheckCircle2 size={14} aria-hidden />
                正在追踪
              </span>
            </div>

            <div className="summary-strip">
              <SummaryItem label="已获取" value={tracked.obtainedCount} />
              <SummaryItem label="缺集" value={tracked.missingAiredCount} />
              <SummaryItem label="未播出" value={tracked.totalEpisodes - tracked.latestAiredEpisode} />
              <SummaryItem label="资源超前" value={tracked.providerAheadEpisodes.length} />
            </div>

            <div className="episode-grid" aria-label={`${tracked.title} episode status`}>
              {tracked.episodes.map((episode) => (
                <div className={`episode-cell ${episode.displayState}`} key={episode.episodeCode}>
                  <strong>{episode.episodeCode.replace("S01", "")}</strong>
                  <span>{displayLabels[episode.displayState]}</span>
                </div>
              ))}
            </div>
          </article>

          <aside className="side-stack">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">通知</h2>
                  <p className="panel-note">最近的工作流结果</p>
                </div>
                <Bell size={18} color="#0f766e" aria-hidden />
              </div>
              <ul className="event-list">
                {dashboard.events.map((event, index) => (
                  <li className="event-item" key={event.title}>
                    <span className="event-icon">
                      {index === 1 ? (
                        <TriangleAlert size={15} aria-hidden />
                      ) : index === 2 ? (
                        <Wifi size={15} aria-hidden />
                      ) : (
                        <CheckCircle2 size={15} aria-hidden />
                      )}
                    </span>
                    <span>
                      <span className="event-title">{event.title}</span>
                      <span className="event-body">{event.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">下一次检查</h2>
                  <p className="panel-note">缺集会进入后台恢复流程</p>
                </div>
                <Clock3 size={18} color="#b7791f" aria-hidden />
              </div>
              <div className="event-list">
                <div className="event-item">
                  <span className="event-icon">
                    <RefreshCcw size={15} aria-hidden />
                  </span>
                  <span>
                    <span className="event-title">今日 23:30</span>
                    <span className="event-body">检查 S01E13-S01E14 是否已落盘。</span>
                  </span>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="summary-item">
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
    </div>
  );
}
