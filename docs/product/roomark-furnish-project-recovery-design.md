# Roomark Android 软装草稿损坏恢复设计

状态：用户已授权循环任务内自行确认，本设计已确认  
日期：2026-07-30  
范围：现有 Android 3D 软装草稿的本地读取、校验、恢复与用户提示

## 目标

当 AsyncStorage 中的软装草稿被截断、字段损坏、包含重复家具或保留了过期房型时，Roomark 不应把不可信数据直接交给 WebView。应用应优先保留仍可安全使用的家具布局，使用当前房源的房型数据，并向用户说明发生了恢复。

该增量只提高现有软装功能的数据可靠性，不新增产品功能、数据模型版本或云端能力。

## 非目标

- 不新增账号、云同步、知识库、社区、合同分析或新的产品入口。
- 不实现真实自动扫描、真实 AI 效果图或新的 3D 能力。
- 不迁移或批量重写全部本地数据。
- 不在应用预加载草稿时自动写回修复结果。
- 不把一条损坏家具记录升级为整份草稿清空。
- 不把自动化测试或模拟器结果描述为物理真机验收。

## 当前证据与根因

1. `apps/mobile/services/furnishStorage.ts` 的 `isFurnishProject` 只检查项目 ID、房间 ID、`roomMesh` 是否存在、`placedFurniture` 是否为数组以及更新时间是否为字符串。
2. 家具的 `position`、`rotation`、`scale`、`category`、`modelUri`、`locked` 和时间戳均未校验；重复家具 ID 也未处理。
3. `apps/mobile/webview/furnish-scene/sceneHtml.ts` 在恢复时直接读取向量下标并交给 Three.js。缺失或非数组向量会在场景初始化期间抛错，整个 3D 页面进入 `SCENE_ERROR`。
4. 当前读取逻辑用存储中的 `roomMesh` 覆盖传入的当前房型。房源尺寸或来源更新后，旧草稿可以让场景继续使用过期房型。
5. 当前无恢复提示。即使 JSON 解析失败并退回空白项目，用户也无法区分“从未布置”与“草稿损坏后被清空”。

## 方案比较

### 方案 A：整份严格拒绝

任何字段损坏都回退为空白项目。实现最小，但一件家具损坏就会丢失整份可恢复布局，数据保留能力不足。

### 方案 B：选择性恢复

以纯函数逐项校验和规范化家具，保留合法且 ID 唯一的记录，丢弃损坏或重复记录，纠正有限但越界的位置，移除不再可信的效果图预览，并返回恢复提示。这是本轮采用方案。

### 方案 C：只在 WebView 捕获异常

场景出错后显示重试或空白页。该方案没有修复坏数据源，重新打开仍会重复失败，也无法安全保留有效家具。

## 设计

### 1. 纯恢复边界

新增 `apps/mobile/services/furnishProjectRecovery.ts`，只依赖类型定义，提供：

```ts
type FurnishProjectLoadResult = {
  project: FurnishProject;
  recovered: boolean;
  warning?: string;
};

createEmptyFurnishProject(roomMesh: RoomMesh): FurnishProject;
recoverFurnishProject(value: unknown, roomMesh: RoomMesh): FurnishProjectLoadResult;
```

纯模块不访问 AsyncStorage、Zustand 或 WebView，可由 Node 测试直接编译执行。

### 2. 顶层项目规则

以下条件全部满足时才尝试恢复项目内容：

- 值是普通对象。
- `id` 是非空字符串。
- `roomId` 与当前 `roomMesh.id` 完全一致。
- `placedFurniture` 是数组。
- `updatedAt` 是可解析的时间戳。

若任一条件不满足，返回当前房型的空白项目，并提示“软装记录无法读取，已恢复空白布局。”

读取结果始终使用调用方传入的当前 `roomMesh`。存储中的房型只用于判断草稿是否发生过过期或损坏，不再覆盖当前房型。

### 3. 家具恢复规则

每条家具记录必须满足：

- `id`、`assetId`、`modelUri` 是非空字符串。
- `category` 属于现有五类家具。
- `position`、`rotation`、`scale` 都是恰好三个有限数字的数组。
- 三个缩放分量均大于 0 且不超过 10。
- `locked` 是布尔值。
- `createdAt` 是可解析的时间戳。
- `id` 在当前项目中尚未出现。

无效记录和后出现的重复 ID 被丢弃。合法位置的 Y 轴统一为 0；X/Z 按现有场景的 0.15m 边距限制在当前房间范围内。任何丢弃或坐标修正都会把结果标记为已恢复。

恢复输出只包含已知字段，不把未知或污染字段继续传入 WebView。

### 4. 效果图与同步状态

效果图预览必须具备匹配的房间 ID、现有状态值、完整字符串字段、有效生成依据和时间戳。若家具、房型或预览本身被修复，效果图被丢弃，因为它不再能诚实代表当前布局。

`syncState` 仅接受现有四个值；未知值规范化为 `local` 并标记恢复。

### 5. 存储与状态流

`loadFurnishProject` 返回 `FurnishProjectLoadResult`：

```text
AsyncStorage 字符串
  -> JSON.parse
  -> recoverFurnishProject
  -> 安全 FurnishProject + 可选警告
  -> furnishStore 按 roomId 保存项目和警告
  -> FurnishStudioScreen 只把安全项目交给 WebView
```

JSON 解析失败走空白恢复结果。没有存储记录属于正常首次使用，返回空白项目但不显示警告。

预加载阶段不自动写回。用户后续正常编辑、保存或退出软装页时，现有保存流程会把本次安全结果写回设备，并清除该房间的恢复警告。

### 6. 用户体验

`FurnishStudioScreen` 从 store 读取当前房间的恢复警告，在现有状态区域显示非交互式提示。提示使用 `accessibilityRole="alert"` 和 `accessibilityLiveRegion="polite"`，避免恢复被静默处理。

两种提示：

- 整份无法读取：“软装记录无法读取，已恢复空白布局。”
- 部分可恢复：“部分软装记录已损坏，已保留可恢复的布局。”

保存错误、场景错误和恢复提示保持独立语义。

## 测试与验收

### 自动化行为测试

使用仓库现有 `typescript.transpileModule` 模式直接执行纯恢复模块，证明：

1. 完整项目保留家具和有效预览，但输出使用当前房型。
2. 房间 ID 不匹配或顶层字段损坏时回退为空白并返回完整恢复提示。
3. 混合草稿保留合法家具，丢弃坏记录和重复 ID，并把越界坐标限制到房间内。
4. 家具或房型发生恢复时，旧效果图被丢弃。
5. 输入对象不会被恢复函数原地修改。

### 集成契约

契约测试证明：

- `furnishStorage` 使用纯恢复模块并区分“无草稿”与“坏草稿”。
- `furnishStore` 按房间保存恢复警告，成功持久化后清除。
- 软装页显示可访问的恢复提示。

### 发布验证

- Mobile 全部测试、TypeScript 和 Expo 公共配置通过。
- 全仓产品验证和 `git diff --check` 通过。
- Android Debug 原生构建和 Release 离线 JS/资产打包通过。
- API 34 模拟器能打开软装页，且无 React Native 红屏或新的未处理异常。
- 提交可单独回退，推送公开 `main` 后远端 CI 全部通过。

物理真机的存储损坏注入、厂商 WebView 和长时间现场使用继续保留为发布前外部验收门槛。

## 预计修改范围

- `apps/mobile/services/furnishProjectRecovery.ts`
- `apps/mobile/services/furnishStorage.ts`
- `apps/mobile/stores/furnishStore.ts`
- `apps/mobile/screens/FurnishStudioScreen.tsx`
- `apps/mobile/tests/furnish-project-recovery.test.cjs`
- `apps/mobile/tests/furnish-contract.test.cjs`
- `apps/mobile/README.md`
- `docs/product/roomark-android-verification.md`

## 完成标准

- 红灯测试确实证明当前实现会接纳损坏嵌套数据。
- 修复后只有经过校验和规范化的数据能进入 WebView。
- 合法家具尽量保留，坏家具不会导致整页失效。
- 当前房型始终是场景权威来源。
- 用户能获知恢复发生，成功保存后警告清除。
- 全仓、Android 构建、模拟器和远端 CI 均有本轮真实证据。

