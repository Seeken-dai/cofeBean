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

数据库当前 `PRAGMA user_version = 4`。以后改变表结构时，在 `www/repository.js` 中增加顺序迁移，禁止删除数据库或清空旧表。

## 校验

```powershell
npm.cmd test
node --check www/app.js
node --check www/repository.js
```

APK 可使用 Android Build Tools 的 `aapt2 dump badging`、`aapt2 dump permissions` 和 `apksigner verify --print-certs` 检查包信息、权限与签名。
