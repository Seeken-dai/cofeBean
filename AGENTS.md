# AGENTS.md

## 项目背景

- 豆仓 Coffee Vault 是完全离线、本地优先的 Android 个人咖啡豆管理 App。
- 当前版本为 `1.4.4`，Android `versionCode 27`，正式产物为 `dist/coffee-vault-1.4.4-release.apk`。
- 正式数据保存在应用私有 SQLite 数据库；Web 预览只用于开发，不代表真实设备存储行为。
- App 不需要账号、网络、相册或存储权限；拍照识别只应申请相机权限。
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
- `www/data-core.js`：可测试的纯数据规范化、筛选、排序、备份和统计逻辑。
- `www/repository.js`：SQLite/Web 存储适配、迁移、备份导入导出。
- `www/coffee-parser.js`：咖啡标签文本解析。
- `tests/`：Node 测试，优先覆盖纯逻辑、仓储和备份兼容。
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
- 语法检查：`node --check www/app.js`
- 仓储语法检查：`node --check www/repository.js`
- 修改 `www/data-core.js`、`www/repository.js`、备份格式、筛选排序、统计、迁移时，必须补充或更新 `tests/`。
- 修改 `www/` 后，如要构建或验证 Android 行为，先运行 `npm.cmd run cap:sync`。

## 版本发布与 Git 流程

采用 release 分支流程：每个版本独立分支，验证通过后合并回 `main`；`main` 始终代表最新已发布状态。

1. 从最新 `main` 切版本分支：`git checkout main && git checkout -b release/<x.y.z>`。
2. 在该分支迭代：改代码、补测试，把版本号同步到下列所有位置，并更新 `README.md`、`CHANGELOG.md`、`BUILDING.md`。
3. 在该分支用 `npm.cmd run android:release` 打正式签名 APK，复制为 `dist/coffee-vault-<x.y.z>-release.apk`，装到保留数据的设备验证覆盖升级。
4. APK 验证无误后合并回主线并打 tag：`git checkout main && git merge --ff-only release/<x.y.z> && git tag -a v<x.y.z> -m "..."`。
5. 下一个版本从更新后的 `main` 重新切分支，循环往复；旧版本分支合并后可删除（内容已在 `main` 中）。

版本号需同步修改的位置（缺一不可）：

- `package.json`、`package-lock.json` 的 `version`
- `android/app/build.gradle` 的 `versionName` 与 `versionCode`（每次发布 `versionCode` 加一）
- `www/index.html` 关于页 `#aboutVersion` 文案与「最新功能」列表
- `www/data-core.js` 备份的 `appVersion`

Git 约定：

- `git commit` 只写入本地仓库；`git push` 才会推送到远程 `origin`（GitHub）。push、合并到远程默认分支等对外动作必须先获得用户明确同意。
- APK、`*.jks` / `keystore.properties` / `release-keystore/`、构建产物已在 `.gitignore` 忽略，禁止提交；APK 通过本地 `dist/` 或 GitHub Releases 分发。
- 合并优先 fast-forward；发布提交打 `v<x.y.z>` tag 便于回溯。

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
- 禁止新增网络依赖、远程账号、遥测、云同步或在线识别，除非用户明确要求。
- 禁止新增不必要的 Android 权限；尤其避免相册、外部存储、定位、网络权限。
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
- README、BUILDING、CHANGELOG 只在行为、构建或发布信息变化时更新。

## Review 标准

- 优先检查数据丢失、迁移不可逆、导入覆盖、备份不兼容和字段默认值错误。
- 检查 Android 权限、签名、包名、版本号和 Capacitor 同步是否符合发布要求。
- 检查离线承诺是否被破坏：不得新增隐式网络请求或账号依赖。
- 检查测试是否覆盖新增纯逻辑、边界值、旧数据兼容和失败回滚。
- 检查 UI 交互是否适配 Android 返回键、弹窗层级、窄屏和无数据状态。
