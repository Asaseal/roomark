# Roomark WebView 桥接可靠性设计

日期：2026-07-30

## 背景

Roomark 的 3D 软装场景运行在 Android WebView 中。当前 Native 侧只对 `event.nativeEvent.data` 执行 `JSON.parse`，随后直接把 `PROJECT_CHANGED` 中的项目交给 Zustand 和 AsyncStorage。消息缺少 `placedFurniture`、伪造房间、包含异常家具或异常大载荷时，可能导致软装页抛错、错误状态进入内存和设备，或让主线程承担不受控的解析工作。

WebView 当前还允许任意来源、文件访问、文件来源跨域访问和混合内容；而正式场景 HTML、Three.js 运行时与家具 GLB 已全部由 App 本地准备，不需要这些宽泛能力。

本轮只加固现有 3D 软装功能，不新增家具、账号、云同步、真实渲染或其他产品能力。

## 目标

- WebView 消息在进入 React 状态与持久化前完成严格验证。
- 异常大消息在 `JSON.parse` 前被拒绝。
- 伪造项目、错误房间、损坏家具和未知消息类型不会修改当前布局。
- 单条异常消息不会让整个仍可运行的 3D 场景进入错误覆盖层。
- 家具视觉布局变化后，旧 Mock 概念预览不会继续被描述为当前结果。
- WebView 只允许当前内嵌 HTML 导航，不启用现有场景不需要的文件与混合内容能力。

## 非目标

- 不修改家具种类、3D 交互方式或页面布局。
- 不新增远程资源、后端接口或真实图片生成。
- 不改变软装存储 key 与数据 schema。
- 不把 WebView 改为新的 3D 技术栈。

## 方案比较

### A. 页面空值保护

只在 `handleProjectChanged` 访问 `placedFurniture` 前增加可选链。改动小，但伪造数据仍可进入 Zustand 和 AsyncStorage，未知消息与大载荷也没有边界。

### B. 桥接入口严格解析与 WebView 最小权限

在 Native/WebView 边界新增无运行时依赖的纯解析模块，验证消息大小、类型和项目内容；同时收紧 WebView 导航、文件访问和混合内容权限。无效消息保持当前场景和项目不变。该方案覆盖根因，且能用 Node 行为测试直接验证。

### C. 重写双向协议

为 Native 与场景双方引入完整 schema 库、版本协商和生成代码。长期扩展性更强，但当前只有五种场景消息，依赖与迁移成本超过本轮成熟度收益。

采用方案 B。

## 组件设计

### `services/furnishSceneBridge.ts`

新增纯模块并导出：

- `MAX_FURNISH_SCENE_MESSAGE_LENGTH = 256_000`
- `MAX_FURNISH_SCENE_FURNITURE = 256`
- `parseFurnishSceneMessage(raw, currentProject)`
- `isAllowedFurnishNavigation(url)`

解析结果是显式联合类型：

```ts
type FurnishSceneMessageParseResult =
  | { ok: true; message: FurnishSceneMessage }
  | { ok: false; reason: "too-large" | "invalid-json" | "invalid-message" };
```

验证规则：

- 原始字符串超过 256,000 个 UTF-16 code units 时，不执行 `JSON.parse`。
- `SCENE_READY` 只接受对象消息。
- `FURNITURE_SELECTED` 只接受 `null` 或长度不超过 128 的非空 ID。
- `SCENE_ERROR` 与 `SCENE_NOTICE` 只接受 1–240 字符的文本。
- `PROJECT_CHANGED` 的项目 ID、房间 ID 必须与当前项目一致，家具数组不得超过 256 项。
- 项目通过现有 `recoverFurnishProject` 逐项校验；只要有家具被丢弃，就拒绝整条消息并保留当前项目。越界坐标等可安全修正字段使用恢复结果。
- 返回项目始终使用当前 `roomMesh` 和合法本地同步状态。

### Mock 预览一致性

Native 比较当前项目与场景返回项目的视觉布局。比较字段包括家具 ID、资产、模型、类别、位置、旋转和缩放；`locked` 不改变概念图内容。

- 视觉布局未变化：保留仍然合法的 Mock 预览。
- 添加、删除、移动、旋转或缩放家具：移除旧预览。

`FurnishStudioScreen` 不再把旧 `activeProject.renderPreview` 无条件补回场景返回项目。

### `components/FurnishWebView.tsx`

- 使用 `parseFurnishSceneMessage` 后再分发回调。
- 无效消息不调用 `onProjectChanged`，不修改 `sceneReady`，不显示全屏错误覆盖层。
- 每次 WebView 实例最多通过 `onSceneNotice` 提示一次“已忽略异常的 3D 场景消息，当前布局未保存”，避免异常消息刷屏。
- WebView 重建时重置该提示状态。
- 顶层导航只允许 `about:blank` 与内嵌 `data:text/html`。
- `allowFileAccess`、`allowFileAccessFromFileURLs`、`allowUniversalAccessFromFileURLs` 设为 `false`。
- `mixedContentMode` 设为 `never`，多窗口支持关闭。

家具模型正常路径仍是 Native 读取后生成的 `data:model/gltf-binary;base64`。无法读取为 base64 的模型继续走既有占位模型降级，因此收紧文件访问不会删除用户布局。

## 数据流

```text
WebView postMessage 字符串
  -> 长度检查
  -> JSON.parse
  -> 消息类型检查
  -> PROJECT_CHANGED 当前项目与家具校验
  -> 视觉布局变化时移除过期 Mock 预览
  -> React 回调
  -> Zustand 内存状态
  -> 现有防抖与串行 AsyncStorage 保存
```

任一步失败：

```text
忽略消息
  -> 保留当前项目与场景
  -> 最多提示一次
  -> 不写入设备
```

## 测试与验收

### 自动化行为测试

- 正常五类消息全部通过并保持类型安全。
- 非 JSON、未知类型、空文本、超长文本和 256,001 字符载荷被拒绝。
- 伪造项目 ID、房间 ID、损坏家具和超过 256 件家具被拒绝。
- 合法越界坐标被限制回当前房间。
- 添加、删除、移动、旋转或缩放家具会移除旧 Mock 预览；只改变锁定状态仍保留预览。
- 外部 `http`、`https`、`file` 与自定义 scheme 导航被拒绝，`about:blank` 和内嵌 HTML 被允许。
- 组件契约确认无效消息不触发全屏场景错误，WebView 使用最小权限。

### Android 模拟器

- 构建并安装当前 Debug APK。
- 正常打开已有软装项目，确认本地 Three.js 与 GLB/占位降级仍可用。
- 通过 `adb shell input` 完成打开家具列表、添加家具、自动保存、返回与重新进入。
- 确认详情与 Library 的家具数量更新，布局变化后旧 Mock 状态不再被保留。
- 检查 React Native、AndroidRuntime 与 Chromium 错误日志。

## 完成标准

- 新增行为测试先失败、实现后通过。
- Mobile 全套、TypeScript、Expo 配置、全仓契约、后端与格式检查通过。
- Android 原生构建成功，API 34 模拟器现有软装流程通过。
- 文档只记录实际观察到的结果。
- 提交可独立回退并推送公开 `main`，四个 CI job 全部成功。
