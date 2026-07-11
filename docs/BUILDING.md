# 构建与升级

## 环境

需要 Node.js、JDK 21，以及包含 Android API 36 的 SDK。当前工作机使用：

- JDK：`C:\tmp\jdk21\jdk-21.0.11+10`
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
$env:JAVA_HOME='C:\tmp\jdk21\jdk-21.0.11+10'
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

数据库当前 `PRAGMA user_version = 10`。以后改变表结构时，在 `www/repository.js` 中增加顺序迁移，禁止删除数据库或清空旧表。（本地 SQLite 迁移与云端 D1 迁移是两回事，后者见 `RELEASING.md`。）

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
