# Roomark Android WebView 生命周期恢复设计

状态：已获用户批准，等待书面规格复核  
日期：2026-07-30  
范围：现有 Android 3D 软装流程的异常恢复与本地保存可靠性

## 目标

当 Android 系统回收或终止 WebView 渲染进程、应用切入后台，或用户在 350ms 自动保存防抖窗口内离开前台时，Roomark 应尽量保留最新软装布局、关闭不可用操作，并恢复现有 3D 场景。该增量只提高现有功能可靠性，不新增产品入口或能力。

## 非目标

- 不新增账号、云同步、社区、合同分析或知识库。
- 不实现真实自动扫描或真实 AI 效果图。
- 不改变软装数据模型、家具能力或页面信息架构。
- 不取消现有 350ms 写入防抖，不把每次拖动都直接写入设备。
- 不把模拟器验证描述为物理真机验收。

## 当前证据与根因

1. `FurnishWebView` 未处理 `react-native-webview@13.8.6` 的 Android `onRenderProcessGone` 事件。渲染进程退出后，React Native 页面仍可能保留 `sceneReady=true`，导致家具和场景操作继续向已失效的 WebView 发送消息。
2. WebView 发出的 `PROJECT_CHANGED` 只写入 `FurnishStudioScreen.pendingProjectRef`，等待 350ms 后才调用 `saveProject`。恢复 WebView 使用的 `activeProject` 在这段窗口内仍是旧项目。
3. `FurnishStudioScreen` 仅在定时器、返回和卸载时刷新待保存项目，没有订阅 `AppState`。Android 进入后台后，计时器可能暂停，进程也可能在卸载清理完成前被终止。
4. `furnishStore` 已提供同步的 `setActiveProject` 和串行持久化队列，可以分别承担内存草稿更新与设备写入排序，无需引入新的存储体系。

## 设计

### 1. 内存草稿与设备持久化分层

`handleProjectChanged` 继续合并已有 Mock 效果图状态，并在启动 350ms 防抖定时器前调用 `setActiveProject(projectToSave)`。

结果：

- `activeProject` 始终代表当前会话中最新的有效布局，可用于 WebView 重建。
- `pendingProjectRef` 仍代表尚未确认写入设备的布局。
- 设备写入仍由 `saveProject` 和现有串行队列完成，不增加高频 AsyncStorage 写入。
- 保存失败时，内存草稿和重试入口继续保留，不把未持久化状态误报为已保存。

### 2. 后台切换刷新

`FurnishStudioScreen` 订阅 React Native `AppState` 的 `change` 事件。当状态离开 `active` 且存在待保存项目时，调用现有 `flushProjectSave`。

约束：

- 不阻塞系统后台切换。
- 多次状态事件或与定时保存重叠时，由 `pendingProjectRef` 清空语义和 store 串行队列避免重复并发写入。
- 写入失败时把项目重新放回 `pendingProjectRef`，保留现有失败提示和手动重试能力。
- 该机制是 Android 生命周期回调下的最佳努力保护，不能替代物理设备上的强制终止测试。

### 3. WebView 渲染进程恢复

`FurnishWebView` 增加 Android `onRenderProcessGone` 处理：

1. 立即清除加载计时器，设置 `sceneReady=false`，并通过 `onSceneReadyChanged(false)` 关闭家具、视角和效果图操作。
2. 如果当前恢复周期尚未自动尝试，则记录一次尝试、清空旧 HTML 并递增 `webViewKey`，重建 WebView。
3. 新 WebView 通过现有本地 Three.js 运行时和 GLB 资产重新加载；收到 `SCENE_READY` 后，使用最新 `project` 属性执行 `INIT_PROJECT`。
4. 只有收到 `SCENE_READY` 才重置自动恢复计数。
5. 如果在未就绪前再次发生渲染进程退出，则停止自动循环，显示明确错误覆盖层，保留“重试加载”和“返回房源详情”。
6. 用户手动重试会开启一个新的恢复周期。

Android API 26 以下没有 `onRenderProcessGone` 事件，继续依赖现有 WebView `onError`、场景错误消息和 12 秒加载超时降级。

## 数据流

```text
WebView PROJECT_CHANGED
  -> 合并已有效果图状态
  -> setActiveProject（最新内存草稿）
  -> pendingProjectRef（待持久化）
  -> 350ms 防抖或 AppState 后台事件
  -> saveProject
  -> 串行写入 AsyncStorage

WebView renderer 退出
  -> sceneReady=false
  -> 第一次：重建 WebView
  -> 本地运行时加载
  -> INIT_PROJECT（最新 activeProject）
  -> SCENE_READY

连续第二次退出
  -> 停止自动重建
  -> 错误覆盖层
  -> 手动重试或返回
```

## 错误与体验

- 自动恢复期间显示“3D 场景意外退出，正在恢复”，不显示网络相关提示。
- 连续失败显示“3D 场景连续恢复失败，请重试或返回房源详情”。
- `sceneReady=false` 时保持现有禁用状态和无障碍语义。
- 恢复成功后，状态文案继续使用现有“已恢复上次软装布局”或房间尺寸提示。
- 保存失败与渲染恢复失败保持两个独立状态：前者表示设备写入未完成，后者表示 3D 交互不可用。

## 测试与验收

### 自动化

先添加失败契约测试，再实现最小修复。测试必须证明：

- `FurnishWebView` 注册 `onRenderProcessGone`。
- 渲染进程退出会关闭 `sceneReady`，自动重建次数有上限，手动重试可开启新周期。
- `handleProjectChanged` 在启动防抖保存前同步调用 `setActiveProject`。
- `FurnishStudioScreen` 订阅 `AppState.change`，离开 `active` 时刷新待保存项目。
- 现有保存失败重试、Android 返回和离线运行时契约继续通过。

随后运行：

- Mobile 全部契约测试。
- TypeScript 类型检查和 Expo 公共配置检查。
- 全仓产品验证、后端测试和格式检查。
- Android Debug 原生构建与 Release 离线 JS/资产打包。

### Android 模拟器

在 API 34 模拟器上完成：

1. 打开软装页并产生至少一次布局变化。
2. 在防抖保存窗口内切到后台，再强制停止并重启应用，确认布局从设备恢复。
3. 找到并终止 Roomark WebView renderer，确认主应用不崩溃、场景操作立即禁用且自动恢复。
4. 恢复后确认家具数量和位置没有回退到渲染进程退出前的旧内存布局。
5. 重复终止 renderer，确认不会形成无限自动重建循环，错误覆盖层可手动重试或返回。

模拟器无法替代目标实体手机的内存压力、长时间操作和厂商 WebView 兼容性验收；这些继续保留为正式发布门槛。

## 预计修改范围

- `apps/mobile/components/FurnishWebView.tsx`
- `apps/mobile/screens/FurnishStudioScreen.tsx`
- `apps/mobile/tests/furnish-contract.test.cjs`
- `apps/mobile/README.md`
- `docs/product/roomark-android-verification.md`

## 完成标准

- 红灯测试确实因缺少生命周期恢复而失败，修复后转绿。
- WebView renderer 首次退出可自动恢复，连续退出不会循环。
- 350ms 防抖窗口内的最新布局可作为 WebView 恢复来源。
- 应用进入后台时会刷新待保存布局。
- 全仓验证、Android 构建和模拟器验收均有当次证据。
- 提交保持单一、可回退，并推送到公开仓库；远端 CI 全部通过。
