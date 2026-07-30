# Roomark Android 3D 静态资产复用设计

日期：2026-07-30

## 目标

在不改变现有软装功能、WebView 权限边界或离线能力的前提下，避免每次进入软装页、手动重试和 renderer 自动恢复时重复读取 3D 运行时与重复编码家具 GLB，降低第二次进入和异常恢复的宿主侧准备成本。

## 当前问题

`FurnishWebView` 每次挂载都会执行以下工作：

1. 通过 Expo Asset 定位约 1 MB 的内置 Three.js 运行时。
2. 通过 FileSystem 把运行时完整读取为字符串并拼装场景 HTML。
3. 定位 5 个内置 GLB，并逐个读取为 Base64 数据 URI。
4. renderer 恢复时再次读取运行时；离开并重新进入软装页时再次处理运行时和全部 GLB。

当前 5 个 GLB 合计约 2.19 MB，其中沙发约 1.98 MB。Base64 转换会产生额外字符串分配。资源内容在同一应用进程内不会变化，因此重复文件读取和编码没有产品价值。

## 方案比较

### 方案 A：继续使用组件本地状态

只在单个 `FurnishWebView` 实例中保留当前结果。实现最少，但无法覆盖离开后重新进入，renderer 重建仍会重复读取运行时，不满足目标。

### 方案 B：允许 WebView 直接访问本地文件

把 GLB 和运行时作为文件 URL 交给 WebView。可减少 Base64，但需要重新开放文件访问或扩大导航能力，会削弱已经建立的 WebView 信任边界，也增加 Android 版本和厂商 WebView 兼容性风险。

### 方案 C：独立的进程级可重试缓存

新增一个静态资产服务，缓存成功的运行时 HTML、成功的 GLB Base64 URI 和进行中的 Promise。并发调用共享同一读取；失败会清除对应缓存，使手动重试仍能重新访问设备文件。`FurnishWebView` 只消费服务结果并继续使用现有内联 HTML、`data:` URI 和最小权限配置。

采用方案 C。

## 架构

新增 `services/furnishAssetCache.ts`，承担两个边界明确的职责：

- `loadFurnishSceneHtml()`：定位并读取内置运行时，生成场景 HTML；同一进程只保留成功结果。
- `resolveFurnishModelUris()`：按模型键解析内置 GLB；成功的 Base64 数据 URI 按模型缓存，并发解析复用在途 Promise。

静态 `require()` 映射仍留在 `FurnishWebView`，确保 Metro 能发现所有打包资产。服务接收运行时模块 ID 和模型模块映射，不在内部引入动态资源路径。

服务不持有 React 状态，不依赖具体房间或项目，也不保存用户数据。

## 数据流

```text
FurnishWebView 挂载或 renderer 重建
  -> loadFurnishSceneHtml(runtimeModule)
     -> 命中成功缓存：直接返回
     -> 命中在途 Promise：等待同一读取
     -> 未命中：Asset.loadAsync -> FileSystem.readAsStringAsync -> 生成 HTML
  -> resolveFurnishModelUris(modelModules)
     -> 每个模型独立命中、等待或读取
     -> 成功读取：缓存 Base64 data URI
     -> 读取失败：返回现有本地 URI 或原路径作为降级，不缓存失败结果
  -> WebView 按现有协议收到 INIT_PROJECT
```

成功缓存仅在应用进程内存在。系统结束进程后自然释放，不写入 AsyncStorage，也不改变安装包内容。

## 错误处理

- 运行时定位、读取或 HTML 生成失败时，删除运行时在途缓存并向调用方抛出错误；现有“本地 3D 运行时读取失败，请点击重试”流程继续处理。
- 模型 Base64 读取失败时，保留当前本地 URI 降级提示；该失败不进入成功缓存，下次进入或重试会再次尝试。
- 模型定位失败时返回原模型路径并继续使用现有占位模型降级；该失败同样不缓存。
- 一个模型失败不影响其他模型的成功缓存。
- 不缓存通知回调或页面状态，避免旧页面接收新页面的提示。

## 测试

新增真实服务行为测试，使用受控的 Asset、FileSystem 和 HTML 生成器：

1. 运行时并发与连续读取只执行一次文件读取。
2. 运行时首次失败后，第二次调用重新读取并可成功。
3. 同一模型的并发与连续解析只执行一次 Base64 读取。
4. 模型读取失败不污染缓存，后续调用会重试。
5. 不同模型分别缓存，一个模型失败不影响其他模型。
6. `FurnishWebView` 契约确认使用新服务，同时继续保留文件访问关闭、内联导航和现有错误入口。

## 验收

- Mobile 测试、TypeScript、Expo 配置和全仓产品验证通过。
- `app:assembleDebug` 与 release JavaScript bundle 构建通过。
- API 34 模拟器首次进入仍能加载全部现有模型和已保存布局。
- 返回 Library 后再次进入同一房间，场景与布局正常恢复。
- renderer 自动恢复和手动重试继续可用，失败不会被永久缓存。
- React Native、AndroidRuntime 与 Chromium 错误日志为 0。

## 非目标

- 不引入新的家具、页面、入口或用户设置。
- 不改变 350ms 保存、防损坏恢复、Mock 概念图或产品状态协议。
- 不开放 WebView 文件访问、网络资源或 DOM Storage。
- 不宣称解决物理手机上的最终内存、温度或厂商 WebView 兼容性验收。
