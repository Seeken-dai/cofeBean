# 冲煮方案离线分享方案

## 目标

在 1.5.0 中支持分享单个冲煮方案给其他用户。发送方可以生成分享卡片，也可以附带二维码；接收方可以离线扫码或粘贴分享码导入该方案。

> 版本说明：项目当前已发布到 1.4.8，本需求为一次较大的功能迭代，落到 1.5.0。

功能必须保持豆仓的本地优先和离线承诺：不依赖账号、网络、云端短链或远程解析服务。

## 最终方向

- 采用一份 `DC1-` 分享码承载完整单个冲煮方案。
- 二维码只是分享码的可扫描形式，不另做一套数据格式。
- 分享方案时默认不带二维码，用户需要时再勾选。
- 导入支持三种来源：相机拍摄二维码、从相册选择含二维码的图片、粘贴分享码兜底。
  - 相机与相册两条路径在实现上统一为「取到一张静态图片 → 在 JS 中解码二维码」，复用现有 `pickCoffeePhoto` 的来源选择与 Camera 插件。
  - 相册选图是必须项：用户常常是在同一台设备上从社交平台截图看到二维码，无法再用相机对着自己屏幕扫。
- 分享码默认不包含长备注，避免二维码过密；备注后续如需支持，可作为可选项单独控制。

不采用真正的超短密码或云短链。离线场景下，短密码无法凭空还原完整方案；云短链会破坏无网络、无账号、无上传的产品承诺。

## 分享码内容

分享码只包含单个冲煮方案的可迁移字段：

- 方案名称
- 冲煮方式
- 粉量、粉水比、总水量、水温
- 研磨设备和刻度
- 不同冲煮方式所需的目标参数
- 分段步骤：名称、水量、开始时间、结束时间、步骤备注

分享码不包含：

- 原方案 `id`
- `createdAt` / `updatedAt`
- 绑定咖啡豆 `beanIds`
- 饮用记录
- 图片路径
- 本机私有存储路径

导入时统一生成新的本地方案，来源为用户方案，不覆盖已有方案。

## 编码格式

格式前缀：

```text
DC1-
```

数据结构：

- 使用短字段名对象，例如 `name` -> `n`、`brewMethod` -> `m`、`steps` -> `s`。
- 省略空值、`false` 和无意义字段。
- 使用 JSON 序列化后进行 Base64URL 编码。
- 解码后必须走 `normalizeBrewPlan` 规范化，再保存到仓储。

短字段名映射保持单一数据源：

- 在 `data-core.js` 中维护一张 `PLAN_SHARE_FIELD_MAP`（长字段名 ↔ 短字段名），`encodePlanShare` / `decodePlanShare` 共用同一张表正反查，禁止两侧各自手写短名。
- 该表基于现有 `PLAN_FIELD_KEYS` 派生，新增冲煮字段时只改一处。
- `steps` 固定为四元组定长数组 `[名称, 水量, 开始时间, 结束时间]`，顺序作为格式契约写死注释，这是码长的主要来源，不对象化。

校验与防御：

- 在 `DC1-` 之后追加一段短校验位（对 Base64URL 正文做 CRC 或等价短哈希）。`decodePlanShare` 先校验，再解码。
  - 目的：粘贴少复制几位、二维码 OCR 出半截时，能明确报「分享码不完整或已损坏」，而不是经 `normalizeBrewPlan` 兜底成一条静默错误的方案。
- 解码前先剥离前缀并对正文长度设上限（约 4KB），超长直接拒绝，避免异常超长串浪费在 Base64 解码与 `JSON.parse` 上。
- `normalizeBrewPlan` 已对各字段限长（name 120 / 步骤备注 300 / notes 3000），入口长度上限是它之前的第一道闸。

选择该格式的原因：

- 相比固定顺序数组，码略长但更容易维护和调试。
- 后续新增字段时兼容性更好。
- 当前 mock 中，去掉长备注后的分享码约 260 个字符，二维码密度仍可接受。
- 未来若需带长备注或进一步降低二维码密度，优先引入 deflate（如 `pako`）压缩后再 Base64URL，而非简单加可选开关；260 字符级 JSON 压缩后通常可减半。

示例 mock（由 1.4.8 实际 mock 数据「花魁 V60 三段式」经 `encodePlanShare` 真机生成，已通过 `decodePlanShare` 往返校验）：

```text
DC1-fdcda061eyJuIjoi6Iqx6a2BIFY2MCDkuInmrrXlvI8iLCJtIjoi5omL5YayIiwiZCI6MTUsInd0IjoiOTLCsEMiLCJnIjoiQzQwIiwiZ3MiOiIyMiDmoLwiLCJyIjoiMToxNSIsInR3IjoyMjUsInRkIjoiMjozMCIsInMiOltbIumXt-iSuCIsMzAsIjA6MDAiLCIwOjMwIl0sWyLnrKwgMSDmrrUiLDEwMCwiMDozMCIsIjE6MDAiXSxbIuesrCAyIOautSIsMTUwLCIxOjAwIiwiMTozMCJdLFsi56ysIDMg5q61IiwyMjUsIjE6MzAiLCIyOjAwIl0sWyLnu5PmnZ_okIPlj5YiLDAsIjI6MDAiLCIyOjMwIl1dfQ
```

结构：`DC1-` 前缀 + 8 位 CRC32 校验位 + Base64URL 正文。该示例包含：

- 花魁 V60，手冲
- 15g / 1:15 / 225g / 92°C
- C40 / 22 格
- 目标时长 2:30
- 五段注水（闷蒸 + 三段注水 + 结束萃取）

实测码长 386 字符（含前缀与校验位），对应二维码约 version 10 / ECC M，密度仍在可扫范围。注意原 260 字符的估计偏乐观：真实方案步骤更多、步骤名带空格，故略长。

## 交互设计

### 分享

入口位于冲煮方案详情页的分享按钮。

点击后打开分享弹窗：

- 默认生成普通分享卡片，不带二维码。
- 提供「包含二维码」复选项，默认不勾选。
- 用户确认后进入现有分享预览流程。
- 如果勾选二维码，卡片底部增加二维码区域，文案建议为「扫码导入此方案 · 豆仓」。

二维码区域需要：

- 保持白底和足够 quiet zone。
- 不遮挡冲煮信息主体。
- 在小屏预览中保持可识别尺寸。

### 二维码生成（发送方）

当前项目分享卡是用 Canvas 纯手绘（`buildSharePayload` / `shareCanvas`），不依赖 `<img>`，也没有任何二维码库。生成方式：

- 引入纯离线 JS 二维码编码库（如 `qrcode` 或 `qrcode-generator`），仅用于把 `DC1-` 字符串编码成模块矩阵，不触网。
- 拿到矩阵后用现有 Canvas 自行绘制黑白方块，风格与现有手绘卡片统一，避免额外图片资源。
- 纠错等级取 M 即可（兼顾密度与容错）；保证 quiet zone 与最小模块尺寸。

### 导入

导入入口建议放在冲煮方案页，而不是数据备份弹窗，避免用户误以为会覆盖整库。

导入弹窗提供三个来源，前两者统一为「取图 → JS 解码」：

- 相机拍摄二维码
- 从相册选择含二维码的图片
- 粘贴分享码（兜底）

相机 / 相册扫码：

- 复用现有 `pickCoffeePhoto` 的来源选择与 Camera 插件（`source: CAMERA | PHOTOS`，`resultType: 'uri'`），两条路径都返回一张静态图片 URI。
- 相册选图为必须项：用户常在同一设备上从社交平台截图看到二维码，无法再用相机扫自己的屏幕。
- 在 JS 中把图片画到离屏 Canvas 取 `ImageData`，用 jsQR 离线解码出 `DC1-` 字符串，再走统一的解析流程。
- 成功后展示方案摘要：名称、方式、关键参数、步骤数。
- 用户确认后保存为新方案。

粘贴导入：

- 用户粘贴 `DC1-` 分享码。
- 解析失败时给出简短错误提示（区分：非 `DC1-`、校验位不符 / 不完整、Base64 损坏、无有效方案字段）。
- 解析成功后同样展示摘要并确认导入。

如果当前未开启「冲煮方案」功能，导入成功后自动开启。

## 解码实现选型

### 首选：纯 JS 解码（jsQR）

由于相机与相册两条路径都只产出一张静态图片，无需实时取景框，推荐纯 JS 解码：

- 引入 `jsQR`（纯 JS，约 30KB）。流程：图片 URI → 离屏 Canvas → `ImageData` → `jsQR` → `DC1-` 字符串。
- 优点：
  - 不新增 APK 体积、不新增 Gradle 依赖、不新增原生代码。
  - 天然跨平台，后续上 iOS / Web 直接复用。
  - 复用现有 Camera 权限，不新增网络、定位、相册或外部存储权限，完全离线。
- 代价：没有实时取景框扫描体验。但本方案本就是「拍照 / 选图 → 识别」，可接受。

### 可选：原生 ML Kit barcode（仅在需要实时取景时）

如果后续要做实时取景框扫描，再扩展现有 `CoffeeLabelScanner` 插件：

- 新增 `scanQr({ path })`，使用 ML Kit bundled barcode scanning，只识别 QR Code。
- 继续只使用现有相机权限，离线可用，不依赖 Google Play Services 动态下载模型。

```gradle
implementation 'com.google.mlkit:barcode-scanning:17.3.0'
```

注意：bundled 模型会增加 APK 体积。当前需求用 jsQR 即可满足，默认不引入此依赖。

## 数据安全与兼容

- 导入单个方案只新增方案，不覆盖咖啡豆、饮用记录或设置。
- 导入失败不得写入半条数据。
- 分享码解析必须有明确错误信息。
- 解码结果必须规范化，异常字段不得直接进入数据库。
- 旧版未知字段应忽略，不应导致可解析方案整体失败。
- 未来如新增 `DC2-`，解码入口应保留 `DC1-` 兼容。

## 测试清单

纯逻辑：

- `encodePlanShare` / `decodePlanShare` 单方案往返。
- 中文名称、中文步骤、数字字段、空字段省略。
- 解码后不保留原 `id`、`beanIds`、时间戳。
- 非 `DC1-`、校验位不符 / 截断、损坏 Base64、超长正文、空内容、无有效方案字段时报错。
- `encode` 与 `decode` 共用 `PLAN_SHARE_FIELD_MAP`，新增字段不会破坏旧往返。

界面与仓储：

- 默认分享不带二维码。
- 勾选后分享卡片包含二维码，且 quiet zone 与尺寸满足可扫描。
- 粘贴分享码导入新增一条方案。
- 功能关闭时导入成功后自动开启冲煮方案。
- 重复导入不会覆盖已有方案。

Android：

- 飞行模式下扫码导入成功（验证完全离线）。
- 相机拍摄另一台设备上的二维码可识别。
- 从相册截图选择二维码可识别（同设备社交平台截图场景）。
- 无二维码、模糊二维码、非法二维码有明确提示。

验证命令：

```powershell
npm.cmd test
node --check www/app.js
node --check www/repository.js
npm.cmd run cap:sync
npm.cmd run android:release
```

## 真机反馈修复记录

### 2026-06-30 — 导入弹窗与扫码识别修复（✅ 已完成）

本轮基于已安装到真机、且保留原有数据的 APK 反馈做了专项修复：

- 保持有效分享码和二维码导入逻辑不变，错误码仍按原校验链路给出失败提示。
- 修复导入弹窗内 toast 被 `<dialog>` top layer 盖住的问题：扫码 / 解析的识别中、成功、失败状态改为弹窗内联状态行展示，失败文案使用红色强调。
- 修复导入界面错位：导入弹窗不再复用 `.source-actions`，改为独立 `.import-*` 样式；粘贴解析按钮整宽显示，避免安全区内边距和双列网格造成真机下半格空白。
- 改善拍照二维码识别：`decodeQrFromImage` 在原图解码失败后增加缩图重试，并启用双向反色尝试，提升相机大图、屏幕反光或对比异常时的识别成功率。
- 调整冲煮方案页入口：导入入口从列表内独立行移动到方案页右下角悬浮按钮，位于「新增方案」按钮上方；设置页入口保留，确保冲煮方案功能关闭时仍可首次导入。
- 浏览器预览已验证：新布局无错位、解析按钮整宽、内联状态正常、悬浮按钮仅方案页显示、导入仍只新增不覆盖已有方案。

待继续真机重点复测：

- 拍照扫码失败时，弹窗内实际显示的提示文案是否足够明确。
- 相机拍摄另一设备上的二维码、相册截图导入、坏码提示、飞行模式离线导入四类场景。

## 落地拆解（分 4 阶段，可独立验证）

### 阶段 1 — 纯逻辑：编码/解码 + 单测（✅ 已完成）

- `www/data-core.js`：新增 `PLAN_SHARE_FIELD_MAP`（基于 `PLAN_FIELD_KEYS` 派生的长↔短映射，单一数据源）、`encodePlanShare` / `decodePlanShare`，并 export。
- 校验链：`DC1-` 前缀 → 8 位 CRC32 校验位 → 正文长度上限（6000 字符）→ Base64URL/`JSON.parse` → 反投影 → `normalizeBrewPlan`（剥离 id/beanIds/时间戳，`source:'user'`）。
- `tests/data-core.test.js`：往返、中文、空字段省略、剥离本机字段、非 `DC1-`/截断/篡改/无有效字段报错、未知字段忽略。
- 验证：`npm.cmd test`（19/19 通过）、`node --check www/data-core.js`。

### 阶段 2 — 二维码渲染进分享卡（发送方）（✅ 已完成）

- 引入纯 JS 二维码编码库 `qrcode-generator@2.0.4`，vendor 为 `www/vendor/qrcode-generator.js`，`index.html` 在 `data-core.js` 前挂载（暴露全局 `qrcode`）。
- `data-core.js` `buildPlanSharePayload` 接受 `includeQr`，勾选时带上 `payload.qr = { code: encodePlanShare(plan), title, hint }`。
- `app.js`：`sharePlanCard` 改为弹「是否包含二维码」勾选弹窗（默认不勾，复用 `shareChoice` 弹窗样式），`confirmPlanShareChoice` 带 `includeQr` 生成；新增 `drawReceiptQr`，位于卡片底部（备注 / 图片 / 记录之后、页脚之前），用 Canvas 逐格绘制墨棕码点（`palette.ink`）+ 奶油纸底（`palette.paper`）+ quiet zone，风格与「分段步骤」卡一致。
- `index.html`：新增 `planShareChoiceDialog` 弹窗 + `planShareIncludeQr` 复选框。
- 验证：`node --check www/app.js`、`npm.cmd test`（33/33）、浏览器预览实测——勾选生成 1080×1938 带二维码卡片、默认不勾生成 1600 高无二维码卡片，无 console 报错。

### 阶段 3 — 导入弹窗 + jsQR 解码（接收方，三来源）（✅ 已完成）

- 引入 `jsqr@1.4.0`，vendor 为 `www/vendor/jsQR.js`，`index.html` 挂载（全局 `jsQR`）。
- `app.js` 新增导入逻辑：`getPhotoForQr(source)` 直接以指定来源调 Camera（CAMERA/PHOTOS，resultType uri，不再二次询问来源）→ `decodeQrFromImage` 离屏 Canvas 取 `ImageData` → `jsQR` → `decodePlanShare`；`parsePastedImportCode` 走粘贴；`previewImportedPlan` 展示摘要（名称/方式/关键参数/步骤数）并按错误分支提示；`confirmImportPlan` → `saveBrewPlan(cloneBrewPlan(draft, { source:'user' }))`（天然只新增不覆盖）。
- **两个入口**：冲煮方案页右下角悬浮按钮 `planImportFab`（位于「新增方案」+ 按钮上方，仅方案页可见）；设置「进阶功能」区 `settingsImportPlan`（功能关闭时也可达——解决了 `plansTab` 在功能关闭时被隐藏、导致首次收方无法导入的问题）。
- 弹窗反馈用对话框内联状态行 `planImportStatus`（而非 toast）：模态 `<dialog>` 处于浏览器 top layer，普通 toast 会被盖住看不见，内联状态行始终可见，错误用 `--danger` 红色。
- `decodeQrFromImage` 对相机大图先原分辨率解码，失败再缩到约 1000px 重试，并启用 `inversionAttempts:'attemptBoth'`，提升拍照识别成功率。
- 导入成功后若 `enableBrewPlans` 为 false，置 true 并 `saveSettings`，随后跳到方案页并打开新方案详情。
- 验证（浏览器预览）：粘贴往返导入新增方案且不覆盖原方案、id 唯一；功能关闭时经设置入口导入后自动开启并显示方案页；坏码（非 DC1-/截断/校验位不符）摘要不出现、确认禁用、toast 报错；无 console 报错。相机/相册取图为原生能力，留待阶段 4 真机验证。

### 阶段 4 — 真机回归 + 发版

- 飞行模式离线扫码、相机扫另一设备、相册截图、坏码提示四类手测。
- 验证：`npm.cmd run android:release`。

> 新增依赖均纯离线、无原生代码：`qrcode-generator`（生成）+ `jsQR`（解码）。

