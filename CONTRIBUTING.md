# Contributing to Roomark

感谢你改进 Roomark。项目优先接受能够增强现有租房看房工作流可靠性、可访问性、兼容性、性能、文档或部署质量的改动。

## 开始之前

1. 先搜索现有 Issue，确认问题没有重复记录。
2. 对行为变化、新依赖或跨模块重构先创建 Issue，说明用户影响和替代方案。
3. 不要在同一个 PR 中加入无关重构。
4. 不要提交真实房源、个人地址、访问令牌、私钥或用户现场照片。

## 产品范围

当前贡献范围包括 Android 房源记录、比较、离线地图、模拟空间、3D 软装、概念效果状态、本地可靠性、浏览器回退、自托管后端和工程交付。

账号、云同步、社区、合同分析、自动 3D 扫描和真实图片生成不在当前范围内。提案可以讨论未来路线，但不得把未实现能力加入当前产品入口。

## 开发环境

### Android

```powershell
cd apps/mobile
npm.cmd ci
npm.cmd run verify
```

### 浏览器

```powershell
node --test apps/web-preview/tests/*.test.cjs apps/web-furnish/tests/*.test.cjs apps/website/tests/*.test.cjs
```

### 后端

```powershell
cargo fmt --manifest-path services/backend/Cargo.toml -- --check
cargo clippy --manifest-path services/backend/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path services/backend/Cargo.toml
```

### 全部检查

```powershell
powershell -ExecutionPolicy Bypass -File scripts/product-verify.ps1 -Full
```

## 提交要求

- 行为修改先添加能够失败的测试，再实现最小修复。
- 保持 Android 本地流程不依赖后端连接。
- 所有模拟或概念能力必须诚实标注。
- 新增公共接口需要验证、错误格式和契约测试。
- 用户可见交互需具备清晰状态、失败恢复和基础无障碍语义。
- 使用 Conventional Commits，例如 `fix: preserve pending furnish layout`。

## Pull Request

PR 描述应包括：

- 用户问题和解决方式
- 影响的产品范围
- 运行过的验证命令
- UI 改动截图
- 数据迁移或兼容性影响
- 未解决限制

维护者会优先检查数据丢失、错误状态、范围扩张、隐私风险和无法复现的验证结论。
