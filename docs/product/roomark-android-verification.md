# Roomark Android 验证记录

验证日期：2026-07-20（持续更新至 2026-07-30）

## 构建身份

- Android 包名：`com.roomark.app`
- Expo SDK：51
- React Native：0.74.5
- 构建类型：历史内部测试 APK（非商店交付物）
- APK：`apps\mobile\android\app\build\outputs\apk\release\app-release.apk`
- APK 大小：64,048,852 bytes
- APK SHA-256：`7239466be0d57092be356baf2aa277560a34cc44ff5d741d4063ec7eaf9a077e`

## 工具链与构建

| 检查 | 状态 | 证据 |
|---|---|---|
| Expo Android 公共配置 | PASS | `npm run verify` 输出 Android 平台和 `com.roomark.app` |
| Android 原生预构建 | PASS | `npx expo prebuild --platform android --clean --no-install` 完成 |
| JDK 17 | PASS | Microsoft OpenJDK 17.0.19 |
| Android SDK / adb | PASS | platform-tools 37、Android 34、build-tools 34.0.0 |
| NDK / CMake | PASS | NDK 26.1.10909125、CMake 3.22.1 |
| Android 资源契约 | PASS | 启动页引用资源存在，并有自动化测试保护 |
| 内部测试 APK | PASS | `assembleRelease`：430 个任务，构建成功并内置 579 模块与 5 个资源 |
| Debug APK 独立运行 | FAIL（已修正） | 安装后出现 “Unable to load script”，证明 debug 包依赖 Metro，不再作为交付物 |

## 自动化验证

- Mobile 合约测试：71 passed，0 failed。
- Android release 交付契约：12 passed，0 failed。
- TypeScript：`tsc --noEmit` passed。
- Expo 公共配置：passed。
- 浏览器降级测试与 JavaScript 语法检查：passed。
- 产品预检与冻结脚本测试：passed。

## 成熟度可靠性增量

2026-07-27 的隔离成熟度分支补齐以下既有功能可靠性行为：

- 损坏、无法解析或 schema 不兼容的本地房源状态会安全恢复内置房源，并向用户显示恢复提示。
- 房源状态写入失败时保留当前内存中的操作结果，明确提示“尚未写入设备”，支持重试或稍后处理。
- 快速连续操作通过串行队列写入 AsyncStorage，前一次失败不会永久阻断后续保存。
- 模拟扫描和户型图简化 3D 的保存按钮只在设备写入成功后显示完成；失败时不再误报，并为错误、处理中和成功状态提供无障碍播报。
- 软装布局和 Mock 效果图使用串行写入队列；写入失败保留当前内存结果，显示重试入口，成功后才回写 Library 状态。
- 3D 场景未就绪时禁用家具、视角与效果图操作；加载错误覆盖层同时提供重试和返回房源详情。
- Android 硬件返回复用软装页的刷新保存流程，保存失败时停留原页。
- 读取恢复和保存失败提示具备 Android 无障碍语义、状态播报和禁用状态。

这些增量仍属于现有本地保存与异常恢复能力，不增加新的产品功能。

2026-07-29 继续消除现场首次使用的网络依赖：

- Three.js r132、OrbitControls 和 GLTFLoader 从远程 CDN 改为应用内静态资产。
- WebView 打开前通过 Expo Asset 和 FileSystem 读取本地运行时；读取失败时保留重试与返回入口。
- 生成脚本、固定依赖版本、MIT 许可证副本和自动化契约共同保证运行时可复现且不会退回 CDN。
- 自动化契约、TypeScript 与 Android 原生构建已覆盖该增量；目标实体手机的首次启动飞行模式复测仍保留为发布门槛。

2026-07-30 继续补齐现有软装流程的生命周期恢复：

- 软装布局变化先同步为最新内存草稿，350ms 防抖仍只控制设备写入；WebView 重建不会回退到旧的 `activeProject`。
- 应用离开前台时主动刷新待保存软装布局，失败后继续保留重试状态。
- Android WebView renderer 退出后自动重建一次；连续退出停止自动循环并显示手动恢复入口。
- 本地 3D 场景的加载超时从“组件打开即计时”改为“本地场景 HTML 已就绪后计时”，并将冷启动窗口调整为 45 秒，避免旧版 WebView 或刚启动的模拟器在 12 秒时被误判为失败。
- API 34 模拟器实际终止 renderer 后，应用自动重建场景并恢复已保存沙发；在首次恢复尚未完成时再次终止 renderer，应用停止自动循环并展示“重试加载 / 返回房源详情”，手动重试后恢复成功。
- 自动化契约与 TypeScript 已覆盖本轮代码增量；应用后台刷新待保存草稿仍由自动化契约覆盖，物理真机上的极限切后台时序保留为正式发布验收项。

同日继续完成详情页能力表述审计：

- 房源详情统一使用 `Mock 概念图`、`已保存 / 未创建` 和“本地概念预览”语义，与软装页、房源库和发布说明一致。
- 移除“AI 效果图”“生成一张室内效果图”和“导出 PDF”这类当前产品没有实现的承诺。
- 该整改不改变 `RenderPreview`、`renderStatus` 或本地存储 schema，不增加图片生成、PDF 或其他新功能。
- 自动化契约禁止详情页重新引入上述误导性表述。
- API 34 模拟器实际打开并滚动房源详情页，确认可见文案为“模拟与概念图”“Mock 概念图”“看房记录摘要”和本地记录说明，未出现 AI 或 PDF 承诺。

同日继续补齐软装草稿损坏恢复：

- AsyncStorage 中的软装草稿不再通过浅层顶级字段检查后直接进入 WebView；纯恢复模块校验项目、家具向量、缩放、类别、时间、重复 ID、效果图和同步状态。
- 当前房源传入的 `roomMesh` 始终是场景权威来源，旧草稿不能再覆盖当前房型。
- 一条家具损坏不会清空整份草稿；合法且唯一的家具继续保留，越界位置限制到当前房间，损坏或不再诚实的 Mock 预览被移除。
- 完整损坏和部分恢复使用不同中文提示，软装页通过 Android alert 与 live-region 语义播报；用户正常保存后清除恢复提示。
- 纯恢复模块有 4 个真实行为测试，Mobile 全套现为 50 passed、0 failed；物理真机的数据库破坏注入仍保留为正式发布前外部验收门槛。
- 本轮 `app:assembleDebug` 与 `app:createBundleReleaseJsAndAssets` 均为 `BUILD SUCCESSFUL`；Debug APK 为 139,744,953 bytes，Release 离线 bundle 为 1,043,076 bytes。
- API 34 模拟器中先备份完整 `RKStorage`，再把样例房型草稿替换为房间 ID 不匹配的 JSON。应用正常启动，软装页显示“软装记录无法读取，已恢复空白布局。”，空白 3D 房间仍可操作，且没有 React Native、AndroidRuntime 或 Chromium 错误。
- 验证后强制停止应用并恢复原 SQLite 文件；草稿值长度从注入后的 125 bytes 回到 520 bytes。重新启动软装页后，双人沙发模型与“已恢复上次软装布局”再次出现，恢复提示消失。

同日继续补齐产品级房源状态损坏恢复：

- `roomark:mobile:product-state:v1` 不再把持久化房源对象浅合并进当前目录；纯恢复模块逐项校验房源、房型、风险记录、坐标、金额、比较引用和选择状态。
- 当前内置目录始终是内置房源名称、价格、通勤、风险和房型的权威来源；仅恢复合法的用户可变状态。合法的自建扫描房源按记录保留，单条损坏不会清空整份本地数据。
- 无效、重复和原型链保留键会被拒绝，比较与选中引用仅接受当前恢复结果中的自有属性，避免 `__proto__`、`constructor` 或继承属性进入产品状态。
- 解析失败、顶级结构损坏和超过 2,000,000 字符的异常载荷安全回退到内置目录；部分损坏显示“部分本地记录已损坏，已保留可恢复内容。”，且读取阶段不自动覆盖原始数据。
- 纯恢复模块新增 5 个真实行为测试，存储契约新增 6 项校验；Mobile 全套现为 55 passed、0 failed，全仓产品验证通过。
- 本轮 `app:assembleDebug` 与 `app:createBundleReleaseJsAndAssets` 成功；Debug APK 为 139,744,953 bytes，Release 离线 bundle 为 1,047,152 bytes，并成功安装到 API 34 模拟器。
- API 34 模拟器中先备份完整 `RKStorage`，再把样例房型的 `inspection` 和 `roomMesh.width` 改为错误类型。应用显示部分恢复提示，房源库、详情和离线地图正常可用；详情仍显示当前目录的 3m × 3m × 3m、¥4,800、3 项待确认和 1 项高风险，且没有 React Native、AndroidRuntime 或 Chromium 错误。
- 验证后恢复原 SQLite 文件；产品状态值长度从注入状态回到 3,675 字符，比较与软装状态仍在，恢复提示消失，宿主机临时备份已删除。

同日继续收紧现有 3D 软装 WebView 信任边界：

- WebView 回传消息在进入 React、Zustand 和 AsyncStorage 前通过纯解析模块校验；拒绝超过 256,000 字符的载荷、未知消息、过长文本、伪造房间、被恢复模块丢弃的家具和超过 256 件的异常布局。
- 异常桥接消息不会改变场景就绪状态、当前布局或保存队列；每个 WebView 实例只显示一次“已忽略异常的 3D 场景消息”提示，仍可继续使用当前场景。
- WebView 只允许 `about:blank` 和内联 `data:text/html` 导航，关闭文件访问、通用文件 URL、混合内容、DOM Storage 和多窗口能力；本地 Three.js 与 GLB 流程仍正常加载。
- 家具新增、删除、移动、旋转或缩放会移除旧的 Mock 概念预览，仅锁定状态变化会保留预览，避免 Library 展示与当前布局不一致的旧结果。
- 模拟器真实保存 Mock 时发现，产品状态回写会让 App 重载全部软装项目并覆盖当前 `activeProject`。现改为只加载尚未进入内存且没有在途请求的房间项目，保存状态后工作室保持可用。
- 纯桥接模块新增 6 个真实行为测试，App 重载回归新增 1 个契约测试；Mobile 全套现为 63 passed、0 failed，全仓产品验证通过。
- 本轮 `app:assembleDebug` 与 `app:createBundleReleaseJsAndAssets` 均为 `BUILD SUCCESSFUL`；Debug APK 为 139,744,953 bytes，Release 离线 bundle 为 1,049,228 bytes。
- API 34 模拟器实际恢复双人沙发 GLB 和上次布局；保存 Mock 后工作室保持可用，新增家具后 Library 从“Mock 效果图已保存”变为“Mock 效果图未生成”。强制停止并重新启动后仍显示 3 件家具和未生成状态，React Native、AndroidRuntime 与 Chromium 错误日志均为 0。

同日继续消除软装项目加载的并发覆盖：

- Zustand 不再用全局 `activeProject` 和 `loading` 表示多个房间；项目与加载状态按 `roomId` 隔离，工作室只订阅当前房间。
- 不同房间并发读取时，各自结果只写回对应房间；同一房间的并发读取复用一个 Promise 和一次存储访问。
- 新增 2 个真实并发行为测试和 1 个工作室选择器契约；Mobile 全套现为 66 passed、0 failed，全仓产品验证通过。
- 本轮 `app:assembleDebug` 与 `app:createBundleReleaseJsAndAssets` 均为 `BUILD SUCCESSFUL`；Debug APK 为 139,744,953 bytes，Release 离线 bundle 为 1,049,436 bytes。
- API 34 模拟器保留既有数据安装当前 Debug APK，房源库先显示样例房型 3 件家具且 Mock 未生成；进入工作室后本地 GLB 场景恢复完成，没有因后台项目读取回到永久等待。
- 工作室新增第 4 件家具并显示“已保存”，返回房源库后显示 4 件且 Mock 仍未生成；强制停止并重新启动后状态不丢失，React Native、AndroidRuntime 与 Chromium 错误日志均为 0。

同日继续降低现有 3D 软装的重复资产准备成本：

- 新增独立的进程级静态资产服务；成功的 Three.js 运行时 HTML 与每个 GLB Base64 URI 在同一应用进程内复用，并发调用共享在途 Promise。
- 运行时读取失败会淘汰对应 Promise；模型定位或 Base64 读取失败只返回现有本地 URI / 占位路径，不进入成功缓存，因此手动重试仍会重新读取。
- 静态 `require()` 映射继续由 `FurnishWebView` 持有，WebView 仍关闭文件访问、通用文件 URL、混合内容、DOM Storage 和多窗口能力。
- 新增 5 个真实缓存行为测试，覆盖运行时并发复用、失败重试、模型复用、失败重试和模型间隔离；Mobile 全套现为 71 passed、0 failed，全仓产品验证通过。
- 本轮 `app:assembleDebug` 与 `app:createBundleReleaseJsAndAssets` 均为 `BUILD SUCCESSFUL`；Debug APK 为 139,744,953 bytes，Release 离线 bundle 为 1,051,084 bytes。
- API 34 模拟器保留既有 4 件家具状态安装当前 Debug APK；首次进入和返回 Library 后再次进入均恢复本地 GLB 场景、4 件布局与“已恢复上次软装布局”状态。
- 终止 WebView renderer PID 12366 后生成新 renderer PID 12472，场景自动恢复且未进入手动降级；React Native、AndroidRuntime 与 Chromium 错误日志均为 0。

## 生产发布整改

2026-07-29 审计发现，历史 `release` 构建类型仍引用仓库内的 debug keystore，因此上文 APK 只能证明独立运行和模拟器流程，不能作为正式签名或商店发布证据。本轮已完成：

- `release` 构建不再使用 debug keystore；本地生产构建缺少上传密钥时会明确失败。
- EAS `production` 配置使用远程签名凭据、生成 AAB，并自动递增 Android `versionCode`。
- 主清单移除外部存储读写与悬浮窗权限，只保留网络和振动权限。
- 禁用 Android 系统备份，避免本地看房记录进入系统云备份。
- 发布验证和冻结包改为要求已通过 `jarsigner` 校验的 `app-release.aab`，不再把 APK 或未签名文件当作商店交付物。

生产 AAB 尚未生成：上传密钥属于用户私有凭据，仓库不保存；物理真机验收和商店内部测试仍是未完成门槛。

## Android 14 模拟器运行验收

设备：Android Emulator `Roomark_API_34`，Pixel 5 配置，Android 14 / API 34。

| 流程 | 状态 | 验收证据 |
|---|---|---|
| 历史内部测试 APK 安装与冷启动 | PASS | `adb install -r` 成功；`MainActivity` 前台；无 React Native 红屏或崩溃 |
| 房源库 → 对比 | PASS | 对比页展示 3 套房源及租金、入住成本、通勤和风险 |
| 离线地图 → 房源详情 | PASS | 地图筛选与 3 个房源点可见；选中房源后可进入完整详情 |
| 模拟扫描 → 保存 → 重启 | PASS | 保存 4.8m × 3.6m × 2.75m 的“现场扫描房型”；强制停止后仍恢复 |
| 3D 软装添加家具 | PASS | 双人沙发模型加载，布局自动保存；返回房源库显示“已摆放 1 件” |
| Mock 效果图 → 状态回写 | PASS | 保存 Mock 概念结果；房源库回写“Mock 效果图已保存” |
| Android 系统返回键 | PASS | 详情、地图和 App 层级返回正常；已保存状态未丢失 |
| 飞行模式本地流程 | PASS | 飞行模式下强制停止并重新启动，房源库和对比状态正常显示 |
| GLB 缺失降级 | AUTOMATED PASS | 自动化合约覆盖占位内容与不崩溃行为；未破坏冻结包资产做破坏性设备测试 |
| 当前 Debug 原生构建 | PASS | `app:assembleDebug` 与 `app:createBundleReleaseJsAndAssets` 成功；当前 Debug APK 安装到 API 34 模拟器 |
| 本地 3D 冷启动 | PASS | 本地 Three.js 场景在延长后的 45 秒窗口内打开，没有再次出现 12 秒误报；已保存双人沙发恢复 |
| WebView renderer 单次退出 | PASS | 终止 renderer PID 6951 后生成新 renderer PID 7085，场景自动恢复且布局未丢失 |
| WebView renderer 连续退出 | PASS | 首次恢复期间再次终止 PID 7449，应用停止自动重启并显示手动重试与返回入口 |
| renderer 手动重试 | PASS | 连续退出后的“重试加载”重新打开场景，并恢复已保存软装布局 |
| 软装草稿整份损坏恢复 | PASS | 备份 `RKStorage` 后注入房间 ID 不匹配草稿；软装页显示明确恢复提示并打开可用空白 3D 房间，无错误日志 |
| 损坏注入后的数据复原 | PASS | 恢复原 SQLite 后重新启动；双人沙发模型和上次布局均恢复，恢复提示不再出现 |
| 产品状态嵌套损坏恢复 | PASS | 备份 `RKStorage` 后注入错误类型的风险记录与房型宽度；显示部分恢复提示，房源库、详情和地图继续使用当前目录数据，无错误日志 |
| 产品状态损坏注入复原 | PASS | 恢复原 SQLite 后产品状态值长度回到 3,675 字符；比较与软装状态保留，恢复提示消失，临时备份已清理 |
| WebView 桥接输入边界 | PASS | 自动化拒绝超长、未知、伪造房间、家具丢失和超量消息；异常消息不进入产品状态，WebView 使用最小本地能力 |
| Mock 保存后继续操作 | PASS | 保存 Mock 后工作室保持可用；未再次加载其他房间项目或进入永久等待 |
| 布局变化作废旧 Mock | PASS | 保存 Mock 后新增家具，Library 回到“Mock 效果图未生成”；强制停止并重启后仍为 3 件家具和未生成状态 |
| 并发项目加载隔离 | AUTOMATED PASS | 不同房间乱序完成时各自状态保持隔离；同一房间并发读取只访问一次设备存储 |
| 软装保存、返回与冷启动 | PASS | 从 3 件恢复布局新增到 4 件并显示“已保存”；返回房源库和强制停止重启后均保留 4 件及 Mock 未生成状态，三类错误日志为 0 |
| 3D 静态资产进程内复用 | AUTOMATED PASS | 运行时与模型成功结果在并发和连续调用间复用；失败结果淘汰后可重试，单模型失败不清除其他模型缓存 |
| 软装重复进入与缓存恢复 | PASS | 4 件布局首次进入、返回后二次进入均恢复；renderer 12366 退出后由 12472 自动恢复，三类错误日志为 0 |

## 后续发布门槛：物理真机验收

| 项目 | 状态 | 说明 |
|---|---|---|
| 实体 Android 手机安装 | DEFERRED | 用户于 2026-07-21 确认不作为本次 Android 内测版 DoD，进入正式发布前门槛 |
| 现场触控、性能与相机环境 | DEFERRED | 正式发布前在目标手机检查触控手感、WebView/3D 性能、内存与长时间使用 |
| 弱网/断网现场复测 | DEFERRED | 模拟器飞行模式已通过，正式发布前再用目标手机复测 |

## 当前结论

Roomark Android 当前具备可独立安装、脱离 Metro 运行的内部测试 APK，既有核心功能已在 Android 14 模拟器完成交互、离线与持久化验证。该历史 APK 使用调试签名，不能作为正式交付物。生产 AAB、实体手机验收与商店内部测试尚未完成，因此本记录不宣称已达到正式发布成熟度。
