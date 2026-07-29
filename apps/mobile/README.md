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

## Release APK

```powershell
cd apps/mobile/android
.\gradlew.bat assembleRelease
```

输出：`app/build/outputs/apk/release/app-release.apk`

## 本地数据

- 房源、扫描和比较状态：`roomark:mobile:product-state:v1`
- 软装项目：`roomark:furnish-project:<roomId>`

核心流程不依赖账号、云同步或后端连接。GLB 无法读取时，3D 场景使用占位模型并提供重试，不删除已保存布局。

## 当前边界

模拟空间记录和概念效果都具有明确标签。当前应用不提供自动 3D 扫描或真实图片生成服务。
