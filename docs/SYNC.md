# 云同步架构

豆仓是**本地优先 + 可选同步**：默认完全离线，登录并开启后才联网。同步采用**多端最终一致**模型——每条记录带版本信息，用"最后写入者获胜（LWW）"解决冲突，删除靠"墓碑"传播，靠一个单调递增的服务端游标（cursor）做增量拉取。客户端与服务端各实现一遍完全一致的合并规则，所以无论哪台设备先写、以什么顺序同步，最终都收敛到同一结果。

## 组件分层

各层刻意解耦，引擎层不直接耦合存储与网络（依赖注入），因此可在 Node 里单测，Android 与 Web 两端共用同一套逻辑。

|层|文件|职责|
|-|-|-|
|编排层|[`www/sync-service.js`](../www/sync-service.js)|管配置/token、调登录注册、包一层图片映射 transport、决定要不要同步|
|引擎层|[`www/sync-engine.js`](../www/sync-engine.js)|纯逻辑的 `pull → 合并 → applyLocal → push` 五步流程|
|传输层|[`www/sync-transport.js`](../www/sync-transport.js)|HTTP 请求（带超时保护）、信封编解码、图片上传下载|
|合并算法|[`www/data-core.js`](../www/data-core.js) `mergeSyncRecords` / `compareSyncRecords`|LWW 冲突判定，纯函数、可测试|
|本地存储|[`www/repository.js`](../www/repository.js) `exportForSync` / `applySyncData`|导出全量、写回，SQLite（Android）/ IndexedDB（Web）双实现|
|云端|[`worker/src/index.js`](../worker/src/index.js)|Cloudflare Worker + D1（数据）+ R2（图片）|

## 数据模型与冲突解决

### 记录信封

同步的三类实体——咖啡豆（`bean`）、饮用记录（`drinkLog`）、冲煮方案（`brewPlan`）——在传输时统一为信封形状：

```
{ type, id, revision, updatedAt, deletedAt, deviceId, payload }
```

本地每条记录都携带四个同步字段：

* `revision`：本地每次修改自增（`localRevision`）。
* `updatedAt`：ISO 时间戳，每次修改刷新。
* `deviceId`：写入设备标识，用于打破并列。
* `deletedAt`：墓碑标记，非空即已删除。

### LWW 比较规则

冲突时按以下优先级决定"谁更新"（[`compareSyncRecords`](../www/data-core.js)，服务端 `isNewer` 与之完全一致）：

1. `updatedAt` 较晚者胜；
2. 相等则 `revision` 较大者胜；
3. 再相等则 `deviceId` 字典序较大者胜（确定性打破并列）。

胜者的 `deletedAt` 即最终删除态。

### 墓碑（软删除）

删除**不做物理删除**，而是写墓碑：置 `deletedAt` 非空并刷新 `updatedAt` / `revision`。原因：若直接删掉记录，对端会把它当作"本地缺失"而重新推送，导致已删除数据复活。墓碑通过同步传播到所有设备，各端据此隐藏记录（本地查询过滤 `deletedAt` 非空项）。

### 预置方案不同步

内置的预置冲煮方案（`source === 'preset'`）由 App 版本自带，**永不进入同步集**。合并前本地与远端都先经 [`syncablePlans`](../www/data-core.js) 剔除 preset，只同步 `user` / `copy` 来源的方案。

## 一次同步的完整流程

引擎单次 `sync()`（[`www/sync-engine.js`](../www/sync-engine.js)）执行五步：

1. **getLocal** — 从本地库导出**全量记录，含墓碑**（`repository.exportForSync()`）。
2. **pull(cursor)** — 带上次游标向云端请求 `server\_seq > cursor` 的记录，即只拉增量。
3. **merge** — 本地与远端按 `id` 归并，逐条 LWW 取胜者（`mergeSyncRecords`）；三类实体分别合并，preset 已剔除。
4. **applyLocal** — 把合并结果写回本地库（`repository.applySyncData()`）。
5. **push** — 上传合并后的记录；服务端**再独立做一遍相同的 LWW**（防止并发设备刚写入），给每条接受的记录分配递增 `server\_seq`，返回新游标。

完成后客户端持久化新的 `cursor` 与 `lastSyncAt`。

### 增量游标

`cursor` 就是服务端的 `server\_seq`——一个每用户单调递增的整数。每次 push 落库的记录都被分配一个新序号，pull 时只取序号大于本地游标的记录，从而实现增量同步而非每次全量。游标存在本地同步配置里。

## 触发时机

同步在以下时机被调用（见 [`www/app.js`](../www/app.js)）：

|时机|方式|
|-|-|
|App 启动后约 1.5s|`scheduleAutoSync(1500)`|
|切回前台（`appStateChange` active）|`scheduleAutoSync()`|
|页面重新可见（`visibilitychange`）|`scheduleAutoSync()`|
|手动点「立即同步」|`sync({ force: true })`|

自动同步（`autoSync`）默认**防抖 800ms**，且若正在同步则跳过。自动同步要求"已登录 + 已开启同步"两个条件；手动同步（`force: true`）**绕过"是否开启"开关**，但仍需已登录。

同步跳过的几种情况（`sync()` 返回 `skipped`）：不允许同步（`canSync` 为假）、未登录（无 token）、未开启且非强制。

## 图片同步（内容寻址）

图片不塞进记录 JSON，而是按 **SHA-256 内容寻址**单独传输：

* 本地引用形如 `idb:...`（IndexedDB）或原生私有路径；
* 传输/云端引用形如 `r2:<sha256>`。

[`createImageMappingTransport`](../www/sync-service.js) 负责在传输边界翻译，让引擎与合并逻辑始终工作在本地 `idb:` 空间：

* **push 前** `idb → r2`：读本地 blob，上传到 Worker，用返回的 sha 换成 `r2:` 引用；
* **pull 后** `r2 → idb`：下载 blob 存本地，换回 `idb:` 引用（同次同步内用 `Map` 缓存去重）。

咖啡豆携带图片字段（`bagImagePath` / `labelImagePath`）；饮用记录自 2.2.1 起携带 `photos`（最多 3 张引用）。云端把图片存在 R2 的 `userId/sha256` 下，相同内容用 `image\_refs.ref\_count` 去重；单张上限 5MB。映射层在 push/pull 时统一处理豆图与饮用照片的本地引用 ↔ r2 引用。

## 账号与鉴权

* **端点**：注册 `/auth/register`、登录 `/auth/login`、找回 `/auth/recover`。均返回不透明随机 token。
* **token 存储**：客户端存在 localStorage 的同步配置 `coffee-vault-sync-config` 里（字段：`enabled` / `email` / `token` / `cursor` / `lastSyncAt`）。
* **密码**：服务端用 **PBKDF2（10 万次迭代 + SHA-256 + pepper）** 加盐哈希，绝不存明文；用 `timingSafeEqual` 定时安全比较。
* **恢复码**：注册时可选生成一次性恢复码，其哈希存 `recovery\_hash`；找回密码校验恢复码后重置密码，并**撤销该用户所有旧会话**。
* **会话**：`sessions` 表存 bearer token，可撤销。除 `/sync/hello` 外所有同步端点都要求有效 token。

## 云端后端（Cloudflare Worker + D1 + R2）

后端为单个 Worker，数据在 D1（SQLite），图片在 R2。合并规则与客户端一致（LWW + 墓碑）。

### 端点

|方法|路径|鉴权|说明|
|-|-|-|-|
|POST|`/auth/register`|否|注册，返回 token|
|POST|`/auth/login`|否|登录，返回 token|
|POST|`/auth/recover`|否|恢复码重置密码|
|GET|`/sync/hello`|否|协议版本握手|
|GET|`/sync/pull?cursor=`|是|拉 `server\_seq > cursor` 的记录（单次上限 1000 条）|
|POST|`/sync/push`|是|上传记录，服务端 LWW 后分配 `server\_seq`|
|PUT|`/images/:sha`|是|上传图片（sha256 校验、去重）|
|GET|`/images/:sha`|是|下载图片|
|POST|`/auth/delete`|是|删除账号与全部云端数据（不可撤销）|

### D1 表（[`worker/schema.sql`](../worker/schema.sql)）

|表|主键|用途|
|-|-|-|
|`users`|`id`|账号：邮箱唯一，存密码哈希 + salt + 恢复码哈希|
|`sessions`|`token`|会话 token，可撤销|
|`records`|`(user\_id, type, id)`|同步记录，含 `payload\_json` 与 `server\_seq`|
|`user\_seq`|`user\_id`|每用户单调递增序列，push 时分配 `server\_seq`|
|`image\_refs`|`(user\_id, sha256)`|图片内容寻址去重，`ref\_count` 供延迟清理|

所有查询都以 `user\_id` 作用域隔离，保证用户间数据不互通。

## 隐私与安全边界

* **不登录 = 完全离线**：零网络、零上传，数据只在设备本地。
* **登录 + 开启后**：数据（含图片）经 **HTTPS + 静态加密**存到云端，按 `user\_id` 隔离、仅本人可见。
* **非端到端加密**：方案 (a) 明确为非严格 E2E——服务端理论上可读明文，换取实现简单。这是刻意取舍。
* **可随时删除**：「删除云端账号」会连 R2 图片带 D1 全部数据清空，不可撤销；本机数据保留。

## 网络与超时

传输层所有请求都有 `AbortController` 超时保护（[`www/sync-transport.js`](../www/sync-transport.js)），超时或断网返回明确中文报错，避免无限等待：

|请求|超时|
|-|-|
|登录 / 注册 / 找回|15s|
|同步 pull / push|45s|
|图片上传 / 下载|120s|

服务端默认地址 `DEFAULT\_BASE\_URL` 为 Cloudflare Worker 自定义域名（具体值见本地 `privateDocs/INFRA.md`，不入公有仓）。旧的 `*.workers.dev` 地址仍指向同一 Worker 与同一份数据，已发布的旧版本继续可用。

## 已知问题与后续

* **大陆 DNS 污染（已缓解）**：`\*.workers.dev` 泛域在中国大陆网络下遭间歇性 DNS 污染（系统解析返回非 Cloudflare 假 IP），导致直连的手机端登录/同步连不上。已通过绑定自定义域名缓解——自定义域解析走独立 DNS、落 Cloudflare 全球 anycast 边缘，绕开针对 `workers.dev` 的定向投毒（标准做法，高成功率，非绝对保证；未备案域名不走 Cloudflare 中国网络，偶有慢速波动）。
* **切换记录**：`www/sync-transport.js` `DEFAULT\_BASE\_URL` 已从 `*.workers.dev` 改为自定义域名（具体值见本地 `privateDocs/INFRA.md`）；Worker 侧 Custom Domain 绑定由控制台完成，`worker/wrangler.toml` 无需改动（自定义域名不通过 route 配置）。新旧地址并存，无数据迁移。

