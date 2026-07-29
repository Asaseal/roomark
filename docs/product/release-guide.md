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

## Android 构建

```powershell
cd apps/mobile/android
.\gradlew.bat clean assembleRelease
```

仅发布独立运行的 release APK。Debug APK 依赖开发服务器，不属于交付物。

## 发布包

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release-bundle.ps1 -Version 1.0.0
```

发布包应包含 Android APK、当前源码、产品文档、后端部署文件、网站和校验清单。

## 必要门槛

- 移动端、浏览器、网站、后端和公开内容策略检查全部通过
- Android release APK 构建成功
- Android 模拟器关键流程通过
- 发布包校验值与当前提交一致
- 应用商店发布前完成物理 Android 设备检查
