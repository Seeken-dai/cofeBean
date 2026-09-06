# Structure-opt D — 3.0.10 Web 列表壳顶栏对齐

产品拍板（2026-09-06）；权威口径另见 box `/workspace/cofebean/list-shell-310/DEV_NOTES.md`。

## Scope

- **仅** `@media (min-width: 1100px)` 内覆盖；`<1100` 手机全屏搜索 / 顶栏语义不动。
- **不 bump** 版本号；本提交只改 `www/styles.css` + 本文档。
- **Hard keep**：`--list-card-min` / 满宽轨 / 3.0.9 多列；`has-context-detail` 详情顶栏语义；grind/brew JS 另轨。

## Changes (selectors)

| 目标 | 选择器 / 规则 |
|------|----------------|
| 顶栏垂直居中 | `@media (min-width:1100px) .topbar { align-items:center }` |
| 动作簇顶距清零 | `@media … .topbar-actions { margin-top:0 }`（全局宽屏，不只 plans） |
| 四页列表态 end-cluster | `body[data-shell-view="{beans,drinks,personal}"]:not(.has-context-detail) .topbar` → `grid-template-columns:minmax(0,1fr) auto` |
| plans 搜索右簇 | `…[plans]:not(.has-context-detail) .topbar` → `minmax(0,1fr) auto auto`；撤 `auto minmax(180px,1fr) auto` 与 search `justify-self:stretch`；search `position:static; width:min(340px,32vw); justify-self:end` + import/primary 同排 |
| drinks 右侧空白 | `body[data-shell-view="drinks"] .topbar-search { right:24px }`（与 personal 同）；有 wide-primary 的豆仓等仍默认 `right:170px` |

## QA checklist

- 宽屏 1100 / 1440：豆 / 饮 / 方案 / 我的 顶栏分割线同高
- 方案：搜索视觉靠右，与导入+新建一簇，无中间拉伸空洞
- 饮用：搜索右缘贴 24，无主按钮留白
- 豆仓：搜索仍为 primary 让位（`right:170`）
- 1099：搜索全屏行为无回归；`--list-card-min` 多列无回归

## Sibling tracks（本提交不碰）

- grind loss bug
- AI bean picker 在饮-only
