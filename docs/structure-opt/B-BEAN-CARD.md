# 工作包 B：豆卡 CSS 覆盖整理（bean card only）

编制日期：2026-09-06（Asia/Shanghai）  
分支：`chore/struct-B-bean-card`  
基线 tip：`1c81a89`（3.0.9）  
范围：**仅** `www/styles.css` 中 `.bean-card` / `.bean-card.has-thumb` 铬层（高度、网格轨、边框色、背景、阴影、:active 缩放、动画时序）。  
未改：JS / HTML / SW、版本号、饮用/方案卡、底栏、个人页、`--list-card-min` / `--list-gap`、宽屏 full-bleed / auto-fill 多列轨。

## 1. 覆盖链审计（同条件有效值）

选择器优先级均为 class 级；无 `!important` 参与本批豆卡铬层竞争。

### 1.1 窄屏默认（无 media / 非 context-detail）

| 属性 | 原 L131 | 原 ~L1631 | 原 ~L2747 | **有效值（整理后写入 base）** |
|---|---|---|---|---|
| `grid-template-columns` | `4px 1fr` | （未改 `.bean-card`） | `102px minmax(0,1fr)` | **`102px minmax(0,1fr)`** |
| `.has-thumb` grid | `4px auto 1fr` | `4px auto minmax(0,1fr)` | 同上 102px 轨 | **同 base（已无独立早/中期 has-thumb 轨）** |
| `min-height` | `112px` | `112px`（复述） | `131px` | **`131px`** |
| `border-color` | `color-mix(...border 78%...)` | `var(--vault-line)`（等价别名） | `var(--vault-line)` | **`var(--vault-line)`**（`:root` 中 `--vault-line` ≡ 原 mix） |
| `border-radius` | `var(--radius-card)` | 同值复述 | 同值复述 | **`var(--radius-card)`** |
| `background` | `var(--surface)` | `var(--vault-paper)`（=`var(--surface)`） | 同 vault-paper | **`var(--vault-paper)`** |
| `box-shadow` | `0 5px 18px …` | `var(--shadow-soft)` | `none` | **`none`** |
| `animation` timing | `var(--ease-spring)` | `animation-timing-function: cubic-bezier(.22,.72,.24,1)` | — | **写入 shorthand：`cubic-bezier(.22,.72,.24,1)`** |
| `:active transform` | `scale(.988)` | `scale(.992)` | — | **`scale(.992)`**（保留 `border-color:var(--accent)`） |

### 1.2 `@media (min-width:1100px)` 列表态

| 属性 | 原中段 | 原后段（保留） | 判定 |
|---|---|---|---|
| `min-height` | `104px`（已删） | `118px`（`.bean-card,.bean-card.has-thumb`） | **104px 同 media、同选择器族下被后写覆盖 → 已删** |
| grid | — | `88px minmax(0,1fr)` | **保留** |

### 1.3 `@media (min-width:1100px)` + `body.has-context-detail`

| 属性 | 原中段 | 原后段（保留） | 判定 |
|---|---|---|---|
| `min-height` | `86px`（已删） | `66px` | **同条件后写覆盖 → 已删** |
| `border-radius` | `var(--radius-card)` 复述（随 86 规则已删） | 后段仍带 radius | **保留后段** |
| grid | — | `54px minmax(0,1fr)` | **保留** |

### 1.4 `@media (max-width:420px)`

| 属性 | 规则 | 判定 |
|---|---|---|
| grid | `92px minmax(0,1fr)` | **保留**（断点覆盖 base 102px） |

## 2. 已删除 / 已吸收声明摘要

1. **Base 重写**：`.bean-card` 直接承载上表窄屏有效值（含 102px 轨、131px、vault 边框/纸面、`box-shadow:none`、动画时序、`:active` `.992`）。
2. **删除** `.bean-card.has-thumb { grid-template-columns:4px auto 1fr; }`（早）与 `4px auto minmax(0,1fr)`（中）——同全局条件被 102px 轨覆盖。
3. **删除** ~L1631 `.bean-card { min-height:112px; border-*; background; box-shadow:var(--shadow-soft); animation-timing-function… }`——112/边框/背景/软阴影均被后写或等价吸收；时序并入 base animation。
4. **删除** 中段 `.bean-card:active { transform:scale(.992); }`（已并入早段 :active）。
5. **删除** 宽屏 `.bean-card { min-height:104px; }`（同 `@media (min-width:1100px)` 下后写 118px）。
6. **删除** `body.has-context-detail .bean-card { min-height:86px; border-radius… }`（同宽屏 media 下后写 66px）。
7. **删除** 晚段 `.bean-card,.bean-card.has-thumb { 102px / 131px / vault / shadow:none }` 中的 **grid / min-height / border-radius**（已写入 base）。
8. **保留 / 恢复（cascade）**：晚段 `.bean-card.has-thumb { border-color:var(--vault-line); background:var(--vault-paper); box-shadow:none; }` 必须留在 `.bean-card.is-selected` **之后**（同特异性 0,2,0，靠源序胜出），否则 context-detail 已选中的 has-thumb 中列卡会露出 is-selected 铬层（accent 边 / vault-active-soft / inset 左轨），与 A 像素不一致。详见 §2.1。

**未删（不确定或不同条件）**

- **晚段 `.bean-card.has-thumb` 铬层复位**（background / border-color / box-shadow）——**keep-for-cascade**，见 §2.1；勿再并入 base 或挪到 `is-selected` 之前。
- `.bean-thumb*` / `.card-body` / `.bean-list` gap 等相邻规则（本批只收豆卡选择器铬层；thumb 尺寸链仍多段覆盖，留给后续若有明确证据再收）。
- `.bean-card.is-archived`、status/tag、`.bean-card-actions`。
- 宽屏 `.bean-card.is-selected`（与 drink/plan 共享，且为本批禁改饮用/方案相邻语义）。
- `--list-card-min` / `--list-gap` / auto-fill rails / `minmax(280px)` 列表轨。
- `status-rail` 样式（HTML 未见节点，但非本批「同条件死覆盖」证据链，**保留**）。

## 2.1 级联保留说明（QA FAIL 修复）

宽屏 `@media (min-width:1100px)` 内 `.bean-card.is-selected` 与全局晚段 `.bean-card.has-thumb` 同为 (0,2,0)。A 中晚段 has-thumb 在 `is-selected` **之后**，因此 **selected + has-thumb** 卡（context-detail 中列常见）被复位为 vault-paper / vault-line / `box-shadow:none`，选中铬层被压制。

B 初版把晚段整块并入 base 后删掉晚段 → `is-selected` 胜出 → detail-bean 已选中卡与 A 像素不一致（list 各断点仍 PASS）。

修复：在 `.bean-list { gap:10px; }` 之后恢复晚段 chrome-only 规则（不恢复已并入 base 的 102px/131px 轨），**不加 `!important`**，仅靠源序复现 A 级联。

## 3. Hard ban 核对

| 禁改项 | 结果 |
|---|---|
| `--list-card-min` / `--list-gap` | **未改**（仍约 L3197–3198） |
| 宽屏 multi-col / full-bleed / overview `max-width:none` / auto-fill | **未改** |
| drinks / plans 卡、底栏、个人页 | **未改**（未动其独立规则；shared `is-selected` 整条保留） |
| JS / HTML / SW / 版本 bump | **未改** |

## 4. 字节与验证

| 项 | 值 |
|---|---|
| `www/styles.css` before | 287165 bytes（A 基线） |
| `www/styles.css` after | 见本分支 tip（初版 286468 / Δ −697；cascade 修复后再增晚段 has-thumb chrome） |
| 预期视觉 | 与 A 截图同数据对比：窄屏豆卡 131px / 102px 轨；≤420→92px；≥1100→88px/118px；context-detail→54px/66px；无阴影默认卡 |

测试 / lint：见 PR 说明与本提交验证记录（预存 `assist-ring` 失败不得删测试修绿）。

## 5. 回退

`git revert` 本分支豆卡 CSS + 本文档提交即可；不与其它组件清理捆绑。
