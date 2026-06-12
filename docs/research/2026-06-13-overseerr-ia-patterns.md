# Overseerr/Jellyseerr IA 范式调研（2026-06-13）

> 源码级验证（sct/overseerr，MIT；Jellyseerr 为其活跃维护 fork，同 IA）。
> 直接驱动 media-track 的页面结构。

## 核心结论

1. **单一规范标题页**：`/tv/[id]` 一条路由，搜索/发现/库全部入口都汇聚到它。
   季**不是**独立页面，是标题页内联的折叠列表（Disclosure accordion，新季在前）。
2. **海报墙**：`grid-template-columns: repeat(auto-fill, minmax(9.375rem,1fr))`，2:3 海报
   （paddingBottom:150%），hover scale-105。卡片右上角 **StatusBadgeMini** 圆形小徽章
   是"已在库"的全部标识；hover 出渐变遮罩（年份/标题/简介截断）+ 仅未请求时显示 Request 按钮。
3. **状态模型（按季存储，标题级聚合派生）**：
   | 状态 | 颜色 | mini 图标 |
   |---|---|---|
   | 未请求 | 无徽章 | — |
   | Requested/Processing | indigo-500 | 时钟 |
   | Partially Available | green-500 | "–" |
   | Available | green-500 | ✓ |
   徽章样式：`px-2 text-xs font-semibold rounded-full`，bg 同色 80% 透明 + 同色边。
4. **标题详情页布局**：全幅 backdrop hero（渐变溶入页面底色）→ media-header（海报 w-52 +
   状态徽章行 + h1 "Name (Year)" + 属性行"5 Seasons | 类型"+ 右侧动作区
   Play/Request 分裂按钮）→ 两栏（左 overview + 季列表；右 facts 卡）。
   季行：左"Season 4"+"10 Episodes"暗 pill，右per-季状态徽章；展开懒加载集列表（无请求控件）。
5. **搜索结果 = 同一 TitleCard 网格**：已在库的结果只是右上角多个 mini 徽章 + 失去
   Request 按钮，点击进同一标题页。没有任何额外文案。
6. **请求流**：RequestButton 按状态变标签（Request / **Request More**（部分已有）/
   View Request）；TvRequestModal = 季 toggle 表（已有季预选锁定 50% 透明只能加不能减），
   主按钮即状态机："Select Season(s)"→"Request 2 Seasons"（实时计数）→"Already Requested"。
7. Ombi 可偷的点子：**"All Seasons / Latest Season / First Season" 快捷按钮**、
   分段季进度条（绿=已有/琥珀=请求中）。

## media-track 映射（v1 决策）

- 媒体库 tab = 海报墙；右上角 mini 徽章：绿✓ 全部入库 / 绿– 部分 / 靛·时钟 追更中 / 无 = 未追踪。
- `/show/[tmdbId]` 标题页：backdrop hero + 海报 + 状态徽章 + overview + 季行列表
  （per-季徽章 + 进度 x/y + 未追踪季行内"获取本季"按钮）+ 顶部"获取全剧/获取剩余"主按钮
  （Overseerr 的 "Request More" 语义）。v1 用行内按钮替代 toggle-modal，后续可升级。
- 搜索结果卡 = 同一卡组件 + 徽章，链接同一标题页。
- 颜色语义沿用：绿=已有，靛=进行中，黄=等待——这类产品用户的既有心智。

来源：github.com/sct/overseerr `src/components/TitleCard|TvDetails|RequestModal|Common/*`、
`server/constants/media.ts`、`src/styles/globals.css`；github.com/fallenbagel/jellyseerr；
github.com/Ombi-app/Ombi `tv-request-grid`。
