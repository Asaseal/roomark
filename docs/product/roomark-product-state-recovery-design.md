# Roomark Android 产品状态损坏恢复设计

状态：用户已授权循环任务内自行确认，本设计已确认  
日期：2026-07-30  
范围：现有 Android 房源、对比、地图、扫描与详情状态的本地读取和恢复

## 目标

当 `roomark:mobile:product-state:v1` 中某个房源的嵌套字段损坏、旧目录字段过期、比较列表包含坏引用，或整个 JSON 异常时，Roomark 应阻止不可信数据进入页面和软装预加载，同时尽量保留仍合法的用户状态与扫描记录。

该增量只提高现有本地优先产品流程的数据可靠性，不新增产品能力、字段或云端迁移。

## 非目标

- 不新增知识库、账号、云同步、社区、合同分析或新的编辑入口。
- 不实现真实自动扫描、真实 AI 效果图或新的地图能力。
- 不改变 `ProductState` schemaVersion。
- 不把目录升级造成的合法内容变化误当成必须回退的错误。
- 不在 hydrate 阶段自动写回恢复结果。
- 不把模拟器验证描述为物理真机验收。

## 当前证据与根因

1. `apps/mobile/services/productStorage.ts` 只检查 schemaVersion、`propertiesById` 是否为对象和 `comparisonIds` 是否为数组。
2. `mergeProductStateWithCatalog` 把存储中的完整房源和 `roomMesh` 覆盖当前目录，没有校验字符串、坐标、房间尺寸、风险数组、计数、布尔状态或时间。
3. 实际执行当前函数时，存储中的 `inspection: "broken"` 和 `roomMesh.width: "broken"` 会原样进入合并结果。
4. `RoomDetailScreen` 随后执行 `profile.inspection.filter(...)`，稳定抛出 `TypeError`；同一污染记录还会影响 Library、Compare、Map 和 Furnish 的读取。
5. 内置目录记录被完整持久化后，旧版本目录内容会长期覆盖新版本目录，产品文案、风险和尺寸修正不能自然生效。
6. 当前契约测试只搜索“有 merge、有 catch、有回退文案”，没有执行真实恢复行为。

## 方案比较

### 方案 A：任一坏字段整份重置

最安全、实现最短，但一个扫描记录损坏会清空所有收藏、比较和其他合法扫描结果，数据保留能力不足。

### 方案 B：按记录恢复

当前目录作为内置房源不可变内容的权威来源；逐项保留合法用户状态，严格校验非目录扫描记录，清理比较和选择引用，并区分整份与部分恢复提示。这是本轮采用方案。

### 方案 C：页面防御

在每个页面给数组、字符串和数字加默认值。它会复制防御逻辑，污染状态仍会继续写回并进入其他页面，不能解决根因。

## 设计

### 1. 纯恢复模块

新增 `apps/mobile/services/productStateRecovery.ts`，只依赖类型定义，提供：

```ts
type ProductStateLoadResult = {
  state: ProductState;
  recoveredFromError: boolean;
  message?: string;
};

createInitialProductStateFromCatalog(
  catalog: PropertyRecord[],
  now?: string
): ProductState;

recoverProductState(
  value: unknown,
  catalog: PropertyRecord[],
  now?: string
): ProductStateLoadResult;
```

模块不访问 AsyncStorage、Zustand 或 React Native，可由 Node 行为测试直接编译执行。

### 2. 原始载荷边界

`productStorage` 在 JSON.parse 前拒绝超过 2,000,000 个 UTF-16 code units 的字符串，避免异常大状态继续占用解析和恢复资源。没有存储记录属于正常首次使用，不显示错误。

JSON 解析失败、schemaVersion 不匹配、顶层状态不是对象、`propertiesById` 不是普通对象或 `comparisonIds` 不是数组时，整份回退当前目录，提示：

> 本地记录无法读取，已恢复设备内置房源。

### 3. 内置目录房源

对目录中已存在的房源：

- 当前 `propertyCatalog` 的标题、成本、通勤、风险、检查项、坐标和 `roomMesh` 始终为权威内容。
- 存储中的旧目录副本不会覆盖当前目录，也不会仅因内容版本不同显示损坏提示。
- 只从存储中恢复现有用户状态：
  - `hasVisited`
  - `hasScan`
  - `isFavorite`
  - 可选 `hasFurnishLayout`
  - 可选 `renderStatus`
  - 可选 `renderUpdatedAt`
- 每个可变字段独立校验；坏字段使用当前目录或 `undefined`。
- 同时对存储记录执行完整结构校验。完整结构损坏时显示部分恢复提示，但仍保留其中合法的可变字段。

这样既允许应用升级目录，又不会因为一个旧嵌套字段损坏而丢失收藏或已扫描状态。

### 4. 非目录扫描记录

不存在于当前目录的房源只能作为现有模拟扫描/户型图记录恢复，必须完整满足 `PropertyRecord`：

- ID、标题和所有展示字符串非空且长度有界。
- 房型 ID 与房源 ID 一致，来源属于现有枚举，尺寸是有限正数，捕获时间有效。
- 经纬度有限且分别位于 `[-90, 90]`、`[-180, 180]`。
- 布尔状态类型正确。
- 通勤分钟、风险计数和待确认计数是非负有限整数。
- `inspection` 是数组；每项的标签、说明和状态有效。
- 风险计数与 `inspection` 实际状态一致。
- 可选软装与效果图状态有效。
- 字典 key 与房源 ID 一致且 ID 唯一。

不满足条件的非目录记录被丢弃，并触发部分恢复提示。合法扫描记录完整保留。

### 5. 顶层引用恢复

- `comparisonIds` 只保留非空字符串、现存房源和第一次出现的 ID。
- `selectedPropertyId` 只在它是现存房源 ID 时保留。
- `updatedAt` 必须是有效时间；否则使用本次恢复传入的 `now`。
- 任一删除、去重、回退或时间修正都返回：

> 部分本地记录已损坏，已保留可恢复内容。

恢复函数不修改输入对象。

### 6. 存储与界面

```text
AsyncStorage 字符串
  -> 原始长度检查
  -> JSON.parse
  -> recoverProductState
  -> 安全 ProductState + 可选提示
  -> productStore hydrate
  -> Library / Detail / Compare / Map / Furnish
```

现有 `hydrationError` 和 Library 的无障碍 alert 继续承载恢复提示，不新增 UI 组件。用户下一次收藏、比较、扫描、选择或软装状态保存时，现有串行队列会写回安全状态。

## 测试与验收

### 自动化行为测试

直接执行纯恢复模块，证明：

1. 有效内置记录使用当前目录内容，同时保留合法用户状态。
2. 损坏的内置记录不能把字符串检查项或坏尺寸带入页面，合法收藏状态仍保留。
3. 合法非目录扫描记录保留；损坏记录被丢弃。
4. 比较 ID 去重并过滤坏引用，坏选择 ID 被移除，坏时间被修正。
5. 顶层损坏走整份目录回退。
6. 输入对象不被修改。

### 集成契约

契约测试证明：

- `productStorage` 使用纯恢复模块。
- 过大载荷在 JSON.parse 前回退。
- 现有完整恢复和部分恢复文案继续进入 `hydrationError`。
- 旧的浅层 spread 合并不再存在。

### Android 模拟器

在 API 34 模拟器中：

1. 备份完整 `RKStorage`。
2. 把一个内置房源的 `inspection`、`roomMesh.width` 和月租改成错误类型，同时保留有效收藏标志。
3. 启动应用，确认 Library 不崩溃并显示部分恢复提示。
4. 打开详情、地图和软装，确认使用当前目录的合法数据。
5. 强制停止应用，恢复原 SQLite 文件，再次启动确认原状态完整返回。

所有注入必须可逆；无法安全恢复时不执行。物理真机继续保留为正式发布前门槛。

## 预计修改范围

- `apps/mobile/services/productStateRecovery.ts`
- `apps/mobile/services/productStorage.ts`
- `apps/mobile/tests/product-state-recovery.test.cjs`
- `apps/mobile/tests/product-storage-contract.test.cjs`
- `apps/mobile/README.md`
- `docs/product/roomark-android-verification.md`

## 完成标准

- 红灯行为测试能够复现坏嵌套字段穿透当前恢复层。
- 修复后所有页面只接收结构有效的 `PropertyRecord`。
- 当前目录更新不再被旧存储副本覆盖。
- 单条坏记录不清空其他合法记录。
- 用户获得准确、可访问的部分或完整恢复提示。
- 全仓、Android 构建、可逆模拟器注入和远端 CI 均有本轮真实证据。

