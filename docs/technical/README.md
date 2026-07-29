# Roomark 技术文档

本目录保存当前可维护架构的技术说明。

- `backend.md`：Rust 服务、接口、持久化与部署
- `roomplan.md`：空间数据边界和未来自动采集路线

## 架构原则

- Android 应用是主产品，并保持本地优先
- 浏览器回退与 3D 软装用于跨平台检查和降级
- Rust 后端提供可选自托管能力，不阻塞离线使用
- `proto/roomark/v1/roomark.proto` 是 gRPC 契约的唯一来源
- 模拟数据与未来自动采集能力必须清楚区分
