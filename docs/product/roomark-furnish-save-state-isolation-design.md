# Roomark Android 软装保存状态隔离设计

日期：2026-07-30

范围：现有 Android 软装项目的保存反馈、失败重试与并发状态

## 目标

在不改变软装页面、AsyncStorage 键、项目结构、保存顺序和用户操作流程的前提下，把“正在保存”和“保存失败”从全局状态改为按 `roomId` 隔离。

完成后：

- 一个房间保存失败，只在该房间显示现有“重试保存”入口。
- 另一个房间保存成功，不会清除前一个房间的失败。
- 不同房间并发保存时，每个房间独立显示在途状态。
- 同一房间有多次排队保存时，只有该房间全部保存完成后才清除在途状态。
- 现有串行写入队列继续保证设备写入顺序。

## 当前问题

软装项目和读取状态已经按房间隔离：

- `projectsByRoomId`
- `loadingRoomIds`
- `recoveryWarningsByRoomId`

但保存状态仍然是全局字段：

```ts
saveError?: string;
pendingSave: boolean;
```

`FurnishStudioScreen` 无论当前打开哪个房间，都读取这两个全局字段。因此存在四类错误：

1. A 房间保存失败后，进入 B 房间也会显示“重试保存”。
2. B 房间保存成功会把 A 房间仍未解决的错误清除。
3. A 房间仍在保存时，B 房间的重试按钮也会被禁用。
4. 同一房间的两次保存重叠时，第一次结束可能提前清除“正在保存”。

`retrySave(roomId)` 本身接受房间 ID，但页面显示的错误没有房间归属，导致提示与重试对象可能不一致。

## 方案比较

### 方案 A：页面本地保存状态

每个 `FurnishStudioScreen` 自己维护错误和在途状态。

优点：

- 页面代码直观。
- 不需要扩大 Zustand 状态。

缺点：

- 页面卸载后失败状态丢失。
- 后台保存完成或失败时，原页面可能已经不存在。
- 重试和串行队列仍由 Store 管理，状态所有权被拆成两处。

不采用。

### 方案 B：统一的 `saveStateByRoomId` 对象

Store 为每个房间保存 `{ pendingCount, error }`。

优点：

- 所有保存状态集中在一个结构。
- 计数可以直接进入 Zustand。

缺点：

- 页面会接触内部计数，而页面只需要布尔值和错误。
- 每次保存都要创建嵌套状态对象，接口比现有读取隔离模式更复杂。
- 暴露计数会扩大未来误用范围。

不采用。

### 方案 C：错误映射、在途房间集合和内部计数

Store 暴露：

```ts
saveErrorsByRoomId: Partial<Record<string, string>>;
pendingSaveRoomIds: Partial<Record<string, true>>;
```

模块内部维护：

```ts
const pendingSaveCountsByRoomId = new Map<string, number>();
```

页面只选择当前 `roomMesh.id` 的错误和在途布尔值。计数只用于保证同一房间多次保存的状态结算正确。

优点：

- 与 `loadingRoomIds` 和 `recoveryWarningsByRoomId` 的既有结构一致。
- 页面只得到所需的当前房间状态。
- 同时覆盖跨房间和同房间并发。
- 不改变存储服务、队列、项目数据或 UI。

缺点：

- Store 内需要两个小型计数辅助函数。

采用方案 C。

## 状态模型

`FurnishState` 删除：

```ts
saveError?: string;
pendingSave: boolean;
```

增加：

```ts
saveErrorsByRoomId: Partial<Record<string, string>>;
pendingSaveRoomIds: Partial<Record<string, true>>;
```

初始值均为空对象。

模块内部计数不持久化，不进入产品数据：

```ts
const pendingSaveCountsByRoomId = new Map<string, number>();
```

它只表示当前应用进程中已进入保存队列但尚未结算的调用数量。

## 保存状态流

调用 `saveProject(project)` 时：

1. 继续生成带当前 `updatedAt` 和 `syncState: "local"` 的项目。
2. 继续立即把项目放入 `projectsByRoomId[roomId]`，保留现有内存草稿行为。
3. 增加该房间的在途计数。
4. 把 `pendingSaveRoomIds[roomId]` 设为 `true`。
5. 继续通过现有全局串行队列调用 `saveFurnishProject`。

保存成功：

1. 只删除 `recoveryWarningsByRoomId[roomId]`。
2. 只删除 `saveErrorsByRoomId[roomId]`。
3. 不改变其他房间的错误。

保存失败：

1. 只写入 `saveErrorsByRoomId[roomId]`。
2. 保留当前内存项目，供现有 `retrySave(roomId)` 重试。
3. 不改变其他房间的错误。

无论成功或失败：

1. 减少该房间的在途计数。
2. 计数仍大于零时保留 `pendingSaveRoomIds[roomId]`。
3. 计数归零时删除该房间的在途标记和内部计数项。

## 页面接入

`FurnishStudioScreen` 改为选择当前房间：

```ts
const saveError = useFurnishStore(
  (state) => state.saveErrorsByRoomId[roomMesh.id]
);
const pendingSave = useFurnishStore(
  (state) => state.pendingSaveRoomIds[roomMesh.id] ?? false
);
```

页面同时选择现有 `retrySave`。`handleRetrySave` 在当前页面仍持有 `pendingProjectRef` 时继续刷新该草稿；如果失败发生在页面卸载后、重新进入时本地引用已经不存在，则调用 `retrySave(roomMesh.id)` 保存 Store 中该房间的最新项目。这样重进后的错误提示仍有真实可用的重试动作。

现有按钮、可见文案、无障碍标签和禁用状态保持不变。

## 并发不变量

### 不同房间

当 A 和 B 同时保存：

- 两个房间都进入 `pendingSaveRoomIds`。
- A 失败后只留下 A 的错误。
- B 继续显示保存中。
- B 成功后只清除 B 的错误和在途状态。
- A 的错误保留到 A 自己重试成功。

### 同一房间

当 A 的两次保存依次进入队列：

- 计数从 0 变为 2。
- 第一次完成后计数为 1，A 仍显示保存中。
- 第二次完成后计数为 0，才删除 A 的在途状态。

### 队列

继续使用一个 `furnishPersistenceQueue` 串行设备写入。状态隔离不允许不同房间绕过队列并发写 AsyncStorage，也不增加写入超时，避免不可取消的旧写入迟到覆盖新数据。

## 错误处理

- 保存失败继续返回 `false`。
- 保存成功继续返回 `true`。
- 现有页面退出保护继续在失败时阻止离开。
- 现有“重试保存”继续调用 `retrySave(roomMesh.id)`。
- 不新增错误类型、错误页面或恢复入口。

## 自动化测试

扩展真实 Zustand Store 行为测试，使用可控的存储 Promise：

1. A、B 同时保存时，两者均显示在途。
2. A 失败后，只有 A 有错误，B 仍在途。
3. B 成功后，A 的错误仍保留，两个房间均不在途。
4. A 重试成功后，只清除 A 的错误。
5. 同一房间两次保存时，第一次完成后仍保持在途，第二次完成后才清除。
6. 页面本地待保存引用不存在时，重试动作回退到 `retrySave(roomMesh.id)`。

更新源码契约，固定：

- Store 使用两个按房间映射。
- 页面用 `roomMesh.id` 选择保存错误和在途状态。
- 不再存在全局 `saveError` 或 `pendingSave` 字段。

## 运行环境验证

API 34 模拟器不注入生产测试开关，也不伪造 AsyncStorage 写入失败。正常路径验证：

- 保留数据覆盖安装。
- 样例房型 4 件家具和现有布局恢复。
- 对布局进行一次现有保存操作并返回房源库。
- 再次进入时布局仍可恢复。
- React Native、AndroidRuntime 与 Chromium 错误日志为 0。

跨房间失败与并发结算由真实 Promise Store 行为测试提供主要证据。

## 范围边界

本轮不改变：

- 产品页面和导航。
- 软装项目 schema、AsyncStorage 键和恢复规则。
- 350ms 防抖、应用后台刷新和退出前保存。
- 3D 场景、家具模型、Mock 概念图和产品状态协议。
- Android 权限、签名、版本和发布配置。
- 账号、云同步、社区、合同分析、真实自动扫描或真实图片生成。

## 完成标准

- 红灯测试能复现全局保存状态泄漏或提前清除。
- 保存错误和在途状态按 `roomId` 隔离。
- 同房间多次保存的在途状态按计数正确结算。
- 现有保存队列、失败重试和退出保护不回归。
- Mobile 全量测试、TypeScript、Expo 配置和 Android 构建通过。
- API 34 正常保存与恢复回归通过。
- 全仓公开内容、Web、后端和容器 CI 通过。
- 模拟器结果不替代物理设备写入故障、存储压力和厂商系统验收。
