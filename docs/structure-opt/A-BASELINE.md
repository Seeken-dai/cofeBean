# 工作包 A 基线证据（Structure Optimization）

编制日期：2026-09-06（Asia/Shanghai）  
分支：`chore/struct-A-baseline`  
基线 tip：`1c81a893452380ca63b128aef5529de434947602`（短 SHA `1c81a89`）  
版本：`3.0.9`（package.json，与 main 同 tip）  
范围：仅记录基线与候选清理表；无版本 bump、无功能 CSS 删除/改写。

## 1. 源码字节规模（基线 tip）

| 路径 | 字节（bytes） | 备注 |
|---|---:|---|
| `www/styles.css` | 287165 | ~287 KB；计划所述量级一致 |
| `www/app.js` | 298446 | ~298 KB |
| `www/app-shell.js` | 16396 | ~16 KB |
| `www/vendor/`（合计） | 28987407 | ~29 MB；含二维码与 MediaPipe 等，非 APK 压缩体积 |

三份主源合计：602007 bytes；vendor 另计。未在本基线中测量 APK。

## 2. 测试与 lint 基线

命令等价于 package scripts test / lint（本机以 `node --test tests/*.test.js` 与 eslint 二进制执行）。

| 检查 | 结果 | 摘要 |
|---|---|---|
| JS 测试 | **FAIL（预存 1）** | 328 tests；**327 pass / 1 fail**；duration ~0.4–0.5s |
| lint（eslint） | **PASS** | exit 0；无报错输出 |

### 预存失败（不得靠删测试修绿）

- **用例标题**：真机验收修正保持底部面板、精简我的并吸顶豆子详情
- **位置**：`tests/app-shell.test.js:188`
- **现象**：`www/styles.css` 未匹配预期 `.assist-ring strong { line-height:1.14; padding-bottom:.08em; }` 结构断言
- **归因**：基线 tip `1c81a89` / 3.0.9 已存在；非本工作包引入。后续不得通过删除或放宽该失败用例伪装通过。

## 3. 硬性禁改（Hard ban）

- **禁止**改动 3.0.9 宽屏轨：`--list-card-min` 及依赖它的 auto-fill / full-bleed 列表多列规则（约 `www/styles.css` 3216+）
- **禁止**以 Coverage 单页未命中为依据直接删全局 CSS
- 候选表项仅为候选；本提交**不删除**任何声明

## 4. 候选清理表（seed；未执行删除）

列定义来自 STRUCTURE_OPTIMIZATION_PLAN 工作包 A。

| 文件/符号 | 入口引用 | 动态引用风险 | 拟删除原因（候选） | 影响场景 | 验证方法 | 回退 |
|---|---|---|---|---|---|---|
| `styles.css` `.bean-card` min-height 112px（~L131 基础；~L1631–1632 主题再声明 112px） | 豆仓列表豆卡；主题/纸面覆写块 | 低（静态）；主题/断点可能仍依赖层叠 | 后续 ~L2750 抬到 **131px**；同条件无媒体查询下 112px 可能被覆盖；需逐属性对照后再删 | 豆仓：有图/无图、长豆名、选中/按压 | 360/390 截图+量高；主题切换 | 回退该组件提交 |
| `styles.css` `.bean-card` box-shadow 链（~L131 硬阴影 → ~L1636 `--shadow-soft` → ~L2754 none） | 同上 | 低；确认最终 none 是否全主题成立 | 阴影被覆盖两次；仅清理确定失效的中间/基础声明 | 卡片层级；深浅主题；photo-journal | 视觉对照阴影；勿误伤其它卡 | 回退该组件提交 |
| `styles.css` `.bean-card` border/background 重复（~L131 → ~L1633–1635 vault → ~L2751–2753 再 vault） | 同上 | 低；`.is-archived` / `.is-selected` 可能依赖基础边框语义 | 同条件重复边框色与背景；仅当适用条件完全重合才可收敛 | 归档虚线、选中 inset、纸面主题 | 归档/选中/默认三态截图 | 回退该组件提交 |
| `styles.css` `.bean-card.has-thumb` 栅格（~L135 `4px auto 1fr` → ~L1639 minmax → ~L2747–2749 `102px`） | 有缩略图豆卡 | 中：宽屏 ~L3265 `88px`；context-detail 更窄 | 窄屏最终 102px 轨；前序可能失效，但宽屏/详情轨不同，**不可整段删** | 有图豆卡；1099/1100；`has-context-detail` | 断点矩阵+详情分栏 | 回退该组件提交 |
| （占位）宽屏 `minmax(280px)`（~L1915）vs `--list-card-min:300px`（~L3218） | 宽屏列表多列 | **高 / 禁改区相邻** | 仅记录并存；**不得**触碰 `--list-card-min` / full-bleed rails | 宽屏豆/饮/方案列表 | 1100/1440 列数 | N/A（本轮不改） |

行号相对 tip `1c81a89`；实施时以当前内容为准。

## 5. 截图 / 视觉基线矩阵（测试与视觉负责；本包未宣称已完成）

**本工作包 A 文档不包含、也不宣称已完成任何截图。** 计划要求的矩阵：

### 视口宽度（CSS px）

360、390、768、1099、1100、1440  

原生端另加：竖屏、横屏、键盘弹出、系统返回。

### 页面 / 表面

- beans（豆仓）
- drinks（饮用记录）
- plans（方案）
- profile（个人页）
- settings（设置）
- calendar（日历）
- related dialogs（详情、导入、分享、设置类等主要状态）

### 主题

至少：默认主题 + 差异最大的浅色、深色；颜色变量改动时扩展全部主题。

### 约束

同设备、同浏览器版本、同脱敏数据、同字体加载状态；动画稳定后截图。视觉签收不能替代交互测试；Web 预览不能替代 Android 真机与 SQLite 升级测试。

## 6. 脱敏验收数据（待测试准备；本提交仅登记）

空仓、少量记录、大量记录、长文本、缺图、自制和外饮、带历史字段的备份。Mock 仅用于独立测试环境。本提交不附带真实用户数据。

## 7. 下一步（非本提交）

1. 测试/视觉：按 §5 建立可复现截图基线并签收。
2. 工作包 B：按候选表对豆卡做逐属性覆盖分析；仍禁止触碰 `--list-card-min` / full-bleed。
3. 预存 `assist-ring` 测试失败单独立项，不与 CSS 清理混修。
