# Roomark

[English](README.en.md) · [产品网站](https://asaseal.github.io/roomark/) · [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md)

Roomark 是面向租房看房现场的 Android 本地优先工具。它把房源记录、租住成本、通勤、风险证据、房源比较、离线地图和空间布置集中在一个可恢复的工作流中，帮助租房者在离开现场后仍能依据完整记录做判断。

## 产品图集

Roomark 的公开产品图集与产品网站使用同一组经过能力校准的素材，覆盖房源记录、地图比较、租房决策和空间布置。

| 统一看房记录 | 离线地图比较 |
| --- | --- |
| ![Roomark 集中管理看房记录、租金、通勤与空间信息](docs/images/product/roomark-overview.jpg) | ![Roomark 在离线地图中比较已记录房源](docs/images/product/roomark-map.jpg) |

| 租房决策 | 空间布置 |
| --- | --- |
| ![Roomark 对比租金、入住成本、通勤与风险](docs/images/product/roomark-decision.jpg) | ![Roomark 使用本地样例房间进行家具布置](docs/images/product/roomark-furnishing.jpg) |

## 当前能力

- 房源库、房源详情和现场问题记录
- 月租、押金、入住成本、通勤和风险比较
- 不依赖网络的看房地图
- 明确标注的模拟空间记录和户型图简化空间
- WebView 3D 家具添加、拖动、锁定、删除和本地保存
- 概念效果状态回写
- 本地数据损坏恢复、保存失败重试和串行写入保护

## 能力边界

Android 应用默认完全本地运行，不要求注册账号或连接服务器。当前版本不包含账号、云同步、社区、合同分析、自动 3D 扫描或真实图片生成服务。模拟空间和概念效果会在界面中明确说明，不把未来能力描述成当前能力。

## Android 快速开始

环境要求：Node.js 20、JDK 17、Android SDK 34，以及 Android Studio 或已配置的 Android 命令行工具。

```powershell
cd apps/mobile
npm.cmd ci
npm.cmd run verify
npm.cmd run android
```

生成商店生产包有两条路径：

```powershell
cd apps/mobile
npx eas-cli build --platform android --profile production
```

EAS 使用远程托管的上传密钥生成签名 AAB。本地构建时，先按[发布指南](docs/product/release-guide.md)配置私有上传密钥，再运行 `apps/mobile/android/gradlew.bat app:bundleRelease`。预览 APK 仅用于模拟器或真机验收，不作为应用商店交付物。

## 后端自托管

`services/backend` 是 Roomark 现有扫描会话、房间结构、室内视点和软装项目领域的 Rust 服务。Android 应用不依赖后端启动，后端用于自托管和跨客户端集成。

```powershell
cargo run --manifest-path services/backend/Cargo.toml
```

后端接口、数据持久化和容器部署说明见 [services/backend/README.md](services/backend/README.md)。

## 架构

```text
apps/mobile        Android 主产品，本地状态与 3D WebView
apps/web-preview   浏览器回退与产品契约检查
apps/web-furnish   独立 3D 软装工作流
apps/website       静态产品网站
services/backend   Rust 自托管服务
proto/roomark/v1   共享 gRPC 契约
docs/product       产品验证与发布说明
docs/technical     架构与部署文档
scripts            统一验证与发布打包
```

## 验证

```powershell
npm.cmd --prefix apps/mobile run verify
node --test apps/web-preview/tests/*.test.cjs apps/web-furnish/tests/*.test.cjs apps/website/tests/*.test.cjs scripts/tests/*.test.cjs
cargo test --manifest-path services/backend/Cargo.toml
```

Android 模拟器验证证据见 [Roomark Android 验证记录](docs/product/roomark-android-verification.md)。物理 Android 设备仍是应用商店发布前的必要门槛。

## 参与项目

提交代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。问题排查和使用帮助见 [SUPPORT.md](SUPPORT.md)；安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 许可证

Roomark 使用 [MIT License](LICENSE)。
