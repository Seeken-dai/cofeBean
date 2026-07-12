# AGENTS.md

## 项目背景

- 豆仓 Coffee Vault 是本地优先的个人咖啡豆管理 App，含 Android 与 Web 两端：默认完全离线、本地存储；同步线（2.0.0）提供可选的跨设备云同步（默认关闭、登录后启用）。1.x 本地优先线作为独立 `release/1.x-local-first` 分支继续维护，不联网、便于免备案分发。
- 当前版本为 `2.2.7`，Android `versionCode 55`，正式产物路径为 `dist/coffee-vault-2.2.7-release.apk`。
- 正式数据保存在应用私有 SQLite 数据库；Web 预览只用于开发，不代表真实设备存储行为。
- 默认离线使用不需要账号、网络、相册或存储权限；拍照识别只应申请相机权限。同步线的 Android 版本如接入云同步，需要新增 `INTERNET` 权限并在阶段 5 真机验证。
- 数据安全优先于功能速度：导入失败必须回滚，数据库升级必须保留旧数据。

## 技术栈

- 前端：原生 HTML/CSS/JavaScript，入口在 `www/`。
- Android 壳：Capacitor 8，包名 `com.coffeebean.vault`。
- 本地数据库：`@capacitor-community/sqlite`，迁移逻辑在 `www/repository.js`。
- 原生能力：Camera、Filesystem、Share、StatusBar、SplashScreen、FilePicker，以及 Android 侧自定义 OCR 插件。
- 测试：Node.js 内置 `node:test`。

## 项目结构

- `www/index.html`：页面结构和对话框骨架。
- `www/styles.css`：全部界面样式和主题。
- `www/app.js`：界面状态、交互、渲染和 Capacitor 插件调用。
- `www/app-format.js`：从 app.js 拆出的无状态格式化/解析工具(拆分第一批);新拆文件要同步 `index.html`、`sw.js` SHELL 与 `eslint.config.mjs` 全局名,`tests/shell-manifest.test.js` 会强制前两者。
- `www/app-share-card.js`：分享卡片(收据风)画布渲染(拆分第二批),`AppShareCard.create(deps)` 工厂注入 `imageSrc`/`monthNames`,只做 payload→canvas 纯绘制。
- `www/app-sync-ui.js`：云同步账号 UI(拆分第二批),`AppSyncUi.create(deps)` 工厂注入 `$`/`state`/`els`/`cloudSync` 等;后续继续拆 app.js 时照这个工厂模式。
- `www/app-brew-assist.js`：手冲冲煮辅助(拆分第三批),计时器/WakeLock 为模块私有,进行态在共享 `state.brewAssist`。
- `www/app-backup.js`：备份导出/导入与旧版迁移(拆分第三批),`confirmFn` 注入以便测试替换;导入回滚仍由 repository 保证。
- `www/app-update.js`：关于页与 GitHub Releases 更新检查(拆分第三批),`fetchFn` 可注入以便测试。
- `www/app-number-input.js`：移动端数字输入增强(2.2.2)。`stepValue`/`buildWheelWindow`/`rankSuggestions` 是可在 Node 直接测的纯函数;`enhance(root, profiles)` 按 profile 数组声明式绑定字段,所有字段共用 `#numberPickerDialog` 一个滚轮面板,不为每个输入建弹窗。滚轮刻度以当前值为中心窗口化生成、不吸附到步长网格(所以键盘输入的 255.5 在 1g 步长下也能原样保留);新增字段只加 profile,不改模块。
- `www/data-core.js`：可测试的纯数据规范化、筛选、排序、备份和统计逻辑。
- `www/sync-compare.js`：同步 LWW 裁决的唯一实现,客户端与云端 Worker 共用;禁止两侧各写一份。
- `www/repository.js`：SQLite/Web 存储适配、迁移、备份导入导出。
- `www/coffee-parser.js`：咖啡标签文本解析。
- `tests/`：Node 测试，优先覆盖纯逻辑、仓储和备份兼容。
- `worker/`：云同步后端（Cloudflare Worker + D1 + R2）。架构见 `docs/SYNC.md`，部署见 `docs/RELEASING.md`；**不受 git 触发，需手动 `wrangler deploy`**。
- `landing/`：产品落地页（`cofevault.top`），push `main` 后由 Cloudflare Pages 自动部署。
- `android/`：Capacitor Android 工程和原生插件代码。
- `resources/`、`assets/`：图标和启动图源文件/生成产物。
- `dist/`：APK 产物，不作为源码修改入口。
- `release-keystore/` 和 `android/keystore.properties`：发布签名材料，必须保持私密且不要提交。

## 运行命令

- 安装依赖：`npm.cmd install`
- Web/Android 同步：`npm.cmd run cap:sync`
- 调试 APK：`npm.cmd run android:debug`
- 正式 APK：`npm.cmd run android:release`
- 生成图标/启动图：`npm.cmd run assets`

Android 构建需要先设置：

```powershell
$env:JAVA_HOME='C:\tmp\jdk21\jdk-21.0.11+10'
$env:ANDROID_HOME='C:\tmp\android-sdk'
$env:ANDROID_SDK_ROOT='C:\tmp\android-sdk'
```

## 测试命令

- 全量 JS 测试：`npm.cmd test`
- 静态检查：`npm.cmd run lint`(ESLint,覆盖 `www/`、`worker/src/`、`tests/`、`scripts/`;新增 UMD 全局名要同步到 `eslint.config.mjs` 的 projectGlobals)
- 语法检查：`node --check www/app.js`
- 仓储语法检查：`node --check www/repository.js`
- 修改 `www/data-core.js`、`www/repository.js`、备份格式、筛选排序、统计、迁移时，必须补充或更新 `tests/`。
- 修改 `www/` 后，如要构建或验证 Android 行为，先运行 `npm.cmd run cap:sync`。

## 版本发布与 Git 流程

**完整的发布流程见 [`docs/RELEASING.md`](docs/RELEASING.md)。** 本仓库有四个可独立发布的产物（Web App、落地页、Sync Worker、Android APK），触发方式和回滚代价各不相同；版本号同步位置、D1 迁移顺序、cron 触发方式也都在那份文档里。本节只保留 Agent 必须遵守的行为约束。

采用 release 分支流程：每个版本独立分支，验证通过后合并回 `main`。`main` 不只是「最新已发布状态」的记录——**push 到 `main` 会自动部署 Web App 和落地页**，所以合并即上线。

### 多 Agent 协作规则

由于开发过程中会同时使用多个 AI/Agent 工具，且不同工具可能存在会话上下文或限额中断，所有 Agent 均需遵循以下约束，避免版本、分支、APK 产物和远端状态不一致。

必须获得用户明确确认才能执行的动作：

- `git push`、合并到 `main`、打 tag（`git commit` 只写本地，不在此列）。
- `npx wrangler deploy`、`wrangler d1 execute --remote`、`wrangler secret put`、触发 cron。
- 发布 GitHub Release（App 的「检查更新」会读取它，等同于向所有用户广播）。
- 任何删除生产数据的操作；删除前先用只读查询确认影响范围。

分支与产物：

- 子分支负责开发、打测试包和真机验收；`main` 只承载已验收通过、可发布、可回溯的稳定代码。
- `debug` 包用于开发验收和问题定位，`release` 包用于正式验收、留档和发布。
- 测试验证包可以从 `release/<x.y.z>` 子分支构建；正式发布包必须在合并回 `main` 后，从 `main` 的发布 commit 构建，并能通过 tag 回溯到唯一 commit。
- 如果 `debug` 与 `release` 使用相同 `applicationId`，通常不能稳定共存；如需同机同时安装，应给 debug 配置独立 `applicationIdSuffix`。包名不同会导致本地数据库、缓存、登录态和权限授权完全隔离。
- APK、`*.jks` / `keystore.properties` / `release-keystore/`、构建产物已在 `.gitignore` 忽略，禁止提交；APK 通过本地 `dist/` 或 GitHub Releases 分发。
- 合并优先 fast-forward。

中断恢复规则：

- 如果工具限额或会话中断，新的 Agent 必须先执行只读检查：`git status`、`git branch`、`git log --oneline -5`，确认当前分支、staged/unstaged 状态、最后 commit 和是否已打 tag。
- 代码合并进 `main` 不代表 Worker 已部署（Worker 不受 git 触发）。接手时若涉及 `worker/`，用 `/sync/hello` 或 `npx wrangler deployments list` 确认线上状态，不要假设。
- 发现改动已 staged 但未 commit 时，不要切换分支、merge、tag 或 push；应先向用户确认 commit 信息后再继续。
- 不确定某一步是否已经执行时，优先检查状态，不要重复执行 tag、push、构建覆盖或删除分支。
- 任何 Agent 接手时都要明确区分：当前是在“开发验收阶段”“合并发布阶段”还是“发布后远端同步阶段”。

## 代码风格

- 保持现有原生 JS 风格：IIFE、`'use strict'`、`const`/`let`、小函数、无构建步骤。
- `data-core.js` 放纯逻辑；涉及 DOM、对话框、插件调用的逻辑留在 `app.js`；存储、SQL、迁移留在 `repository.js`。
- 分享卡片遵循内容与渲染分离：`www/data-core.js` 的 `buildSharePayload` 只整理“分享什么”，`www/app.js` 的 Canvas renderer 只负责“怎么画、怎么分享”。
- 第一版分享卡片样式为 `receipt`，通过 `SHARE_CARD_RENDERERS` 注册；未来新增样式时优先扩展 renderer 和 `style` 参数，不改已有 payload 字段语义。
- 用户可见文案以中文为主，保持简短、直接、符合移动端空间。
- 新增数据字段时，同时处理：默认值、规范化、备份导入导出、Web 预览存储、SQLite 表结构、测试。
- SQL 迁移必须增量、幂等、可重复执行；不得依赖清库。
- UI 改动要考虑小屏、安全区域、弹窗层级、Android 返回键和无网络状态。
- 图片路径、备份 JSON、价格、克重、评分等输入都要经过规范化，不直接信任表单或导入文件。

## 禁止事项

- 禁止删除、重建或清空用户数据库来完成迁移。
- 未经用户明确要求，禁止新增网络依赖、遥测或在线识别；云同步是同步线（2.0.0）已确立的可选功能（默认关闭、仅登录后联网），离线线（1.x）仍严格无网络、无账号。
- 禁止新增不必要的 Android 权限；离线线尤其避免网络/相册/外部存储/定位权限。同步线为云同步新增 `INTERNET` 属预期，其余权限仍应避免。
- 禁止提交发布密钥、密码、`android/keystore.properties` 或 `release-keystore/` 内容。
- 禁止把 `dist/` APK 当作源码修改；发布产物只在明确构建时更新。
- 禁止把复杂业务逻辑只写在 DOM 渲染里；可测试逻辑应下沉到 `data-core.js`。
- 禁止引入前端框架或打包器，除非先确认项目方向要改变。
- 禁止覆盖用户未要求修改的已有文件；工作区有脏改动时只处理本任务相关文件。

## 完成标准

- 改动范围与请求一致，没有顺手重构无关模块。
- 用户数据兼容：旧备份、旧数据库、缺失字段和异常值都有明确处理。
- 运行必要测试；无法运行时说明原因和风险。
- 涉及 Android 构建时，同步 Capacitor，并确认 versionName/versionCode、权限和签名说明没有被破坏。
- 没有特殊说明时只打正式 release 包；debug 包仅用于开发验收或定位问题。
- 涉及 UI 时，在移动端尺寸下检查文本不溢出、按钮可点、弹窗可关闭、空状态可用。
- README、BUILDING、CHANGELOG、RELEASING 只在行为、构建或发布信息变化时更新；各文档职责边界见 `docs/RELEASING.md` 开头的索引，同一内容不要在多处重复，用引用代替复制。

## Review 标准

- 优先检查数据丢失、迁移不可逆、导入覆盖、备份不兼容和字段默认值错误。
- 检查 Android 权限、签名、包名、版本号和 Capacitor 同步是否符合发布要求。
- 检查离线承诺是否被破坏：不得新增隐式网络请求或账号依赖。
- 检查测试是否覆盖新增纯逻辑、边界值、旧数据兼容和失败回滚。
- 检查 UI 交互是否适配 Android 返回键、弹窗层级、窄屏和无数据状态。
