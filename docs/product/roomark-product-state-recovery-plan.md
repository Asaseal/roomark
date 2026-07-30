# Roomark Android 产品状态损坏恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 阻止损坏或过期的本地房源状态进入 Android 页面，同时保留合法用户状态、扫描记录和顶层引用。

**Architecture:** 无运行时依赖的纯恢复模块负责目录权威合并、内置记录可变字段恢复、扫描记录严格校验与顶层引用清理。AsyncStorage 只负责载荷大小、读取、解析和写入；现有 Zustand hydrate 与 Library alert 继续承载结果。

**Tech Stack:** React Native 0.74、Expo SDK 51、TypeScript 5.3、Zustand、AsyncStorage、Node `node:test`。

---

### Task 1: 建立产品状态恢复红灯行为测试

**Files:**
- Create: `apps/mobile/tests/product-state-recovery.test.cjs`
- Test: `apps/mobile/tests/product-state-recovery.test.cjs`

- [ ] **Step 1: 创建纯模块加载器和完整测试房源**

测试使用仓库现有 `typescript.transpileModule` 模式加载 `services/productStateRecovery.ts`。定义包含完整 `PropertyRecord` 字段的 `catalogProperty`，并用 `createStoredState(overrides)` 生成 schemaVersion 1 状态。

- [ ] **Step 2: 测试目录权威与用户状态保留**

写入测试：存储记录使用旧标题和旧尺寸但结构仍合法，`isFavorite` 与 `hasFurnishLayout` 为 true。期望结果使用当前目录标题和房型，同时保留两个用户状态，不显示恢复提示，输入快照保持不变。

- [ ] **Step 3: 测试损坏内置记录的选择性恢复**

把存储记录改为：

```js
{
  ...validStoredProperty,
  monthlyRent: 4800,
  roomMesh: { ...validStoredProperty.roomMesh, width: "broken" },
  inspection: "broken",
  isFavorite: true
}
```

期望：

```js
assert.equal(result.recoveredFromError, true);
assert.equal(result.message, "部分本地记录已损坏，已保留可恢复内容。");
assert.equal(result.state.propertiesById[catalogProperty.id].monthlyRent, catalogProperty.monthlyRent);
assert.equal(result.state.propertiesById[catalogProperty.id].roomMesh.width, catalogProperty.roomMesh.width);
assert.deepEqual(result.state.propertiesById[catalogProperty.id].inspection, catalogProperty.inspection);
assert.equal(result.state.propertiesById[catalogProperty.id].isFavorite, true);
```

- [ ] **Step 4: 测试扫描记录和顶层引用恢复**

加入一个完整合法自建扫描记录和一个 `inspection: null` 的损坏自建记录；比较列表包含重复 ID、坏 ID 和非字符串，选择 ID 指向坏记录，更新时间无效。

期望合法扫描保留、坏扫描删除、比较 ID 唯一且有效、选择 ID 移除、更新时间等于测试传入的固定 `now`，并返回部分恢复提示。

- [ ] **Step 5: 测试顶层损坏整份回退**

把 `propertiesById` 改为数组，期望只返回当前目录、目录默认比较列表和完整恢复提示“本地记录无法读取，已恢复设备内置房源。”

- [ ] **Step 6: 运行并确认红灯**

Run:

```powershell
cd apps/mobile
node.exe --test tests/product-state-recovery.test.cjs
```

Expected: 测试因 `services/productStateRecovery.ts` 尚不存在而失败。

- [ ] **Step 7: 提交红灯测试**

```powershell
git add apps/mobile/tests/product-state-recovery.test.cjs
git commit -m "test(android): cover product state recovery"
```

### Task 2: 实现纯产品状态恢复

**Files:**
- Create: `apps/mobile/services/productStateRecovery.ts`
- Test: `apps/mobile/tests/product-state-recovery.test.cjs`

- [ ] **Step 1: 定义结果、消息和基础校验器**

实现 `ProductStateLoadResult`、两个固定提示、普通对象、非空有界字符串、有效时间、有限数字、非负整数、布尔、枚举与可选字段校验器。

- [ ] **Step 2: 实现 RoomMesh 与 Inspection 校验**

`RoomMesh` 要求 ID 与房源 ID 相同、来源属于 `mock|roomplan|lidar|floorplan`、尺寸为有限正数、时间有效；`inspection` 要求数组项的标签、说明和状态完整。

- [ ] **Step 3: 实现完整 PropertyRecord 校验**

校验所有 `PropertyProfile`、经纬度、三个必需布尔、可选软装/效果图字段，并确认 `highRiskCount` 与 `pendingCount` 等于 inspection 中的实际计数。

- [ ] **Step 4: 实现内置目录记录恢复**

以当前目录房源为返回基线。分别校验并恢复六类可变字段；完整存储记录结构无效时把本轮标记为部分恢复，但不丢弃其中仍合法的可变字段。

- [ ] **Step 5: 实现扫描记录和顶层状态恢复**

只保留完整有效且 key 与 ID 一致的非目录记录。比较 ID 过滤并去重；选择 ID 必须存在；更新时间无效时使用 `now`。顶层结构不合法时调用 `createInitialProductStateFromCatalog`。

- [ ] **Step 6: 运行行为测试与类型检查**

Run:

```powershell
cd apps/mobile
node.exe --test tests/product-state-recovery.test.cjs
npm.cmd run typecheck
```

Expected: 产品状态恢复行为测试全部通过，TypeScript exit 0。

- [ ] **Step 7: 提交纯恢复模块**

```powershell
git add apps/mobile/services/productStateRecovery.ts
git commit -m "fix(android): recover corrupt product state"
```

### Task 3: 接入 AsyncStorage 与更新契约

**Files:**
- Modify: `apps/mobile/services/productStorage.ts`
- Modify: `apps/mobile/tests/product-storage-contract.test.cjs`
- Test: `apps/mobile/tests/product-storage-contract.test.cjs`

- [ ] **Step 1: 把浅层契约改为恢复接入红灯**

契约必须匹配：

```js
assert.match(storage, /recoverProductState/);
assert.match(storage, /MAX_PRODUCT_STATE_LENGTH = 2_000_000/);
assert.match(storage, /storedValue\.length > MAX_PRODUCT_STATE_LENGTH/);
assert.match(storage, /Promise<ProductStateLoadResult>/);
assert.doesNotMatch(storage, /\.\.\.storedProperty/);
```

并检查 `productStateRecovery.ts` 同时包含完整和部分恢复文案。

- [ ] **Step 2: 运行契约并确认红灯**

Run:

```powershell
cd apps/mobile
node.exe --test tests/product-storage-contract.test.cjs
```

Expected: 新接入契约因 storage 仍使用浅层 spread 合并而失败。

- [ ] **Step 3: 重写 productStorage 读取边界**

`createInitialProductState` 委托 `createInitialProductStateFromCatalog(propertyCatalog)`。`loadProductState` 在 parse 前检查长度，解析后调用 `recoverProductState(parsed, propertyCatalog)`；解析、AsyncStorage 或长度异常返回完整恢复结果。删除 `mergeProductStateWithCatalog` 和浅层顶级字段检查。

- [ ] **Step 4: 运行目标测试和 Mobile 验证**

Run:

```powershell
cd apps/mobile
node.exe --test tests/product-state-recovery.test.cjs tests/product-storage-contract.test.cjs
npm.cmd run verify
```

Expected: 目标测试和 Mobile 全套通过，页面契约没有回归。

- [ ] **Step 5: 提交存储接入**

```powershell
git add apps/mobile/services/productStorage.ts apps/mobile/tests/product-storage-contract.test.cjs
git commit -m "fix(android): validate persisted product records"
```

### Task 4: 文档、原生构建和模拟器可逆验收

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `docs/product/roomark-android-verification.md`
- Verify: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 1: 记录恢复边界**

README 说明当前目录是内置房源权威来源、合法扫描记录按条恢复、坏引用被过滤。验证记录只写入本轮真实测试、构建和模拟器证据。

- [ ] **Step 2: 运行全仓门禁与 Android 构建**

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/product-verify.ps1 -Full
git diff --check
$env:JAVA_HOME='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\jdk17-portable\jdk-17.0.19+10'
$env:ANDROID_HOME='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
cd apps/mobile/android
.\gradlew.bat app:assembleDebug app:createBundleReleaseJsAndAssets
```

Expected: 全仓验证和两个 Gradle 任务均成功。

- [ ] **Step 3: 执行可逆损坏注入**

停止应用并备份 API 34 模拟器的 `/data/data/com.roomark.app/databases/RKStorage`。只修改 `roomark:mobile:product-state:v1` 中一个内置房源的嵌套类型；保留其他记录和有效收藏标志。

- [ ] **Step 4: 验证现有页面**

启动本轮 Debug APK，确认 Library 显示部分恢复提示且房源数据可读；打开详情、地图和软装，确认没有 React Native 红屏、AndroidRuntime 或 Chromium 错误，且页面使用当前目录的合法值。

- [ ] **Step 5: 恢复数据库并复测**

强制停止应用，恢复原 SQLite、属主和权限，删除 journal 后重启。确认恢复提示消失、原比较与房源状态返回。删除主机临时备份并停止本轮 Metro。

- [ ] **Step 6: 提交文档证据**

```powershell
git add apps/mobile/README.md docs/product/roomark-android-verification.md
git commit -m "docs(android): record product state recovery"
```

### Task 5: 最终发布与远端核验

**Files:**
- Verify: repository-wide maintained surfaces
- Publish: `public-main` to `origin/main`

- [ ] **Step 1: 最终完整验证**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/product-verify.ps1 -Full
git diff --check
git status --short
```

Expected: 所有门禁通过且工作区干净。

- [ ] **Step 2: 核对提交范围并推送**

```powershell
git log --oneline origin/main..HEAD
git diff --name-only origin/main...HEAD
git push origin public-main:main
```

Expected: 只有本轮规格、测试、恢复实现和验证文档，推送成功。

- [ ] **Step 3: 等待 CI**

```powershell
$headSha = git rev-parse HEAD
$run = gh run list --repo Asaseal/roomark --limit 10 --json databaseId,name,status,conclusion,headSha,url |
  ConvertFrom-Json |
  Where-Object { $_.name -eq 'CI' -and $_.headSha -eq $headSha } |
  Select-Object -First 1
if (-not $run) { throw "CI run not found for $headSha" }
gh run watch $run.databaseId --repo Asaseal/roomark --exit-status --interval 5
```

Expected: public-content、backend、mobile 和 container 全部成功，本地 HEAD 与 `origin/main` SHA 一致。

