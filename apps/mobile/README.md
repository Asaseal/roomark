# Roomark Android

`apps/mobile` 是 Roomark 的 Android 主产品。应用采用本地优先架构，覆盖房源记录、风险与成本比较、离线地图、模拟空间记录、3D 软装和概念效果状态。

## 环境要求

- Node.js 20
- JDK 17
- Android SDK 34
- Android Studio 或已配置的 Android 命令行工具
- Android Emulator，或开启 USB 调试的 Android 设备

## 安装与运行

```powershell
cd apps/mobile
npm.cmd ci
npm.cmd run android
```

Expo 开发环境可检查 React Native 页面和大部分本地流程。验证独立安装、WebView、GLB 与 release 行为时，应使用本地 Gradle 构建。

## 验证

```powershell
npm.cmd run verify
```

该命令运行 Node 契约测试、TypeScript 类型检查和 Expo 公共配置检查。

## Android 构建

用于模拟器或真机验收的预览 APK：

```powershell
cd apps/mobile
npx eas-cli build --platform android --profile preview
```

用于应用商店的生产 AAB：

```powershell
cd apps/mobile
npx eas-cli build --platform android --profile production
```

生产配置使用 EAS 远程签名凭据，并自动递增 `versionCode`。如需本地生成生产 AAB，在用户级 `~/.gradle/gradle.properties` 或环境变量中设置：

```properties
ROOMARK_UPLOAD_STORE_FILE=C:/secure/roomark-upload.jks
ROOMARK_UPLOAD_STORE_PASSWORD=*****
ROOMARK_UPLOAD_KEY_ALIAS=roomark-upload
ROOMARK_UPLOAD_KEY_PASSWORD=*****
```

然后运行：

```powershell
cd apps/mobile/android
.\gradlew.bat app:bundleRelease
```

输出：`app/build/outputs/bundle/release/app-release.aab`。仓库会忽略 `credentials.json`、JKS 和 keystore 文件；不得提交上传密钥或密码。

## 本地数据

- 房源、扫描和比较状态：`roomark:mobile:product-state:v1`
- 软装项目：`roomark:furnish-project:<roomId>`

读取房源状态时，当前内置目录始终是内置房源的权威来源；本地记录只恢复合法的到访、扫描、收藏、比较、软装和概念图状态。用户保存的扫描房源会逐条校验，损坏记录与无效引用会被丢弃并显示恢复提示，其他可恢复内容不会被整份清空。

产品状态和软装项目读取最多等待 8 秒；读取超时会进入现有设备内置房源或空白软装恢复结果，迟到读取不会覆盖用户已经开始使用后的当前状态。写入不使用读取超时保护，避免不可取消的旧写入迟到覆盖新数据。

核心流程不依赖账号、云同步或后端连接。Three.js、OrbitControls、GLTFLoader 与 GLB 模型均随应用打包，首次打开 3D 软装不依赖 CDN；GLB 无法读取时，场景使用占位模型并提供重试，不删除已保存布局。

同一应用进程内，成功读取的 3D 运行时 HTML 和家具 GLB Base64 URI 会被复用，返回后再次进入软装或 renderer 恢复时不重复读取静态文件。失败结果不会进入成功缓存，手动重试仍会重新访问应用内资源。

软装布局变化会先进入当前会话的内存草稿，再通过防抖队列写入设备；应用切到后台时会主动刷新待保存布局。Android WebView renderer 被系统回收或崩溃后自动恢复一次，连续失败时停止循环并提供手动重试和返回入口。

每个房间的软装项目和加载状态按 `roomId` 隔离；同时打开不同房间时，后完成的后台读取不会覆盖当前工作室。同一房间的并发读取会复用同一个在途请求，避免重复访问设备存储。

读取软装草稿时，Roomark 会逐项校验家具坐标、缩放、类别、时间和唯一 ID，只把安全数据交给 WebView。损坏草稿会保留仍可恢复的家具、使用当前房源的房型，并在软装页显示恢复提示；修复结果会在用户下一次正常保存或退出时写回设备。

WebView 回传消息在进入 React 状态和本地存储前会校验消息大小、协议类型、文本长度、房间归属和家具数量；异常消息只显示一次提示，不会覆盖当前可用布局。嵌入页只允许 `about:blank` 和内联 `data:text/html` 导航，并关闭文件访问、混合内容和多窗口能力。家具新增、删除、移动、旋转或缩放后，旧的 Mock 概念预览会自动作废；仅锁定家具不会改变预览状态。

更新内置 3D 运行时后，运行 `npm.cmd run build:furnish-runtime`，并同时提交 `assets/vendor/furnish-runtime.js.txt` 与 `assets/vendor/three-LICENSE.txt`。生成脚本固定使用 `package.json` 中的 Three.js 版本，确保本地构建和 CI 可复现。

## 当前边界

模拟空间记录和概念效果都具有明确标签。当前应用不提供自动 3D 扫描或真实图片生成服务。
