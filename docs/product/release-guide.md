# Roomark 发布指南

Roomark 的发布包必须来自已验证的源码提交，并包含可追溯的 SHA-256 校验值。

## 产品范围

当前 Android 产品覆盖房源库、房源详情、成本与风险比较、模拟空间记录、离线地图、3D 软装和概念效果状态回写。应用保持本地优先，不要求账号或服务器连接。

当前版本不包含自动 3D 扫描、真实图片生成、账号、云同步、社区、合同分析或知识库产品入口。

## 验证

在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/product-verify.ps1 -Full
```

需要检查已启动的本地服务时运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/product-verify.ps1 -Full -Live
```

## Android 预览构建

```powershell
cd apps/mobile
npx eas-cli build --platform android --profile preview
```

预览配置生成可安装 APK，用于模拟器和物理 Android 设备验收。预览 APK 不属于应用商店交付物。

## Android 生产构建

推荐使用 EAS 托管上传密钥并生成签名 AAB：

```powershell
cd apps/mobile
npx eas-cli build --platform android --profile production
```

本地生产构建必须在用户级 `~/.gradle/gradle.properties` 或环境变量中提供 `ROOMARK_UPLOAD_STORE_FILE`、`ROOMARK_UPLOAD_STORE_PASSWORD`、`ROOMARK_UPLOAD_KEY_ALIAS` 和 `ROOMARK_UPLOAD_KEY_PASSWORD`，然后运行：

```powershell
cd apps/mobile/android
.\gradlew.bat clean app:bundleRelease
```

输出为 `app/build/outputs/bundle/release/app-release.aab`。缺少上传密钥时，本地生产任务会明确失败；正式构建绝不回退到仓库中的 debug keystore。`credentials.json`、JKS、keystore 和密码不得提交到 Git。

## 发布包

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release-bundle.ps1 -Version 1.0.0
```

发布包应包含签名 Android AAB、当前源码、产品文档、后端部署文件、网站和校验清单。冻结脚本会检查 AAB 的签名条目，并调用 JDK `jarsigner` 验证签名；仅存在文件不足以通过发布门槛。

## 必要门槛

- 移动端、浏览器、网站、后端和公开内容策略检查全部通过
- Android 生产 AAB 使用上传密钥签名并构建成功
- Android 模拟器关键流程通过
- 预览 APK 在物理 Android 设备完成现场验收
- 发布包校验值与当前提交一致
- AAB 上传到商店内部测试轨并完成安装验证
