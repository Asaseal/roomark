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

核心流程不依赖账号、云同步或后端连接。Three.js、OrbitControls、GLTFLoader 与 GLB 模型均随应用打包，首次打开 3D 软装不依赖 CDN；GLB 无法读取时，场景使用占位模型并提供重试，不删除已保存布局。

更新内置 3D 运行时后，运行 `npm.cmd run build:furnish-runtime`，并同时提交 `assets/vendor/furnish-runtime.js.txt` 与 `assets/vendor/three-LICENSE.txt`。生成脚本固定使用 `package.json` 中的 Three.js 版本，确保本地构建和 CI 可复现。

## 当前边界

模拟空间记录和概念效果都具有明确标签。当前应用不提供自动 3D 扫描或真实图片生成服务。
