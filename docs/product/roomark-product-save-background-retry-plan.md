# 房源状态后台重试实施计划

日期：2026-08-04

1. 在 `apps/mobile/tests/product-storage-contract.test.cjs` 增加 App 离开前台时重试失败房源写入的契约测试，先观察预期失败。
2. 在 `apps/mobile/App.tsx` 订阅 `AppState.change`，只在已有错误且无写入进行中时调用现有 `retryPersistence`，并在卸载时清理订阅。
3. 运行目标测试和 Mobile 全套，确认没有重复重试或类型回归。
4. 在 API 34 模拟器回归正常保存、切后台和恢复前台流程，检查崩溃与 React Native 错误日志。
5. 更新 Android 验证记录，运行全仓验证，提交、推送公开 `main` 并等待 CI。
