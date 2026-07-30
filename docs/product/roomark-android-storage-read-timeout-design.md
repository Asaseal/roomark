# Roomark Android 本地存储读取超时保护设计

日期：2026-07-30

## 目标

在不改变现有产品功能、正常数据恢复结果、持久化格式和页面流程的前提下，为 Android 本地产品状态与软装项目读取增加统一的时间上限。即使底层 `AsyncStorage.getItem` 永久不返回，Roomark 也必须在有限时间内：

- 结束首页“正在恢复看房记录”状态。
- 使用现有设备内置房源打开房源库，并显示现有恢复提示。
- 结束对应软装项目的加载状态。
- 使用现有空白软装布局打开工作室，并显示现有恢复警告。
- 忽略超时后迟到的读取结果，避免旧数据在用户已经开始操作后突然进入状态。

## 当前问题

现有读取链路能处理抛错、损坏 JSON、异常结构和超大载荷，但没有处理“Promise 永久 pending”：

```text
App
  -> productStore.hydrate()
     -> productStorage.loadProductState()
        -> AsyncStorage.getItem() 永久 pending
  -> hydrated 永远为 false
  -> 首页永久停留在恢复页
```

软装项目在 App 启动后按房间预载。`furnishStore.loadProject()` 的 `finally` 只有在读取完成或拒绝后才会移除 `loadingRoomIds`；底层读取永久 pending 时，对应项目也永远处于加载状态。

这两条链路都属于已有本地恢复能力，不需要新增页面或业务功能。

## 方案比较

### 方案 A：只在 App 启动层增加超时

在 `useEffect` 中对 `hydrate()` 使用 `Promise.race`，超时后直接显示 Library。

优点是改动最少。缺点是底层读取仍在运行，迟到后仍可调用 store `set` 覆盖当前状态；软装项目读取也没有保护。该方案只隐藏启动症状，没有修复存储边界。

### 方案 B：在存储服务层统一限制读取时长

新增一个与 React、Zustand 和 AsyncStorage 解耦的异步操作保护器。产品状态与软装项目的 `getItem` 都通过该保护器执行，默认上限为 8 秒：

- 正常完成时立即清理计时器并返回原结果。
- 原操作拒绝时立即清理计时器并透传原错误。
- 到达上限时以明确的超时错误拒绝。
- 超时后的迟到成功或失败被忽略，不再改变保护器结果。

产品状态继续使用现有 `recoverProductState(undefined, catalog)`；软装项目继续使用现有 `recoverFurnishProject(undefined, roomMesh)`。因此页面、提示、数据结构和降级结果保持一致。

该方案完整覆盖当前两条读取链路，边界清晰，容易用真实 Promise 行为测试。

### 方案 C：同时限制读取和写入

为 `getItem`、`setItem` 和 `removeItem` 全部增加超时。

AsyncStorage 写入没有取消能力。一次写入被上层判定超时后仍可能在后台完成；如果队列继续执行下一次写入，迟到的旧写入可能覆盖较新的状态。除非同时设计写入序列号、完成确认和重放协调，否则“写入超时后继续重试”会降低数据可靠性。

本轮不采用方案 C。

采用方案 B。

## 架构

### 共享读取保护器

新增 `services/storageOperation.ts`：

- `STORAGE_READ_TIMEOUT_MS = 8_000`：生产读取上限。
- `StorageOperationTimeoutError`：区分超时与底层错误，便于测试和未来诊断。
- `runStorageRead(operation, options?)`：执行一次读取并保证单次结算。

测试可以传入较短的 `timeoutMs`，生产服务只使用默认值。

保护器不导入 AsyncStorage，不知道存储键，也不恢复业务数据。它只负责时间边界和 Promise 结算。

### 产品状态读取

`productStorage.loadProductState()` 把现有 `AsyncStorage.getItem(productStorageKey)` 包装为：

```text
runStorageRead(() => AsyncStorage.getItem(productStorageKey))
```

超时与普通读取错误都进入现有 `catch`，返回设备内置房源和“本地记录无法读取，已恢复设备内置房源。”。`productStore.hydrate()` 随后设置 `hydrated: true`，首页不再永久等待。

### 软装项目读取

`furnishStorage.loadFurnishProject()` 把读取、空值判断和 JSON 恢复放在同一个 `try` 中：

```text
runStorageRead(() => AsyncStorage.getItem(projectKey))
  -> 正常：继续现有空值或严格恢复
  -> 超时 / 拒绝：recoverFurnishProject(undefined, roomMesh)
```

这样 `furnishStore.loadProject()` 总能获得可用结果，现有 `finally` 会清除加载状态，现有恢复警告会写入 `recoveryWarningsByRoomId`。

## 迟到结果与生命周期

保护器内部只允许第一次结算：

1. 创建读取计时器。
2. 启动原始读取 Promise。
3. 读取先完成：清除计时器并返回读取结果。
4. 读取先失败：清除计时器并返回原错误。
5. 计时器先完成：返回 `StorageOperationTimeoutError`。
6. 第 5 步之后原读取才成功或失败：忽略迟到结果。

迟到的原始 AsyncStorage 调用仍可能在原生层结束，但它只是读取，没有写入副作用；它的结果不会进入产品或软装 store。

## 错误处理

- 产品读取超时复用现有全量恢复结果和首页提示，不新增错误文案。
- 软装读取超时复用现有空白布局恢复结果和工作室 alert，不新增错误文案。
- 原始读取错误继续按当前方式恢复。
- JSON 损坏、字段损坏和超大产品状态继续由现有严格恢复模块处理。
- 正常读取不增加人工延迟；计时器在读取结算后立即清理。

## 测试

### 真实 Promise 行为测试

新增 `tests/storage-operation-timeout.test.cjs`，编译并执行真实 TypeScript 模块：

1. 读取在上限前成功时返回原值并只执行一次。
2. 读取在上限前拒绝时透传原错误。
3. 永久 pending 的读取在测试上限后以 `StorageOperationTimeoutError` 拒绝。
4. 超时后原读取迟到成功不会改变已经返回的超时结果。

### 存储契约测试

更新现有契约，确认：

- 产品状态 `getItem` 通过 `runStorageRead`。
- 软装项目 `getItem` 通过 `runStorageRead`。
- `setItem` 和 `removeItem` 不通过读取保护器，避免误把本轮设计扩展到不可取消写入。
- 软装读取失败返回 `recoverFurnishProject(undefined, roomMesh)`。

### Android 模拟器

API 34 模拟器保留现有数据覆盖安装并验证：

- 正常启动仍恢复房源库、比较状态和 4 件软装布局。
- 首页、详情和软装工作室路径不受正常读取保护影响。
- 通过测试构建注入一个只影响读取的受控超时开关，验证首页在 8 秒内进入现有恢复结果；验证后恢复正常构建和原设备数据。

如果为了注入超时必须向生产包保留测试开关，则不执行该注入，改以真实 Promise 自动化测试和正常模拟器回归作为本轮证据。生产代码不保留测试后门。

## 验收

- 新增真实超时行为测试通过。
- Mobile 全量测试、TypeScript 和 Expo 公共配置通过。
- `app:assembleDebug` 与 release JavaScript bundle 构建通过。
- API 34 正常数据启动与 4 件软装布局恢复通过。
- React Native、AndroidRuntime 和 Chromium 错误日志为 0。
- 仓库公开内容、后端和 CI 全部通过。

## 非目标

- 不限制或取消 `setItem`、`removeItem`。
- 不新增设置、手动恢复入口、账号、云同步或后台服务。
- 不改变 AsyncStorage 键、JSON schema、房源目录或软装数据模型。
- 不把模拟器和自动化结果表述为物理设备存储故障验收。
- 不解决操作系统进程被立即终止、磁盘完全损坏或生产签名问题。
