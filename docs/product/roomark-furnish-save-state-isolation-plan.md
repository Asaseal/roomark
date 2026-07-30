# Roomark Android Furnish Save State Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有软装保存错误与保存中状态按 `roomId` 隔离，避免一个房间的失败、成功或并发结算污染另一个房间。

**Architecture:** Zustand Store 暴露 `saveErrorsByRoomId` 和 `pendingSaveRoomIds` 两个按房间映射，内部使用房间计数 Map 处理同房间重叠保存。现有全局串行写入队列、AsyncStorage 服务、项目 schema、页面流程与重试入口保持不变。

**Tech Stack:** TypeScript、React Native 0.74、Zustand、AsyncStorage、Node.js `node:test`、Android Gradle、ADB / UI Automator

---

## 文件结构

- Modify: `apps/mobile/tests/furnish-store-isolation.test.cjs` — 用真实 Store 和可控 Promise 验证跨房间失败隔离及同房间并发计数。
- Modify: `apps/mobile/tests/furnish-contract.test.cjs` — 固定按房间 Store 字段和页面选择器。
- Modify: `apps/mobile/stores/furnishStore.ts` — 保存错误、在途状态和计数按 `roomId` 结算。
- Modify: `apps/mobile/screens/FurnishStudioScreen.tsx` — 只选择当前房间的保存反馈。
- Modify: `apps/mobile/README.md` — 记录保存状态隔离边界。
- Modify: `docs/product/roomark-android-verification.md` — 记录自动化、构建和 API 34 正常路径证据。

### Task 1: 建立保存状态泄漏红灯测试

**Files:**
- Modify: `apps/mobile/tests/furnish-store-isolation.test.cjs`
- Modify: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: 让 Store 测试可控制每次设备写入**

在 `loadStore()` 中增加：

```js
const pendingSaves = [];
```

把 `saveFurnishProject: async () => {}` 替换为：

```js
saveFurnishProject: (project) =>
  new Promise((resolve, reject) => {
    pendingSaves.push({
      project,
      resolve,
      reject
    });
  })
```

并在返回值中暴露：

```js
pendingSaves
```

- [ ] **Step 2: 测试不同房间的失败、成功与重试互不污染**

在 `furnish-store-isolation.test.cjs` 增加：

```js
test("save failure and pending state stay isolated by room", async () => {
  const { store, pendingSaves } = loadStore();
  const studioProject = createProject(studioRoom);
  const backgroundProject = createProject(backgroundRoom);

  const studioSave = store.getState().saveProject(studioProject);
  const backgroundSave = store.getState().saveProject(backgroundProject);

  assert.deepEqual(store.getState().pendingSaveRoomIds, {
    [studioRoom.id]: true,
    [backgroundRoom.id]: true
  });

  await Promise.resolve();
  assert.equal(pendingSaves.length, 1);
  assert.equal(pendingSaves[0].project.roomId, studioRoom.id);
  pendingSaves[0].reject(new Error("studio write failed"));
  assert.equal(await studioSave, false);
  await Promise.resolve();

  assert.deepEqual(store.getState().saveErrorsByRoomId, {
    [studioRoom.id]: "软装布局尚未写入设备，请重试。"
  });
  assert.deepEqual(store.getState().pendingSaveRoomIds, {
    [backgroundRoom.id]: true
  });
  assert.equal(pendingSaves.length, 2);
  assert.equal(pendingSaves[1].project.roomId, backgroundRoom.id);

  pendingSaves[1].resolve();
  assert.equal(await backgroundSave, true);
  assert.deepEqual(store.getState().saveErrorsByRoomId, {
    [studioRoom.id]: "软装布局尚未写入设备，请重试。"
  });
  assert.deepEqual(store.getState().pendingSaveRoomIds, {});

  const studioRetry = store.getState().retrySave(studioRoom.id);
  assert.deepEqual(store.getState().pendingSaveRoomIds, {
    [studioRoom.id]: true
  });
  await Promise.resolve();
  assert.equal(pendingSaves.length, 3);
  assert.equal(pendingSaves[2].project.roomId, studioRoom.id);
  pendingSaves[2].resolve();

  assert.equal(await studioRetry, true);
  assert.deepEqual(store.getState().saveErrorsByRoomId, {});
  assert.deepEqual(store.getState().pendingSaveRoomIds, {});
});
```

- [ ] **Step 3: 测试同房间多次保存不会提前清除在途状态**

增加：

```js
test("one room remains pending until every queued save settles", async () => {
  const { store, pendingSaves } = loadStore();
  const firstSave = store.getState().saveProject(createProject(studioRoom));
  const secondSave = store.getState().saveProject({
    ...createProject(studioRoom),
    updatedAt: "2026-07-30T08:03:00.000Z"
  });

  assert.deepEqual(store.getState().pendingSaveRoomIds, {
    [studioRoom.id]: true
  });

  await Promise.resolve();
  assert.equal(pendingSaves.length, 1);
  pendingSaves[0].resolve();
  assert.equal(await firstSave, true);
  await Promise.resolve();

  assert.deepEqual(store.getState().pendingSaveRoomIds, {
    [studioRoom.id]: true
  });
  assert.equal(pendingSaves.length, 2);

  pendingSaves[1].resolve();
  assert.equal(await secondSave, true);
  assert.deepEqual(store.getState().pendingSaveRoomIds, {});
});
```

- [ ] **Step 4: 把源码契约改为按房间状态**

在 `furnish-contract.test.cjs` 的 `furnish writes are serialized...` 测试中，把全局字段断言替换为：

```js
assert.match(
  store,
  /saveErrorsByRoomId: Partial<Record<string, string>>/
);
assert.match(
  store,
  /pendingSaveRoomIds: Partial<Record<string, true>>/
);
assert.doesNotMatch(store, /\bsaveError\?: string/);
assert.doesNotMatch(store, /\bpendingSave: boolean/);
```

在 `studio selects furnishing project and loading state by room` 测试中增加：

```js
assert.match(screen, /state\.saveErrorsByRoomId\[roomMesh\.id\]/);
assert.match(
  screen,
  /state\.pendingSaveRoomIds\[roomMesh\.id\] \?\? false/
);
```

- [ ] **Step 5: 固定页面重进后的 Store 重试**

在 `studio keeps failed layouts pending and only reports successful saves` 测试中增加：

```js
assert.match(
  screen,
  /const retrySave = useFurnishStore\(\(state\) => state\.retrySave\)/
);
assert.match(
  screen,
  /if \(pendingProjectRef\.current\) \{\s*await flushProjectSave\(\);\s*return;/
);
assert.match(screen, /await retrySave\(roomMesh\.id\)/);
```

- [ ] **Step 6: 运行红灯测试**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-store-isolation.test.cjs tests/furnish-contract.test.cjs
```

Expected:

- 新行为测试因 `pendingSaveRoomIds` 和 `saveErrorsByRoomId` 尚不存在而失败。
- 契约测试因 Store 与页面仍使用全局字段而失败。
- 原有加载隔离测试继续通过。

- [ ] **Step 7: 提交红灯测试**

```powershell
git add apps/mobile/tests/furnish-store-isolation.test.cjs apps/mobile/tests/furnish-contract.test.cjs
git commit -m "test(android): reproduce furnish save leakage"
```

### Task 2: 实现按房间保存结算

**Files:**
- Modify: `apps/mobile/stores/furnishStore.ts`
- Test: `apps/mobile/tests/furnish-store-isolation.test.cjs`

- [ ] **Step 1: 替换 Store 保存状态字段**

在 `FurnishState` 中删除：

```ts
saveError?: string;
pendingSave: boolean;
```

增加：

```ts
saveErrorsByRoomId: Partial<Record<string, string>>;
pendingSaveRoomIds: Partial<Record<string, true>>;
```

把初始值替换为：

```ts
saveErrorsByRoomId: {},
pendingSaveRoomIds: {},
```

- [ ] **Step 2: 增加房间内保存计数**

把：

```ts
let pendingSaveCount = 0;
```

替换为：

```ts
const pendingSaveCountsByRoomId = new Map<string, number>();

function incrementPendingSaveCount(roomId: string): number {
  const nextCount = (pendingSaveCountsByRoomId.get(roomId) ?? 0) + 1;
  pendingSaveCountsByRoomId.set(roomId, nextCount);
  return nextCount;
}

function decrementPendingSaveCount(roomId: string): number {
  const nextCount = Math.max(
    0,
    (pendingSaveCountsByRoomId.get(roomId) ?? 1) - 1
  );

  if (nextCount > 0) {
    pendingSaveCountsByRoomId.set(roomId, nextCount);
  } else {
    pendingSaveCountsByRoomId.delete(roomId);
  }

  return nextCount;
}
```

- [ ] **Step 3: 保存开始时只标记当前房间**

在 `saveProject` 中把全局计数和布尔值替换为：

```ts
incrementPendingSaveCount(nextProject.roomId);
set((state) => ({
  pendingSaveRoomIds: {
    ...state.pendingSaveRoomIds,
    [nextProject.roomId]: true
  }
}));
```

- [ ] **Step 4: 成功时只清除当前房间的警告和错误**

成功分支使用：

```ts
set((state) => {
  const nextWarnings = { ...state.recoveryWarningsByRoomId };
  const nextSaveErrors = { ...state.saveErrorsByRoomId };
  delete nextWarnings[nextProject.roomId];
  delete nextSaveErrors[nextProject.roomId];

  return {
    recoveryWarningsByRoomId: nextWarnings,
    saveErrorsByRoomId: nextSaveErrors
  };
});
```

- [ ] **Step 5: 失败时只记录当前房间**

失败分支使用：

```ts
set((state) => ({
  saveErrorsByRoomId: {
    ...state.saveErrorsByRoomId,
    [nextProject.roomId]: "软装布局尚未写入设备，请重试。"
  }
}));
```

- [ ] **Step 6: 最后一次结算时才清除当前房间在途状态**

`finally` 使用：

```ts
const remainingCount = decrementPendingSaveCount(nextProject.roomId);
set((state) => {
  const nextPendingRoomIds = { ...state.pendingSaveRoomIds };

  if (remainingCount > 0) {
    nextPendingRoomIds[nextProject.roomId] = true;
  } else {
    delete nextPendingRoomIds[nextProject.roomId];
  }

  return {
    pendingSaveRoomIds: nextPendingRoomIds
  };
});
```

- [ ] **Step 7: 运行 Store 行为测试**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-store-isolation.test.cjs
```

Expected: 4 passed，0 failed。

- [ ] **Step 8: 确认页面旧选择器形成预期红灯**

Run:

```powershell
cd apps/mobile
npm.cmd run typecheck
```

Expected: 只因 `FurnishStudioScreen.tsx` 仍读取已删除的 `saveError` 和 `pendingSave` 而失败。Store 与页面将在 Task 3 作为一个可编译的原子提交提交。

### Task 3: 页面只选择当前房间状态

**Files:**
- Modify: `apps/mobile/screens/FurnishStudioScreen.tsx`
- Test: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: 替换页面选择器**

把：

```ts
const saveError = useFurnishStore((state) => state.saveError);
const pendingSave = useFurnishStore((state) => state.pendingSave);
```

替换为：

```ts
const saveError = useFurnishStore(
  (state) => state.saveErrorsByRoomId[roomMesh.id]
);
const pendingSave = useFurnishStore(
  (state) => state.pendingSaveRoomIds[roomMesh.id] ?? false
);
```

不修改按钮、可见文案、无障碍标签或禁用逻辑。

- [ ] **Step 2: 接入页面重进后的 Store 重试**

选择现有 Store 动作：

```ts
const retrySave = useFurnishStore((state) => state.retrySave);
```

把 `handleRetrySave` 替换为：

```ts
const handleRetrySave = async () => {
  if (pendingProjectRef.current) {
    await flushProjectSave();
    return;
  }

  setSaveText("正在保存…");
  const persisted = await retrySave(roomMesh.id);
  if (!persisted) {
    setSaveText("保存失败，请重试");
    return;
  }

  if (project) {
    onProjectStatusChanged(project);
  }
  setSaveText(
    `已保存 · ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })}`
  );
};
```

- [ ] **Step 3: 运行专项测试**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-store-isolation.test.cjs tests/furnish-contract.test.cjs tests/furnish-project-recovery.test.cjs
```

Expected: 全部通过。

- [ ] **Step 4: 运行 TypeScript**

Run:

```powershell
cd apps/mobile
npm.cmd run typecheck
```

Expected: exit code 0。

- [ ] **Step 5: 提交 Store 与页面接入**

```powershell
git add apps/mobile/stores/furnishStore.ts apps/mobile/screens/FurnishStudioScreen.tsx
git commit -m "fix(android): isolate furnish save state"
```

### Task 4: 文档与本地完整验收

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: 记录本地保存状态隔离**

在 `apps/mobile/README.md` 的房间隔离段落后增加：

```text
软装保存错误和保存中状态同样按 roomId 隔离；一个房间的失败不会出现在另一个房间，也不会被另一个房间的成功清除。同一房间有多次排队保存时，最后一次结算前会持续显示保存中。
```

- [ ] **Step 2: 运行 Mobile 全量验证**

Run:

```powershell
cd apps/mobile
npm.cmd test
npm.cmd run typecheck
npx.cmd expo config --type public
```

Expected:

- Mobile 81 passed，0 failed。
- TypeScript exit code 0。
- Expo 公共配置可解析。

- [ ] **Step 3: 构建 Android 产物**

设置当前任务便携工具链：

```powershell
$env:JAVA_HOME='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\jdk17-portable\jdk-17.0.19+10'
$env:ANDROID_HOME='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
```

Run:

```powershell
cd apps/mobile/android
.\gradlew.bat app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`。

Run:

```powershell
cd apps/mobile
npx.cmd expo export:embed --platform android --dev false --entry-file node_modules/expo/AppEntry.js --bundle-output .tmp/android-release/index.android.bundle --assets-dest .tmp/android-release
```

Expected: release JavaScript bundle 和 6 个资源写入成功。

- [ ] **Step 4: API 34 正常保存与恢复回归**

只使用覆盖安装保留现有数据：

```powershell
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081
```

验证：

- Library 仍恢复当前 3 套比较和样例房型 4 件家具。
- 进入样例房型软装，本地 GLB 和“已恢复上次软装布局”出现。
- 不修改布局直接使用现有返回动作；该动作仍会把当前项目经过保存队列写入设备。
- 再次进入软装，4 件家具和恢复状态仍存在。
- React Native、AndroidRuntime 与 Chromium 错误日志为 0。

- [ ] **Step 5: 运行全仓验证**

Run:

```powershell
node --test scripts/tests/*.test.cjs
node --test apps/web-preview/tests/*.test.cjs
node --test apps/web-furnish/tests/*.test.cjs
node --test apps/website/tests/*.test.cjs
powershell -ExecutionPolicy Bypass -File scripts/product-verify.ps1
```

Run in `services/backend`:

```powershell
cargo fmt --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked
```

Expected: 全部通过。

- [ ] **Step 6: 更新验证记录**

在 `roomark-android-verification.md` 记录：

- 2 个新增真实 Store 行为测试和 Mobile 总数。
- 跨房间错误隔离、跨房间在途隔离、同房间计数和重试清除行为。
- APK 与 release bundle 构建结果和大小。
- API 34 正常保存、返回、再次进入和错误日志。
- 模拟器正常路径不替代物理设备写入失败、存储压力和厂商系统验收。

- [ ] **Step 7: 提交文档证据**

```powershell
git add apps/mobile/README.md docs/product/roomark-android-verification.md
git commit -m "docs(android): record furnish save isolation"
```

### Task 5: 发布公开主分支

**Files:**
- No file changes.

- [ ] **Step 1: 完成前重新验证**

Run:

```powershell
git status --short
git diff --check
cd apps/mobile
npm.cmd test
npm.cmd run typecheck
cd ../..
node --test scripts/tests/*.test.cjs
powershell -ExecutionPolicy Bypass -File scripts/product-verify.ps1
```

Expected: 工作区干净或仅包含尚未提交的本轮验证文档；所有命令 exit code 0。

- [ ] **Step 2: 核对远端基线**

Run:

```powershell
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git log --oneline origin/main..HEAD
```

Expected: 公开 `main` 是当前分支祖先，提交只属于本轮保存状态隔离。

- [ ] **Step 3: 推送公开 main**

Run:

```powershell
git push origin public-main:main
```

Expected: 快进推送成功。

- [ ] **Step 4: 等待 GitHub Actions**

查找当前 `HEAD` 对应的 CI 并等待：

```powershell
$headSha = git rev-parse HEAD
$runId = (
  gh run list --repo Asaseal/roomark --branch main --limit 20 --json databaseId,headSha |
    ConvertFrom-Json |
    Where-Object { $_.headSha -eq $headSha } |
    Select-Object -First 1
).databaseId
if (-not $runId) { throw "Current HEAD CI run not found" }
gh run watch $runId --repo Asaseal/roomark --exit-status
```

Expected:

- `public-content` success。
- `mobile` success。
- `backend` success。
- `container` success。

- [ ] **Step 5: 核对公开状态**

Run:

```powershell
git rev-parse HEAD
git rev-parse origin/main
git ls-remote origin refs/heads/main
```

Expected: 三个 SHA 一致，工作区干净。

## 自审结果

- 规格覆盖：跨房间失败、跨房间成功、跨房间在途、同房间多次保存和失败后重试均有实施任务。
- 数据边界：不改变 AsyncStorage 键、项目 schema、恢复规则或串行队列。
- UI 边界：页面只换状态选择器，不改可见功能、导航或交互。
- 并发边界：外部状态只暴露布尔映射，内部计数不进入产品数据。
- 验收边界：真实 Promise 测试证明故障结算；模拟器只证明正常路径，不伪造真机故障。
- 类型一致：计划统一使用 `saveErrorsByRoomId`、`pendingSaveRoomIds` 和 `pendingSaveCountsByRoomId`。
- 占位检查：计划没有未定义函数、模糊实现步骤或待补充内容。
