# Roomark Android 软装项目隔离设计

日期：2026-07-30

## 背景

Roomark 会在房源库加载后预读多个房间的软装项目，同时在用户进入软装工作室时读取当前房间。当前 Zustand store 使用一个全局 `activeProject` 和一个全局 `loading` 布尔值。可控并发复现证明：当前工作室项目先完成后，任意后台房间稍后完成都会覆盖 `activeProject`，使工作室因为房间 ID 不匹配而永久停留在“正在打开 Roomark 软装模拟器”。

这不是新功能需求，而是现有本地软装恢复流程的状态所有权缺陷。

## 目标

- 后台预载完成顺序不得改变当前工作室展示的房间项目。
- 每个房间拥有独立的项目数据和加载状态。
- 同一房间的并发读取只执行一次 AsyncStorage 读取。
- 保留现有布局恢复、损坏提示、自动保存、失败重试和 Library 状态回写行为。
- 不改变本地存储键、软装项目 schema、WebView 协议或用户可见功能范围。

## 方案比较

### 方案 A：延迟后台加载或在工作室检测到错房间时重试

改动较小，但依赖时间顺序，慢设备和 AsyncStorage 抖动仍可复现。该方案只处理症状，不采用。

### 方案 B：为 `loadProject` 增加 `activate` 参数

Library 预载传入 `false`，工作室传入 `true`。它可以阻止大部分覆盖，但继续保留全局 `activeProject`、全局 `loading` 和调用方正确传参的隐式约束，后续调用点仍可能重新引入竞态。不采用。

### 方案 C：按房间隔离项目与加载状态

工作室直接从 `projectsByRoomId[roomId]` 读取项目，从 `loadingRoomIds[roomId]` 读取加载状态；store 不再维护全局 `activeProject`。`loadProject` 用模块内 Promise Map 对同一房间读取去重，不同房间可以安全并发。该方案从数据模型上消除跨房间覆盖，采用。

## 状态模型

`FurnishState` 保留：

- `projectsByRoomId: Record<string, FurnishProject>`
- `recoveryWarningsByRoomId: Partial<Record<string, string>>`
- `saveError`
- `pendingSave`

并将：

- `activeProject` 删除；
- `loading` 替换为 `loadingRoomIds: Partial<Record<string, true>>`；
- `setActiveProject` 替换为 `setProject`；
- `retrySave()` 调整为 `retrySave(roomId)`，从房间项目 Map 中读取重试对象。

## 加载流程

1. `loadProject(roomMesh)` 先检查该房间是否已有在途 Promise。
2. 如果存在，直接返回同一 Promise，不重复读取 AsyncStorage。
3. 如果不存在，将该房间标记为加载中并开始读取。
4. 成功后只更新该房间的项目和恢复提示。
5. `finally` 中只清除该房间的加载标记和在途 Promise。
6. 其他房间的完成顺序不会影响当前房间项目。

## 工作室数据流

`FurnishStudioScreen` 以 `roomMesh.id` 为唯一选择键：

- `project = projectsByRoomId[roomMesh.id]`
- `loading = loadingRoomIds[roomMesh.id] ?? false`

布局变化调用 `setProject(project)` 更新当前房间。生成 Mock、退出刷新、后台刷新和保存失败重试均继续使用该房间项目，不读取全局活动项目。

## 错误边界

本轮只修复成功读取之间的并发覆盖和重复读取，不改变 AsyncStorage 读取失败的产品提示。存储读取失败的明确恢复界面属于独立可靠性缺口，应在后续循环单独设计、测试和验收。

## 测试与验收

- 新增真实 store 行为测试，用可控 Promise 顺序验证：
  - 当前房间先完成、后台房间后完成时两个项目都保留；
  - 后台完成不会改变当前房间选择，因为 store 不再存在全局活动项目；
  - 每个房间加载状态互不影响；
  - 同一房间并发调用只触发一次存储读取。
- 更新静态契约，要求工作室按 `roomMesh.id` 选择项目和加载状态。
- 运行 Mobile 全套、TypeScript、全仓产品验证和 Android 原生构建。
- API 34 模拟器验证冷启动、进入软装、保存、返回和强制重启后的项目恢复。

## 范围确认

该设计只提升现有 Android 软装项目加载可靠性，不增加账号、云同步、知识库、社区、合同分析、真实自动扫描、真实图片生成或其他产品功能。根据用户对循环任务的授权，本轮技术方案由 Codex 自行确认。
