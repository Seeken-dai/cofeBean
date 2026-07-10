# 发布流程

本仓库有**四个可独立发布的产物**，触发方式、前置条件、回滚代价各不相同。本文是「怎么发布」的唯一出处。

相关文档各司其职，本文不重复它们的内容：

- 构建环境、SDK 路径、`gradlew` 命令、APK 校验工具 → [`BUILDING.md`](BUILDING.md)
- 云同步的架构、协议、数据模型 → [`SYNC.md`](SYNC.md)
- Agent 协作约定、中断恢复、Git 安全规则 → [`../AGENTS.md`](../AGENTS.md)
- 每个版本改了什么 → [`CHANGELOG.md`](CHANGELOG.md)

## 发布物一览

|产物|源目录|触发方式|回滚手段|
|-|-|-|-|
|Web App|`www/`|push `main` → Cloudflare Pages 自动构建|Pages 控制台重新部署旧 deployment，或回滚 commit 再 push|
|落地页|`landing/`|push `main` → Cloudflare Pages 自动构建|同上|
|Sync Worker|`worker/`|手动 `npx wrangler deploy`|`npx wrangler rollback`|
|Android APK|`android/` + `www/`|手动构建签名包 + 发 GitHub Release|**无法回滚**，只能发新版本|

三个附属动作不产出制品，但会改变线上行为：

- **D1 迁移**：手动执行，不可逆，必须早于依赖它的 Worker 部署。
- **Worker Secrets**（如 `PWD_PEPPER`）：`npx wrangler secret put <NAME>`，完全在 git 之外，换值会使既有密码哈希全部失效。
- **cron 触发器**：定义在 `worker/wrangler.toml` 的 `[triggers]`，随 `wrangler deploy` 一起生效。

---

## 一、Web App 与落地页（Cloudflare Pages）

**`git push origin main` 就是一次生产部署。** 两个 Pages 项目都接了 GitHub 自动构建，推到 `main` 的提交若命中该项目的构建监视路径（build watch paths），就会触发全量重建。

|Pages 项目|构建自|Include paths|生产域名|
|-|-|-|-|
|`cofebean`|`www/`|`www/*`|`app.cofevault.top`、`cofebean.pages.dev`|
|`cofebean-landing`|`landing/`|`landing/*`|`cofevault.top`、`www.cofevault.top`|

构建监视路径在 Dashboard 配置（Workers & Pages → 项目 → 设置 → 构建 → 构建监视路径），`wrangler` 改不了。只改 `worker/`、`docs/`、`android/` 时两个站都不会重建（已用纯文档提交实测：两个项目均跳过构建）。

几个反直觉点：wildcard `*` **会跨越 `/`**，所以 `www/*` 已覆盖 `www/icons/…` 等嵌套文件，不必写 `www/**`。但一次 push 若含 **20+ commit 或 3000+ 文件变更**，Pages 会**绕过路径过滤无条件构建**——攒一大批提交一次推上去时过滤会失效。

`www/*` 这条也意味着 APK 发版前的 `bump-version`（改 `www/index.html`、`www/sw.js` 等）会照常触发 Web 上线，这是预期的：Web 端本就该跟着升版本。

这条链路是 `AGENTS.md`「`main` 只承载已验收通过的代码」的真正原因：它约束的不只是 APK 留档，而是 Web 端的即时上线。

验收（push 后）：

```powershell
npx wrangler pages deployment list --project-name cofebean          # 确认 Source 是本次 commit
curl.exe -s https://app.cofevault.top/ | Select-String "aboutVersion"
curl.exe -s https://cofevault.top/ | Select-String "<title>"
```

`www/` 的改动上线后，`www/sw.js` 的 `CACHE` 常量决定老用户何时拿到新外壳。版本号没变就不会刷新缓存——发 Web 热修时若不打算升版本号，需自行确认 Service Worker 的更新路径。

落地页的重定向与响应头在 `landing/_redirects`、`landing/_headers`，由 Pages 直接消费，改完 push 即生效。

## 二、Sync Worker（Cloudflare Workers）

Worker **不受 git 触发**，`main` 上有代码不等于线上在跑。部署与合并是两件事，顺序如下：

1. 若本次改动带 D1 结构变更，**先跑迁移**（见下节）。
2. `cd worker && npx wrangler deploy`。
3. 验收：`curl.exe -s https://cofebean-sync.nick-lim-a40.workers.dev/sync/hello`，确认 `protocol` 与预期一致。
4. 涉及 cron 的改动，部署输出里会打印 `schedule:` 行；手动触发一次见下节。

回滚：`npx wrangler rollback`（回到上一个 Version ID）。注意**回滚代码不会回滚 D1 迁移**——迁移必须设计成对新旧两版 Worker 都安全。

### D1 迁移

迁移脚本放在 `worker/migrations/`，按序号命名，内容必须增量、幂等（`CREATE ... IF NOT EXISTS`），或至少「重复执行只报错、不损坏数据」。表结构的权威定义始终是 [`worker/schema.sql`](../worker/schema.sql)，新建库直接跑它。

```powershell
cd worker
npx wrangler d1 execute cofebean-sync --remote --file=./migrations/<n>-<name>.sql
```

**顺序不能反。** 先部署再迁移，Worker 会立刻查询不存在的列，相关端点全部 500。先迁移再部署，旧 Worker 只是忽略新列，无害。

对不可逆的迁移，先用只读 `SELECT` 确认影响范围再执行。

### 手动触发 cron

`wrangler dev --remote` 会连真实的 D1 和 R2，`--test-scheduled` 暴露一个 `/__scheduled` 端点：

```powershell
cd worker
npx wrangler dev --remote --test-scheduled --port 8802
# 另开一个终端
curl.exe -s "http://127.0.0.1:8802/__scheduled"
```

**这会对生产数据执行真实写入和删除。** 涉及删除的 cron（如图片回收）在触发前应先做一次只读预演，确认将被删除的对象集合符合预期。

## 三、Android APK

唯一不可回滚的产物：用户已安装的版本收不回来，GitHub Release 一旦被 App 的「检查更新」读到就已经广播出去了。因此它的验收门槛最高。

发布 GitHub Release **不是留档动作**：2.1.4 起 App 的关于页通过 GitHub Releases latest API 检查更新并给出 APK 下载入口。Release 发错、或 tag 打在错误的 commit 上，会把所有用户导向错误的安装包。

流程（构建命令与环境变量见 [`BUILDING.md`](BUILDING.md)）：

1. 从最新 `main` 切 `release/<x.y.z>` 分支。
2. 迭代开发；用 `npm.cmd run bump-version -- <x.y.z> <versionCode>` 同步版本号（见下节），人工撰写「最新功能」列表正文。
3. 在版本分支构建测试包，装到**保留数据的设备**验证覆盖升级。反复修复直到通过。
4. 经用户确认后 `merge --ff-only` 回 `main`。
5. **在 `main` 上重新构建正式签名包**，产物为 `dist/coffee-vault-<x.y.z>-release.apk`。正式发布物必须来自 `main`。
6. 装 `main` 构建的包做最终冒烟：可安装、可覆盖升级、可启动、核心路径可用、版本号正确。
7. 冒烟通过后在发布 commit 上打 tag：`git tag -a v<x.y.z> -m "Release <x.y.z>"`。
8. 经用户确认后 push，并发布 GitHub Release。

注意第 4 步的合并会同时触发 Web App 和落地页上线——APK 还没发，Web 端已经是新版了。这个错位是预期行为，但要求 `www/` 的改动始终能独立于 APK 工作。

### 版本号同步位置

除「最新功能」列表正文需人工撰写外，以下位置全部由 `npm.cmd run bump-version -- <x.y.z> <versionCode>` 自动完成，不要手改：

- `package.json`、`package-lock.json` 的 `version`
- `android/app/build.gradle` 的 `versionName` 与 `versionCode`（每次发布加一）
- `www/index.html` 关于页 `#aboutVersion` 文案与「最新功能」标题
- `www/data-core.js` 备份的 `appVersion`
- `www/sw.js` 的 `CACHE` 常量
- `www/index.html` 与 `www/sw.js` SHELL 中 `styles.css?v=` 参数（两处必须逐字一致）
- `AGENTS.md` 的当前版本、`versionCode` 与正式产物路径

`tests/shell-manifest.test.js` 会校验 `styles.css?v=` 两处一致且与 `package.json` 版本一致，漏改直接测试失败。

---

## 跨产物的兼容契约

四个产物的发布节奏不同步，任意时刻线上都可能是这样的组合：**今天部署的 Worker + 今天上线的 Web + 用户手机上几个月前的 APK**。

- `www/` 一份源码走两条路：push 后立刻上线 Web，但要等下次 APK 发版才进 Android。任何 `www/` 改动都必须能在「新 Web」和「旧 APK」两种壳里工作。
- Worker 的 `SYNC_PROTOCOL` / `minWritableProtocol` / `minReadableProtocol`（`/sync/hello` 返回）是 Worker 与**所有历史客户端**之间的契约。改协议前先确认最老的在用 APK 能否降级工作。
- LWW 裁决逻辑由 `www/sync-compare.js` 单一实现，客户端与 Worker 共用。两侧各写一份会导致设备间数据永不收敛。
- D1 迁移要对新旧两版 Worker 都安全，因为 `wrangler rollback` 不会回滚数据。

## 已知缺口

以下问题已识别但尚未处理，接手时请知悉：

- **Worker 与 Pages 的自动部署解耦**：Worker 不受 git 触发，改 `worker/` 后必须记得手动 `wrangler deploy`，否则 `main` 上有新代码而线上仍是旧版。
- **Worker 线上版本不可回溯**：无法从线上确认当前跑的是哪个 commit。可考虑部署时把 git sha 注入环境变量，由 `/sync/hello` 回显。
- **R2 桶无生命周期规则**：图片回收依赖 Worker 的 cron 与增量 GC（机制见 [`SYNC.md`](SYNC.md#图片回收)），桶本身没有兜底的过期策略。
