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

在 `android/app/build.gradle` 中：

1. 每次发布将 `versionCode` 加一。
2. 将 `versionName` 改为用户可见版本，例如 `1.1.0`。
3. 始终使用 `release-keystore/coffee-vault-release.jks` 和同一别名签名。
4. 构建前运行测试和同步，再安装到保留数据的设备上验证覆盖升级。
5. 没有特殊说明时只执行正式版构建，并把产物命名为 `dist/coffee-vault-<version>-release.apk`。

Git 流程：每个版本从 `main` 切 `release/<version>` 分支进行迭代与打包；APK 装机验证通过后用 `git merge --ff-only` 合并回 `main` 并打 `v<version>` tag，再从更新后的 `main` 进入下一版。`git push` 等对外操作需用户确认。完整说明见根目录 `AGENTS.md` 的「版本发布与 Git 流程」。

数据库当前 `PRAGMA user_version = 8`。以后改变表结构时，在 `www/repository.js` 中增加顺序迁移，禁止删除数据库或清空旧表。

## 校验

```powershell
npm.cmd test
node --check www/app.js
node --check www/repository.js
```

APK 可使用 Android Build Tools 的 `aapt2 dump badging`、`aapt2 dump permissions` 和 `apksigner verify --print-certs` 检查包信息、权限与签名。

2.0.9 release 已验证 `versionName=2.0.9`、`versionCode=42`，正式签名版 `dist/coffee-vault-2.0.9-release.apk`；本版完成 UI 视觉优化收尾，新增赏味期彩色标签、处理法角标、近 30 天饮用趋势、拍照入口轻推和 tab 切换动效，并优化新增豆子克重默认值、超期文案和未开启列表图片时的保存提示。未新增 Android 权限或默认网络行为。

2.0.8 release 已验证 `versionName=2.0.8`、`versionCode=41`，已生成正式签名版 `dist/coffee-vault-2.0.8-release.apk`；本版完成列表/详情/冲煮方案/咖啡日历的一轮 UI 优化，新增列表咖啡袋封面开关、余量进度条、冲煮方式图标、风味标签和详情页袋图去重，并修复饮用记录/方案卡片 meta 行对齐。未新增 Android 权限或默认网络行为。

2.0.5 release 已验证 `versionName=2.0.5`、`versionCode=38`，已生成正式签名版 `dist/coffee-vault-2.0.5-release.apk`；本版新增空豆仓首屏引导、“喝一杯”发现提示、进阶功能轻提示，并让豆仓/冲煮方案右下浮动按钮空闲后自动收起以减少遮挡。未新增 Android 权限或网络能力。

1.5.1 release 已验证 `versionName=1.5.1`、`versionCode=33`，已生成正式签名版 `dist/coffee-vault-1.5.1-release.apk`；本版修复分享卡片保存后不易出现在手机相册的问题，改为通过系统媒体库写入 `Pictures/豆仓分享卡`，并将冲煮方案离线分享码入口整合到分享弹窗中。未引入网络、账号、云端解析或新增 Android 权限。权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限。签名证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。

1.5.0 release 已验证 `versionName=1.5.0`、`versionCode=32`，已生成正式签名版 `dist/coffee-vault-1.5.0-release.apk`；本版新增冲煮方案离线分享码、二维码分享卡片和扫码/相册/粘贴导入能力，二维码生成与识别均使用纯离线 JS 依赖（`qrcode-generator`、`jsQR`），未引入网络、账号、云端解析或新增 Android 权限。权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限。签名证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。

1.4.8 release 已验证 `versionName=1.4.8`、`versionCode=31`，已生成正式签名版 `dist/coffee-vault-1.4.8-release.apk`；本版新增购买链接字段与系统外部打开能力（`ExternalLinkOpenerPlugin` 用 `Intent.ACTION_VIEW` 交给系统打开，未引入 INTERNET 权限），权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限，未新增网络、相册或外部存储权限。签名证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。

1.4.7 release 已验证 `versionName=1.4.7`、`versionCode=30`，已生成正式签名版 `dist/coffee-vault-1.4.7-release.apk`；权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限，未新增网络、相册或外部存储权限。签名证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。

1.4.6 release 已验证 `versionName=1.4.6`、`versionCode=29`，已生成正式签名版 `dist/coffee-vault-1.4.6-release.apk`；权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限，未新增网络、相册或外部存储权限。签名证书 SHA-256 为 `aab5e3d3bd224b98f885945ecd868d54a99e2c96bf099a0c9e6ee59ca02151ae`。

1.4.5 release 已验证 `versionName=1.4.5`、`versionCode=28`，权限仅包含 `android.permission.CAMERA` 和 Android 自动生成的应用内部动态接收器权限；未新增网络、相册或外部存储权限（分享卡片「保存」写入应用外部目录，无需存储权限）。签名证书 SHA-256 与 1.4.2/1.4.3/1.4.4 一致，可覆盖升级并保留数据库。
