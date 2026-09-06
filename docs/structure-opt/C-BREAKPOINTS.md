# 工作包 C：响应式断点统一（breakpoints）

编制日期：2026-09-06（Asia/Shanghai）  
分支：`chore/struct-C-breakpoints`  
范围：统一 JS 中的 `1100` 硬编码到 `AppShell` 断点常量/语义方法；**不**引入打包器；CSS 保持静态 `@media`。

## 1. 核心契约：两个不同判断

| 判断 | 含义 | API | 原生 Android |
|---|---|---|---|
| **视口 ≥ 1100** | 仅宽度是否达到断点（CSS / shell layout / 弹层手势） | `AppShell.WIDE_BREAKPOINT`、`layoutForWidth`、`isWideViewport`、`wideMediaQuery()` | 横竖屏宽度仍可算出 `wide`，只表示视口 |
| **启用 Web 工作台** | 宽屏 Web 侧栏/内嵌个人区等桌面工作台行为 | `AppShell.shouldEnableWebWorkbench({ isNative, width|matchesWide })`；`app.js` 的 `isWideWorkspace()` | **始终 false**（保留 `!isNativeApp()` / `isNative: true`） |

**产品钉死：**

1. **1099 ↔ 1100 动态切换**必须正确（resize / `matchMedia("change")`）。
2. Android 横竖屏继续走原生壳：大屏平板或横屏 **不得**误切 Web 工作台。
3. 「视口 ≥ 1100」**≠**「启用 Web 工作台」。

## 2. 改动摘要

### `www/app-shell.js`

- 保留 `WIDE_BREAKPOINT = 1100` 与 `layoutForWidth`。
- 新增：
  - `isWideViewport(width)`
  - `wideMediaQuery()` → `(min-width: 1100px)`
  - `shouldEnableWebWorkbench({ isNative, width | matchesWide })` — 原生恒为 false

### `www/app.js`

- `isWideViewportNow()`：只问视口（优先 `AppShell.wideMediaQuery()` + `matchMedia`）。
- `isWideWorkspace()`：经 `shouldEnableWebWorkbench`，**必须**带 `isNativeApp()`。
- 底栏 sheet 拖动手势：用 `AppShell.isWideViewport(innerWidth)`（视口判断，非工作台）。
- `matchMedia` 监听：查询串来自 `AppShell.wideMediaQuery()`。
- 无 AppShell 时保留字面量 fallback（防御性，正常页面必加载 app-shell）。

### `www/styles.css`

- **未改**。静态 `@media (min-width:1100px)` / `(max-width:1099px)` 保留。
- 契约测试：CSS 中的 1100 / 1099 与 `AppShell.WIDE_BREAKPOINT` 对齐。

### 测试

- `tests/app-shell.test.js`：边界 1099/1100、原生禁工作台、CSS 契约、`app.js` 接线。
- **未删除**既有失败项（如 assist-ring 断言）；不为变绿删测试。

## 3. 硬编码 1100 用途标注

- app-shell WIDE_BREAKPOINT: 唯一断点源（视口）
- app.js isWideWorkspace matchMedia: Web 工作台 → AppShell + !isNative
- app.js sheet innerWidth>=1100: 视口 → isWideViewport
- app.js matchMedia change: 视口变化监听 → wideMediaQuery()
- styles.css @media: 静态视口查询，不变 + 契约测试

## 4. 验收清单

- 浏览器 1099/1100 两侧拖动：导航、导入按钮、个人页、弹层手势即时切换
- Android 横竖屏/平板宽屏：仍为原生底栏壳，不误切 Web 工作台
- lint + app-shell 相关测试新增断言通过；不删 assist-ring 失败用例
- 不 bump versionName/versionCode；不打 APK/tag/Release
- 不回归 3.0.9 list-card-min / full-bleed

## 5. 非目标

- 不引入 bundler / CSS-in-JS / 共享 CSS 变量打包桥
- 不合并 resize 与 matchMedia（shell setLayout vs 业务 FAB/个人页职责不同）
