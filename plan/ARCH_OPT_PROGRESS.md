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
