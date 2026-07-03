# 2.0.6 架构优化进度

> 分支：`release/2.0.6`
> 开始时间：2026-07-03
> 目标：优先消除 `plan/CODE_AUDIT.md` 中影响同步正确性和可验证性的架构风险。

## 当前状态

- [x] 已从 `main` 创建本地 `release/2.0.6` 分支。
- [x] 已阅读 `plan/CODE_AUDIT.md`。
- [x] P0：同步游标分页与 push 后漏拉风险。
- [x] P0：Worker `server_seq` 分配并发风险与 N+1 查询。
- [x] P0：Android 图片同步上下行能力评估/修复。
- [x] P1：认证/CORS/错误脱敏。
- [x] P1：同步失败可见性与增量 push。
- [x] P2：代码侧可自动处理项已收口。

## 已处理

1. 客户端 `www/sync-engine.js`
   - 已完成：pull 循环读取直到服务端没有更多页；push 后从 push 前游标再 pull 一轮，避免 push 返回更大 cursor 时跳过其他设备早先写入的数据。
   - 测试：`tests/sync-engine.test.js` 已覆盖多页 pull 和 push 后补拉。

2. Worker `worker/src/index.js`
   - 已完成：pull 返回 `hasMore`；push 使用原子 `UPDATE user_seq SET seq = seq + ? RETURNING seq` 预留 seq 区间；批量读取已有记录，避免逐条 `SELECT`；push 返回本次接受的 `serverSeqStart/serverSeqEnd`，不再用全局最大 seq 作为客户端可信游标。
   - 已完成：CORS 白名单生效、session 滑动过期、认证轻量限流、500 错误脱敏。
   - 测试：新增 `tests/worker-sync-logic.test.js`，覆盖 LWW、incoming 收集、seq 分配辅助逻辑。

3. Android 图片同步
   - 已完成：`www/sync-service.js` 增加 native 图片存储桥接，使用 `CoffeeLabelScanner.readArchivedImage` 上传 `file:` 归档图，使用 `restoreArchivedImage` 下载恢复到 App 私有目录，保留 bag/label 角色。
   - 测试：`tests/sync-image-mapping.test.js` 已覆盖 Android file 图片上行和 r2 下行恢复。

4. 同步失败可见性
   - 已完成：`www/sync-service.js` 持久化 `lastSyncError/lastSyncErrorAt`，同步成功后清空；手动/自动同步失败后设置页能看到最近失败时间和原因。
   - 测试：`tests/sync-service.test.js` 覆盖失败记录与成功清空。

5. 增量 push
   - 已完成：`www/sync-engine.js` 维护每条记录的稳定签名 `pushState`；首次同步全量 push，后续只 push 签名变化的 bean/drinkLog/brewPlan，避免每次全量上传。
   - 已完成：`www/sync-service.js` 持久化 `pushState`，登录/退出/删号时重置。
   - 测试：`tests/sync-engine.test.js` 覆盖首轮全量、无变化空推、单条修改增量推送。

6. `applySyncData` 增量写入
   - 已完成：`www/repository.js` 新增同步专用 upsert 路径；`applySyncData` 不再调用会清表的 `writeDataSet`，避免每次同步全删全写。
   - 保留：`replaceAllData/importData` 仍使用原清表事务语义，用于显式导入/替换。
   - 测试：`tests/repository-contract.test.js` 覆盖 Web 侧缺失记录不被删除、墓碑仍隐藏；`tests/repository-native.test.js` 覆盖 native SQL 使用 `INSERT ... ON CONFLICT` 且不发 `DELETE FROM`。

7. 其他 P2 收口
   - 已完成：`importData(..., 'merge')` 改用含墓碑的 `exportForSync()` 作为合并基底，避免旧备份复活本地未推送墓碑。
   - 已完成：Worker 图片上传去重时也更新 `image_refs.ref_count`，避免重复上传分支不计引用。
   - 已完成：新增 `tests/worker-integration.test.js`，用内存 D1/R2 直接跑 Worker `fetch`，覆盖 push seq 区间、pull cursor 和图片引用计数。
   - 已完成：新增 `scripts/bump-version.mjs` 与 `npm run bump-version`，发布时一次同步 package、lock、Gradle、关于页、备份 appVersion 与 AGENTS 当前版本行。
   - 已完成：`www/sw.js` 对 vendor/icon/manifest 使用 cache-first，应用外壳仍网络优先。
   - 已完成：饮用记录时间线默认分页渲染，每次显示 60 条，降低长期使用后的 DOM 重建压力。

## 验证记录

- 2026-07-03：`node --check www/sync-engine.js` 通过。
- 2026-07-03：`node --check www/sync-transport.js` 通过。
- 2026-07-03：`node --check www/sync-service.js` 通过。
- 2026-07-03：`node --check www/app.js` 通过。
- 2026-07-03：`node --check www/repository.js` 通过。
- 2026-07-03：`node --check www/sw.js` 通过。
- 2026-07-03：`node --check worker/src/index.js` 通过。
- 2026-07-03：`node --check scripts/bump-version.mjs` 通过。
- 2026-07-03：同步相关测试 27 个通过：`node --test tests/sync-engine.test.js tests/sync-service.test.js tests/sync-transport.test.js tests/sync-image-mapping.test.js tests/worker-sync-logic.test.js`。
- 2026-07-03：仓储相关测试 16 个通过：`node --test tests/repository-contract.test.js tests/repository-native.test.js`。
- 2026-07-03：新增 Worker 集成与仓储回归测试通过：`node --test tests/repository-contract.test.js tests/worker-integration.test.js`。
- 2026-07-03：`npm.cmd test` 通过，95 个测试全部通过。
- 2026-07-03：`npm.cmd run bump-version -- 2.0.6 38 --dry-run` 通过，仅检查不写入。
- 2026-07-03：`npm.cmd run cap:sync` 通过。
- 2026-07-03：`npm.cmd run android:release` 通过，BUILD SUCCESSFUL。

## 接手后处理（2026-07-03，第二 agent）

1. 已提交此前未提交的架构优化改动：`30a69ad`。
2. 已将 `release/2.0.5`（onboarding hints）合并进 `release/2.0.6`：`025eebe`。
   - `www/app.js` 唯一冲突已解：同时保留 2.0.5 的 `data-drink-feature-dismiss` 引导关闭逻辑与 2.0.6 的饮用记录分页（`drinkVisibleLimit = DRINK_PAGE_SIZE`）。
   - 注意：2.0.6 原从 main(2.0.4) 切出，早于 2.0.5，故需此合并才不回退引导。
3. 已用 `npm run bump-version 2.0.6 39` 升到 2.0.6 / versionCode 39（38 已被 2.0.5 占用）：`97bbab7`。
4. 已 `npm run android:release` 出签名包，`adb install -r` 覆盖安装到真机（三星 SM-S9480），设备版本已是 2.0.6/39，数据用 `-r` 保留。
   - 覆盖前基线：豆仓 3 款、1 饮用中、剩余 314g（截图存 scratchpad `before_upgrade_home.png`）。
5. 待办文档：`docs/CHANGELOG.md` 尚无 2.0.6 条目，正式发布前补。

## 真机验证结果（2026-07-03）

- ✅ 验证 1 覆盖升级数据保留：`adb install -r` 后仍为 3 款豆/314g，与基线一致。
- ✅ 验证 2 登录同步：已登录 nick_lim@foxmail.com，手动“立即同步”弹“同步完成”，无卡顿。
- ✅ 验证 4 小屏错误文案：布局 `min-width:0` 已处理，另加 `overflow-wrap:anywhere` 兜底（`www/styles.css` `.sync-account-card small`，未提交/需重建生效）。
- ❌ **验证 3 图片同步：发现存量图片 bug（P0，未修）**。
  - 现象：新增/重新加的图能端到端同步显示（橘子汽水已验证正常）；但**旧版本存量图**（映夏）在 web 端裂图，`<img src>` = `about:blank#blocked`（浏览器拦截 `file://`）。
  - 根因（高置信）：增量 push 只推签名变化的记录；`www/sync-service.js` `beanIdbToR2` 的 `file:`→`r2:` 上行转换只在记录被 push 时发生且**不回写本地**。存量图记录签名早已稳定 → 永不进 delta → 转换永不触发 → 云端残留旧 `file:///data/...` 本地路径 → web 加载被拦截。
  - “重新加图能修好”是因为改了签名、强制走了一次转换。
  - 待定判定实验：安卓端仅编辑映夏任意字段+保存+同步，看 web 端映夏是否恢复（区分“未触发” vs “读图失败”两种子因）。
  - 判定实验结果：安卓端仅编辑映夏任意字段并保存+同步后，映夏图在 web 端恢复正常 → 坐实“存量图未被触发重推”，图字节本身可正常上传。
  - **已修复（待真机复验）**：
    - `www/sync-service.js`：`createImageMappingTransport` 增加持久化 `localRef↔r2` 双向映射（存 `config.imageRefs`）。push 时除增量记录外，用第三参 `allRecords` 补推“图片尚未映射到 r2”的存量豆（跳过墓碑）；反向映射保证 finalPull 拿回自己刚传的 r2 时复用原本地引用，杜绝每次同步重复落盘的死循环；已映射的图不再重复上传。账号登录/退出/删除时重置 `imageRefs`。
    - `www/sync-engine.js`：`transport.push` 第三参传全量 `merged`。
    - 测试：`tests/sync-image-mapping.test.js` 新增 3 例（存量补推、已映射不重复、round-trip 不震荡）；`tests/data-core.test.js` 版本断言改读 `package.json` 避免每次发版硬编码破测。全套 98 通过。
    - 复验方式：重装新包后触发一次同步，web 端刷新应看到映夏等存量图正常显示。
  - 真机复验：映夏存量图在 web 端已恢复正常。**金菠萝仍裂图**待查——若安卓本机金菠萝也无真实图，说明本机缺源文件（图在别的设备加的，只同步来 file: 脏引用），任何设备都补不出来，非代码可修；已加健壮性守卫：补推时只有确有图上传成功才推，不再反复推 file: 脏值（`converted === bean` 跳过）。
  - 新需求已实现：编辑器袋子/标签图片支持“删除”（`www/app.js` `removeBeanImage` + `imageCard` 删除按钮 + `www/styles.css` 操作区），清空字段后随同步把删除传播到其它设备。已提交 `0b87ec8`/`8770d5e`。

## 下一步建议

1. 需要人工介入（真机，用户操作）：
   - 覆盖升级后旧数据保留：打开 App 确认仍是 3 款豆、314g（安装已保留数据，待用户目视确认）。
   - 登录同步：设置→个人中心→同步，登录账号后手动“立即同步”，确认豆子/记录/方案跨设备一致。
   - Android 图片上行/下行：给某款豆拍照存图 → 立即同步 → 在另一设备/网页端确认图片可见；反向再验一次。
   - 小屏同步错误文案：断网触发同步失败，确认设置页“最近失败时间/原因”文案换行自然、不溢出。
2. 需要产品/迭代决策：`app.js` 完整模块拆分和 web/native 仓储业务规则进一步下沉属于大范围结构改造，建议单独开一轮做，避免和本轮同步正确性改动混在一起。

## 交接备注

- 本文件用于多 agent 同步进度。接手时请先看“当前状态”和“正在处理”，再查 `git diff`。
- 未经用户明确同意，不推送远端、不合并主线、不改发布产物 `dist/`。
