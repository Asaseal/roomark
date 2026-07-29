# Roomark Android 验证记录

验证日期：2026-07-20

## 构建身份

- Android 包名：`com.roomark.app`
- Expo SDK：51
- React Native：0.74.5
- 构建类型：standalone release APK
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
| Release APK | PASS | `assembleRelease`：430 个任务，构建成功并内置 579 模块与 5 个资源 |
| Debug APK 独立运行 | FAIL（已修正） | 安装后出现 “Unable to load script”，证明 debug 包依赖 Metro，不再作为交付物 |

## 自动化验证

- Mobile 合约测试：33 passed，0 failed。
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

## Android 14 模拟器运行验收

设备：Android Emulator `Roomark_API_34`，Pixel 5 配置，Android 14 / API 34。

| 流程 | 状态 | 验收证据 |
|---|---|---|
| Release APK 安装与冷启动 | PASS | `adb install -r` 成功；`MainActivity` 前台；无 React Native 红屏或崩溃 |
| 房源库 → 对比 | PASS | 对比页展示 3 套房源及租金、入住成本、通勤和风险 |
| 离线地图 → 房源详情 | PASS | 地图筛选与 3 个房源点可见；选中房源后可进入完整详情 |
| 模拟扫描 → 保存 → 重启 | PASS | 保存 4.8m × 3.6m × 2.75m 的“现场扫描房型”；强制停止后仍恢复 |
| 3D 软装添加家具 | PASS | 双人沙发模型加载，布局自动保存；返回房源库显示“已摆放 1 件” |
| Mock 效果图 → 状态回写 | PASS | 保存 Mock 概念结果；房源库回写“Mock 效果图已保存” |
| Android 系统返回键 | PASS | 详情、地图和 App 层级返回正常；已保存状态未丢失 |
| 飞行模式本地流程 | PASS | 飞行模式下强制停止并重新启动，房源库和对比状态正常显示 |
| GLB 缺失降级 | AUTOMATED PASS | 自动化合约覆盖占位内容与不崩溃行为；未破坏冻结包资产做破坏性设备测试 |

## 后续发布门槛：物理真机验收

| 项目 | 状态 | 说明 |
|---|---|---|
| 实体 Android 手机安装 | DEFERRED | 用户于 2026-07-21 确认不作为本次 Android 内测版 DoD，进入正式发布前门槛 |
| 现场触控、性能与相机环境 | DEFERRED | 正式发布前在目标手机检查触控手感、WebView/3D 性能、内存与长时间使用 |
| 弱网/断网现场复测 | DEFERRED | 模拟器飞行模式已通过，正式发布前再用目标手机复测 |

## 当前结论

Roomark Android 内测版已完成：具备可独立安装、脱离 Metro 运行的 release APK，既有核心功能已在 Android 14 模拟器完成真实交互、离线与持久化验证。用户于 2026-07-21 确认将实体手机验收延期到正式发布前，因此它不再阻塞本次内测版交付；本记录不宣称已经完成物理真机验收。
