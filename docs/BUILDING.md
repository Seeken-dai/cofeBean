# 构建与升级

## 环境

需要 Node.js、JDK 21，以及包含 Android API 36 的 SDK。当前工作机使用：

- JDK：`C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot`
- Android SDK：`C:\tmp\android-sdk`

首次安装依赖：

```powershell
npm.cmd install
```

每次修改 `www/` 后先同步：

```powershell
npm.cmd exec cap -- sync android
```

## 构建 APK

在当前 PowerShell 会话设置环境：

```powershell
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot'
$env:ANDROID_HOME='C:\tmp\android-sdk'
$env:ANDROID_SDK_ROOT='C:\tmp\android-sdk'
```

默认发布正式版；调试版仅在需要开发验收或定位问题时构建。

调试版：

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

正式版：

```powershell
Set-Location android
.\gradlew.bat assembleRelease
```

正式构建从被忽略的 `android/keystore.properties` 读取发布签名。不要把该文件、发布密钥或密码提交到版本库。

## 发布新版本

**完整的发布流程（分支、版本号同步、验收、tag、GitHub Release）见 [`RELEASING.md`](RELEASING.md)。** 本文只覆盖构建本身。

构建正式包时需注意：

- 始终使用 `release-keystore/coffee-vault-release.jks` 和同一别名签名，否则无法覆盖升级。
- 构建前先运行测试和 `cap sync`，产物命名为 `dist/coffee-vault-<version>-release.apk`。
- 没有特殊说明时只执行正式版构建。

数据库当前 `PRAGMA user_version = 12`。以后改变表结构时，在 `www/repository.js` 中增加顺序迁移，禁止删除数据库或清空旧表。（本地 SQLite 迁移与云端 D1 迁移是两回事，后者见 `RELEASING.md`。）

2.4.1 正式包从 `main` 发布提交构建（`cap sync` + `assembleRelease`），已用 `aapt dump badging` 核对 `versionName=2.4.1`、`versionCode=74`；`aapt dump permissions` 与 2.4.0 逐项一致，仍为 `CAMERA`、`INTERNET`、既有 Haptics 引入的 `VIBRATE` 及 Android 自动生成的应用内接收器权限，未新增权限。`apksigner verify --print-certs` 核对证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`，与既有正式版一致，可覆盖升级并保留数据库。本版为冲煮辅助增加滴滤计时与超时提示、开始前参数跑马灯、喝一杯风味胶囊，并修复时长滚轮闪动与圆环计时未居中；**不修改 SQLite、备份、同步协议或 Worker**，`user_version` 仍为 12。功能验收在 2.4.1-debug 测试包上由用户在三星设备完成（该包从 2.3.8-debug 覆盖升级，4 支豆、4 条饮用、5 个方案数据完好，`user_version` 仍为 12）；正式包因 `minifyEnabled false` 与该测试包代码一致。正式包在保留数据的同一设备上覆盖安装成功，系统确认 `MainActivity` 与 App 进程正常启动，但设备处于锁屏，未在正式包上重复可视点击冒烟。正式产物为 `dist/coffee-vault-2.4.1-release.apk`，APK SHA-256 为 `a96eb9b21cf1a0161ecb463948bfc3702963c7898bdbce07d9a12b3fb24cccaa`。

2.4.0 正式包从 `main` 发布提交干净构建（`cap sync` + `clean assembleRelease`），已用 `aapt2 dump badging` 核对 `versionName=2.4.0`、`versionCode=73`；`aapt2 dump permissions` 与 2.3.14 逐项一致，仍为 `CAMERA`、`INTERNET`、既有 Haptics 引入的 `VIBRATE` 及 Android 自动生成的应用内接收器权限，未新增权限。`apksigner verify --print-certs` 核对证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`，与既有正式版一致，可覆盖升级并保留数据库。本版重做 receipt 分享卡片自适应布局，并修复多级弹窗打开时底层页面仍可滚动；不修改 SQLite、备份、同步协议或 Worker。分享视觉与弹窗行为已在 Web Mock 中经用户验收；正式包在保留数据的三星设备上覆盖安装成功，系统确认 `MainActivity` 与 App 进程正常启动，但设备处于锁屏，未完成可视点击冒烟。正式产物为 `dist/coffee-vault-2.4.0-release.apk`，APK SHA-256 为 `022e1ca13f2d33e050f478122103fc3e8ed83bb4417b7250881014f36cb02a76`。

2.3.14 正式包从 `main` 发布提交构建（`cap sync` + `assembleRelease`），已用 `aapt2 dump badging` 核对 `versionName=2.3.14`、`versionCode=72`；`aapt2 dump permissions` 与 2.3.13 逐项一致，仍为 `CAMERA`、`INTERNET`、既有 Haptics 引入的 `VIBRATE` 及 Android 自动生成的应用内接收器权限，未新增权限。`apksigner verify --print-certs` 核对证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`，与既有正式版一致，可覆盖升级并保留数据库。本版新增饮用记录咖啡类型（黑咖/奶咖/特调）、回顾咖啡类型比例卡（替换赏味期维度）、回顾默认近 30 天、开销图三色区分与「默认进入页面」设置。**SQLite 升至 `user_version 12`**，新增 `drink_logs.coffee_type TEXT NOT NULL DEFAULT '黑咖'`，老库经 `logColumnDdl` 增量补列、列默认值即历史数据回填；备份 schema 与同步字段未变（`SCHEMA_VERSION` 仍为 7，同步 payload 透传新字段，Worker 无改动）。正式产物为 `dist/coffee-vault-2.3.14-release.apk`，APK SHA-256 为 `b179b96abfabbdcf972439ecd41ac93aec299bdda8ef7c8028340af54020128a`。

**⚠️ 2.3.14 经用户明确决定跳过真机验收发布**，且本版**带 SQLite 迁移**（`user_version` 11 → 12），风险高于 2.3.12 那次跳过：改动已在 Web 预览充分验证（咖啡类型表单与记忆上次值、外饮同样带类型、回顾默认范围与类型比例卡、四主题开销图配色、默认进入页面刷新后生效），且 `tests/repository-native.test.js` 断言了 `ALTER TABLE drink_logs ADD COLUMN coffee_type` 与 `user_version = 12` 会被生成，但 **Web 预览走 IndexedDB，覆盖不到真实 SQLite 的补列路径**——老库补列若失败，`saveDrinkLog` 的 INSERT 会整条失败，表现为「饮用记录存不了」。未在真机上做过覆盖升级冒烟。

2.3.13 正式包从 `main` 发布提交构建（`cap sync` + `assembleRelease`），已用 `aapt2 dump badging` 核对 `versionName=2.3.13`、`versionCode=71`；`aapt2 dump permissions` 与 2.3.12 逐项一致，仍为 `CAMERA`、`INTERNET`、既有 Haptics 引入的 `VIBRATE` 及 Android 自动生成的应用内接收器权限，未新增权限。`apksigner verify --print-certs` 核对证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`，与既有正式版一致，可覆盖升级并保留数据库。本版为咖啡图鉴体验增强（收集墙照片炸开散落、外饮多图封面错峰轮播、≤3 格单行、去掉返回箭头并修正个人中心返回路径），交互已在 Web 预览验收；不修改 SQLite、备份或同步 schema。正式产物为 `dist/coffee-vault-2.3.13-release.apk`，APK SHA-256 为 `976b6b1445ef147fbc562b63a5232b8a5125e90fc3d5a621cf548d0adadd7c14`。

2.3.12 正式包从 `main` 发布提交构建（`clean assembleRelease`），已用 `aapt2 dump badging` 核对 `versionName=2.3.12`、`versionCode=70`；`aapt2 dump permissions` 与 2.3.11 逐项一致，仍为 `CAMERA`、`INTERNET`、既有 Haptics 引入的 `VIBRATE` 及 Android 自动生成的应用内接收器权限，未新增权限。`apksigner verify --print-certs` 核对证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`，与既有正式版一致，可覆盖升级并保留数据库。本版拆分咖啡图鉴的自家冲煮与外饮两栏、新增外饮地点联想，并修复记一杯弹窗自动关闭与编辑页未保存图片被覆盖两个问题；不修改 SQLite、备份或同步 schema。正式产物为 `dist/coffee-vault-2.3.12-release.apk`，APK SHA-256 为 `8ec4686e8517d642c890770a53226a05555a35fae3a830cf0a7f5976170738e2`。

**⚠️ 2.3.12 经用户明确决定跳过真机验收发布**，与既往版本不同：改动已在 Web 预览充分验证（图鉴两栏、分享长图渲染、地点联想、弹窗复用），但未做真机覆盖升级冒烟。其中「编辑咖啡豆时未保存图片被自动同步覆盖」的修复，其触发路径（切后台 → 回前台 `appStateChange` → `scheduleAutoSync` → `reload()`）为 Android + 已登录云同步专属，Web 预览无法复现，该修复未在真实环境验证过。

2.3.11 正式包从 `main` 发布提交构建，已用 `aapt2 dump badging` 核对 `versionName=2.3.11`、`versionCode=69`；`aapt2 dump permissions` 与 2.3.10 逐项一致，仍为 `CAMERA`、`INTERNET`、既有 Haptics 引入的 `VIBRATE` 及 Android 自动生成的应用内接收器权限，未新增权限。`apksigner verify --print-certs` 核对证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`，与既有正式版一致。已在保留数据的三星设备上从 2.3.10 覆盖升级，启动、回顾各子页、图鉴与月报分层返回均通过真机验收。本版不修改 SQLite、备份或同步 schema；正式产物为 `dist/coffee-vault-2.3.11-release.apk`，APK SHA-256 为 `acb65e13d2f1cc5a2f22d101ab1ba11820467e57e0455ef0142e8fa7ca85529c`。

2.3.10 验收包从 `release/2.3.10` 构建，已用 `aapt2 dump badging` 核对 `versionName=2.3.10`、`versionCode=68`；权限与 2.3.9 逐项一致，仍为 `CAMERA`、`INTERNET`、既有 Haptics 引入的 `VIBRATE` 及 Android 自动生成的应用内接收器权限，未新增权限。`apksigner verify --print-certs` 核对证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`，与既有正式版一致。本版新增咖啡图鉴与分享长图，不修改 SQLite、备份或同步 schema；验收产物为 `dist/coffee-vault-2.3.10-release.apk`，APK SHA-256 为 `487974a1d96e8b5be6a3abd8f91ec6f7bb61661d150d84da518e3dc4998d7fe8`。正式发布前仍须合并 `main` 后重建。

2.3.8 验收包从 `codex/subject-crop-integration` 构建，已用 `aapt2 dump badging` 核对 `versionName=2.3.8`、`versionCode=66`；权限仍为 `CAMERA`、`INTERNET`、既有 Haptics 引入的 `VIBRATE` 及 Android 自动生成的应用内接收器权限，未新增权限。`apksigner verify --print-certs` 核对证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`，与既有正式版一致。SQLite 升至 `user_version 11`，新增原图与手账封面双路径；验收产物为 `dist/coffee-vault-2.3.8-release.apk`，APK SHA-256 为 `c22a1a372aa5422d3f917ff963bd9d8d351ae63f260bfe48b90f0b2160f4a118`。正式发布前仍须合并 `main` 后重建。

2.2.3 验收包从 `release/2.2.3` 构建，已用 `aapt2 dump badging` 核对 `versionName=2.2.3`、`versionCode=51`，权限仍为 `CAMERA`、`INTERNET` 及 Android 自动生成的应用内接收器权限；`apksigner verify --print-certs` 核对证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。本版 SQLite 升至 user_version 10、备份 schema 升至 7，新增待评分状态；验收产物为 `dist/coffee-vault-2.2.3-release.apk`，尚未合并、打 tag 或发布。

## 校验

```powershell
npm.cmd test
node --check www/app.js
node --check www/repository.js
```

APK 可使用 Android Build Tools 的 `aapt2 dump badging`、`aapt2 dump permissions` 和 `apksigner verify --print-certs` 检查包信息、权限与签名。

2.2.2 release 构建自 `main` 的发布 commit，已用 `aapt2 dump badging` 核对 `versionName=2.2.2`、`versionCode=50`，`aapt2 dump permissions` 与 2.2.1 逐行一致（仅 `CAMERA`、`INTERNET`，未新增权限），`apksigner verify --print-certs` 证书 SHA-256 与 2.2.1 相同，因此可覆盖升级并保留数据库；正式签名版 `dist/coffee-vault-2.2.2-release.apk`。本版为移动端数字输入优化（滚轮面板 + 步进器 + 摩卡壶规格选择），无数据库迁移、无备份/同步字段变更。交互已在 Web 预览中验收（含步进器按下高亮、滚轮精确输入、双列时长、克重联动），并已通过真机覆盖升级冒烟测试；已发布 GitHub Release `v2.2.2`。

注意：步进器按钮位于 `<label>` 内，按下高亮不能用 `:active`（label 激活态会传播，导致 `−` 与 `+` 同时高亮）。此类交互问题用合成 `element.click()` 复现不出，必须用真实鼠标/触摸事件（`pointerdown`/`mousedown`）验证。

2.2.1 release 已验证 `versionName=2.2.1`、`versionCode=49`，正式签名版 `dist/coffee-vault-2.2.1-release.apk`（GitHub Release `v2.2.1`）；本版新增饮用记录照片贴图（最多 3 张，相册可一次多选）、饮用页直接「记一杯」入口与外饮记录，SQLite 升级至 user_version 9，备份 schema 升级至 6。未新增 Android 权限或默认网络行为。

2.2.0 已随 `main` 发布链路合入（功能见 CHANGELOG；未单独打 `v2.2.0` tag），`versionName=2.2.0`、`versionCode=48` 对应提交在 2.2.1 之前；本版新增默认关闭的「照片手账滤镜」设置，开启后列表缩略图、详情 hero 与图库照片随主题统一色调并添加相纸/纸纹装饰，Web 端新上传图片会做轻度中性归一化，大图预览不叠加展示滤镜。未新增 Android 权限或默认网络行为。

2.1.4 已随 `main` 发布链路合入（功能见 CHANGELOG；未单独打 `v2.1.4` tag），`versionName=2.1.4`、`versionCode=47`；本版在关于页新增手动「检查更新」，通过 GitHub Releases latest API 获取最新版本和 release APK 下载入口，下载与安装交给系统浏览器和 Android 系统处理。未新增 `REQUEST_INSTALL_PACKAGES`、存储或相册权限；仅用户主动点击检查更新时联网。

2.1.2 目标 `versionName=2.1.2`、`versionCode=45`，正式签名版 `dist/coffee-vault-2.1.2-release.apk`；本版把退出确认弹窗改为「再次返回即退出」的轻提示，高级评价每个维度新增「?」说明浮窗（编辑与设置），把饮用列表的雷达图移到卡片右侧、加上单字轴标签，并修复冲煮辅助圆环段末/间奏处的跳切、以及每次更新后 Web 打开偶发报错（Service Worker 改为按版本原子化预缓存外壳，缓存名随版本变化）。未新增 Android 权限或默认网络行为。APK 打包与真机验证在合并回 `main` 前完成。

2.1.1 release 已验证 `versionName=2.1.1`、`versionCode=44`，正式签名版 `dist/coffee-vault-2.1.1-release.apk`；本版新增高级评价多维雷达图（苦度反向、进入动效，详情与列表同步展示），冲煮辅助计时圆环改用 rAF 更顺滑、冲煮中点圆环进入下一段、方案两段间等待时圆环倒计时回退，并修复首次喝一杯未回填开封日期、方案水温（带 °C 文本）无法带入 number 输入的问题。未新增 Android 权限或默认网络行为。

2.1.0 release 已验证 `versionName=2.1.0`、`versionCode=43`，正式签名版 `dist/coffee-vault-2.1.0-release.apk`；本版改版冲煮辅助（圆环突出本段注水量、常驻下一段预览、支持手动结束记录用时、辅助按钮加大、入口移到底部），修复联网时 iOS PWA 黑屏/白屏（Service Worker 外壳改为缓存优先 + 后台再验证）与安卓启动系统栏发白（主题固定系统栏底色）。未新增 Android 权限或默认网络行为。

2.0.9 release 已验证 `versionName=2.0.9`、`versionCode=42`，正式签名版 `dist/coffee-vault-2.0.9-release.apk`；本版完成 UI 视觉优化收尾，新增赏味期彩色标签、处理法角标、近 30 天饮用趋势、拍照入口轻推和 tab 切换动效，并优化新增豆子克重默认值、超期文案和未开启列表图片时的保存提示。未新增 Android 权限或默认网络行为。

2.0.8 release 已验证 `versionName=2.0.8`、`versionCode=41`，已生成正式签名版 `dist/coffee-vault-2.0.8-release.apk`；本版完成列表/详情/冲煮方案/咖啡日历的一轮 UI 优化，新增列表咖啡袋封面开关、余量进度条、冲煮方式图标、风味标签和详情页袋图去重，并修复饮用记录/方案卡片 meta 行对齐。未新增 Android 权限或默认网络行为。

2.0.5 release 已验证 `versionName=2.0.5`、`versionCode=38`，已生成正式签名版 `dist/coffee-vault-2.0.5-release.apk`；本版新增空豆仓首屏引导、“喝一杯”发现提示、进阶功能轻提示，并让豆仓/冲煮方案右下浮动按钮空闲后自动收起以减少遮挡。未新增 Android 权限或网络能力。

1.5.1 release 已验证 `versionName=1.5.1`、`versionCode=33`，已生成正式签名版 `dist/coffee-vault-1.5.1-release.apk`；本版修复分享卡片保存后不易出现在手机相册的问题，改为通过系统媒体库写入 `Pictures/豆仓分享卡`，并将冲煮方案离线分享码入口整合到分享弹窗中。未引入网络、账号、云端解析或新增 Android 权限。权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限。签名证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。

1.5.0 release 已验证 `versionName=1.5.0`、`versionCode=32`，已生成正式签名版 `dist/coffee-vault-1.5.0-release.apk`；本版新增冲煮方案离线分享码、二维码分享卡片和扫码/相册/粘贴导入能力，二维码生成与识别均使用纯离线 JS 依赖（`qrcode-generator`、`jsQR`），未引入网络、账号、云端解析或新增 Android 权限。权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限。签名证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。

1.4.8 release 已验证 `versionName=1.4.8`、`versionCode=31`，已生成正式签名版 `dist/coffee-vault-1.4.8-release.apk`；本版新增购买链接字段与系统外部打开能力（`ExternalLinkOpenerPlugin` 用 `Intent.ACTION_VIEW` 交给系统打开，未引入 INTERNET 权限），权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限，未新增网络、相册或外部存储权限。签名证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。

1.4.7 release 已验证 `versionName=1.4.7`、`versionCode=30`，已生成正式签名版 `dist/coffee-vault-1.4.7-release.apk`；权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限，未新增网络、相册或外部存储权限。签名证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。

1.4.6 release 已验证 `versionName=1.4.6`、`versionCode=29`，已生成正式签名版 `dist/coffee-vault-1.4.6-release.apk`；权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限，未新增网络、相册或外部存储权限。签名证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。

1.4.5 release 已验证 `versionName=1.4.5`、`versionCode=28`，权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限；未新增网络、相册或外部存储权限（分享卡片「保存」写入应用外部目录，无需存储权限）。签名证书 SHA-256 与 1.4.2/1.4.3/1.4.4 一致，可覆盖升级并保留数据库。
