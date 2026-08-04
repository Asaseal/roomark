# Roomark Android 软装读取失败保护实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 软装设备读取失败或超时时阻止空白项目进入编辑与自动保存，并允许用户安全重试读取或返回房源库。

**Architecture:** 存储层区分设备读取失败与已读到的损坏内容；Zustand Store 按 `roomId` 保存阻断式读取错误且不发布失败结果中的空白项目；页面在挂载 3D 场景前显示读取恢复页。正常空记录、损坏恢复、保存队列和存储 schema 保持不变。

**Tech Stack:** Expo 51、React Native 0.74、TypeScript、Zustand、AsyncStorage、Node.js `node:test`、Android Gradle、API 34 Emulator

---

### Task 1: 固定存储读取失败语义

**Files:**
- Create: `apps/mobile/tests/furnish-storage-read-failure.test.cjs`
- Modify: `apps/mobile/services/furnishProjectRecovery.ts`
- Modify: `apps/mobile/services/furnishStorage.ts`

- [ ] **Step 1: 写存储层红灯测试**

创建测试加载真实 `furnishStorage.ts`，只替换 AsyncStorage、恢复模块和 `runStorageRead` 依赖。覆盖以下行为：

```js
test("device read failure is distinct from a missing furnishing record", async () => {
  const failed = loadStorage({
    runStorageRead: async () => {
      throw new Error("read failed");
    }
  });
  const failedResult = await failed.loadFurnishProject(roomMesh);

  assert.equal(failedResult.readFailed, true);
  assert.equal(failedResult.recovered, false);
  assert.match(failedResult.warning, /原布局尚未被覆盖/);

  const missing = loadStorage({
    runStorageRead: async () => null
  });
  const missingResult = await missing.loadFurnishProject(roomMesh);

  assert.equal(missingResult.readFailed, undefined);
  assert.equal(missingResult.recovered, false);
  assert.equal(missingResult.warning, undefined);
});

test("invalid json uses corruption recovery instead of device read failure", async () => {
  const storage = loadStorage({
    runStorageRead: async () => "{invalid-json"
  });

  const result = await storage.loadFurnishProject(roomMesh);

  assert.equal(result.readFailed, undefined);
  assert.equal(result.recovered, true);
  assert.match(result.warning, /恢复空白布局/);
});
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-storage-read-failure.test.cjs
```

Expected: FAIL，因为 `FurnishProjectLoadResult` 尚无 `readFailed`，读取失败与 JSON 解析失败仍共享同一 `catch`。

- [ ] **Step 3: 提交红灯测试**

```powershell
git add apps/mobile/tests/furnish-storage-read-failure.test.cjs
git commit -m "test(android): reproduce unsafe furnish read fallback"
```

- [ ] **Step 4: 扩展读取结果类型**

在 `FurnishProjectLoadResult` 增加：

```ts
readFailed?: boolean;
```

- [ ] **Step 5: 拆分读取与 JSON 解析边界**

`loadFurnishProject` 使用以下结构：

```ts
export async function loadFurnishProject(
  roomMesh: RoomMesh
): Promise<FurnishProjectLoadResult> {
  let stored: string | null;

  try {
    stored = await runStorageRead(
      () => AsyncStorage.getItem(`${storagePrefix}${roomMesh.id}`),
      { operationName: "软装记录读取" }
    );
  } catch {
    return {
      project: createEmptyFurnishProject(roomMesh),
      recovered: false,
      readFailed: true,
      warning: "软装记录暂时无法读取，设备中的原布局尚未被覆盖。"
    };
  }

  if (!stored) {
    return {
      project: createEmptyFurnishProject(roomMesh),
      recovered: false
    };
  }

  try {
    return recoverFurnishProject(JSON.parse(stored) as unknown, roomMesh);
  } catch {
    return recoverFurnishProject(undefined, roomMesh);
  }
}
```

- [ ] **Step 6: 运行存储测试并确认转绿**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-storage-read-failure.test.cjs tests/furnish-project-recovery.test.cjs
npm.cmd run typecheck
```

Expected: 新测试与现有恢复测试全部 PASS，TypeScript exit 0。

- [ ] **Step 7: 提交存储实现**

```powershell
git add apps/mobile/services/furnishProjectRecovery.ts apps/mobile/services/furnishStorage.ts
git commit -m "fix(android): distinguish furnish read failures"
```

### Task 2: 按房间阻止失败结果进入编辑状态

**Files:**
- Modify: `apps/mobile/tests/furnish-store-isolation.test.cjs`
- Modify: `apps/mobile/stores/furnishStore.ts`

- [ ] **Step 1: 扩展 Store 测试装置**

让 `pendingLoads` 的 resolver 接收完整结果：

```js
const loadFurnishProject = (roomMesh) => {
  loadCount += 1;
  return new Promise((resolve) => {
    pendingLoads.set(roomMesh.id, (result = {
      project: createProject(roomMesh),
      recovered: false
    }) => resolve(result));
  });
};
```

- [ ] **Step 2: 写房间隔离红灯测试**

```js
test("read failure blocks one room until its retry succeeds", async () => {
  const { store, pendingLoads } = loadStore();
  const failedLoad = store.getState().loadProject(studioRoom);
  const backgroundLoad = store.getState().loadProject(backgroundRoom);

  pendingLoads.get(studioRoom.id)({
    project: createProject(studioRoom),
    recovered: false,
    readFailed: true,
    warning: "软装记录暂时无法读取，设备中的原布局尚未被覆盖。"
  });
  await failedLoad;

  assert.equal(store.getState().projectsByRoomId[studioRoom.id], undefined);
  assert.deepEqual(store.getState().loadErrorsByRoomId, {
    [studioRoom.id]: "软装记录暂时无法读取，设备中的原布局尚未被覆盖。"
  });

  pendingLoads.get(backgroundRoom.id)();
  await backgroundLoad;
  assert.equal(
    store.getState().projectsByRoomId[backgroundRoom.id].roomId,
    backgroundRoom.id
  );
  assert.ok(store.getState().loadErrorsByRoomId[studioRoom.id]);

  const retry = store.getState().loadProject(studioRoom);
  pendingLoads.get(studioRoom.id)();
  await retry;

  assert.equal(
    store.getState().projectsByRoomId[studioRoom.id].roomId,
    studioRoom.id
  );
  assert.deepEqual(store.getState().loadErrorsByRoomId, {});
});
```

- [ ] **Step 3: 运行测试并确认正确失败**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-store-isolation.test.cjs
```

Expected: FAIL，因为 Store 尚无 `loadErrorsByRoomId`，且会发布失败结果中的空白项目。

- [ ] **Step 4: 提交 Store 红灯测试**

```powershell
git add apps/mobile/tests/furnish-store-isolation.test.cjs
git commit -m "test(android): require blocked furnish read failures"
```

- [ ] **Step 5: 实现房间级读取错误**

在 `FurnishState` 和初始状态增加：

```ts
loadErrorsByRoomId: Partial<Record<string, string>>;
```

在 `loadProject` 的结果处理里：

```ts
set((state) => {
  const nextWarnings = { ...state.recoveryWarningsByRoomId };
  const nextLoadErrors = { ...state.loadErrorsByRoomId };

  if (result.readFailed) {
    delete nextWarnings[roomMesh.id];
    nextLoadErrors[roomMesh.id] =
      result.warning ?? "软装记录暂时无法读取，请重试。";
    return {
      recoveryWarningsByRoomId: nextWarnings,
      loadErrorsByRoomId: nextLoadErrors
    };
  }

  delete nextLoadErrors[roomMesh.id];
  if (result.warning) {
    nextWarnings[roomMesh.id] = result.warning;
  } else {
    delete nextWarnings[roomMesh.id];
  }

  return {
    projectsByRoomId: {
      ...state.projectsByRoomId,
      [roomMesh.id]: result.project
    },
    recoveryWarningsByRoomId: nextWarnings,
    loadErrorsByRoomId: nextLoadErrors
  };
});
```

- [ ] **Step 6: 运行 Store 与类型测试**

```powershell
cd apps/mobile
node --test tests/furnish-store-isolation.test.cjs
npm.cmd run typecheck
```

Expected: Store 全部测试 PASS，TypeScript exit 0。

- [ ] **Step 7: 提交 Store 实现**

```powershell
git add apps/mobile/stores/furnishStore.ts
git commit -m "fix(android): block unsafe furnish read fallback"
```

### Task 3: 提供阻断式读取恢复页

**Files:**
- Modify: `apps/mobile/tests/furnish-contract.test.cjs`
- Modify: `apps/mobile/screens/FurnishStudioScreen.tsx`

- [ ] **Step 1: 写页面契约红灯测试**

在现有恢复测试中增加：

```js
assert.match(
  screen,
  /state\.loadErrorsByRoomId\[roomMesh\.id\]/
);
assert.match(screen, /软装记录暂时无法读取/);
assert.match(screen, /设备中的原布局尚未被覆盖/);
assert.match(screen, /重试读取/);
assert.match(screen, /void loadProject\(roomMesh\)/);
assert.match(screen, /返回房源库/);

const readFailureIndex = screen.indexOf("if (loadError)");
const webViewIndex = screen.indexOf("<FurnishWebView");
assert.ok(readFailureIndex >= 0 && readFailureIndex < webViewIndex);
```

- [ ] **Step 2: 运行页面契约并确认正确失败**

```powershell
cd apps/mobile
node --test tests/furnish-contract.test.cjs
```

Expected: FAIL，因为页面尚未选择房间级读取错误，也没有阻断恢复页。

- [ ] **Step 3: 提交页面红灯测试**

```powershell
git add apps/mobile/tests/furnish-contract.test.cjs
git commit -m "test(android): specify furnish read recovery page"
```

- [ ] **Step 4: 选择当前房间读取错误**

```ts
const loadError = useFurnishStore(
  (state) => state.loadErrorsByRoomId[roomMesh.id]
);
```

- [ ] **Step 5: 在 3D 场景前增加阻断分支**

```tsx
if (loadError) {
  return (
    <SafeAreaView style={styles.loadFailurePage}>
      <Text accessibilityRole="alert" style={styles.loadFailureTitle}>
        软装记录暂时无法读取
      </Text>
      <Text style={styles.loadFailureText}>
        设备中的原布局尚未被覆盖。请重试读取，或返回房源库稍后处理。
      </Text>
      <TouchableOpacity
        accessibilityLabel={loading ? "正在重新读取软装记录" : "重试读取软装记录"}
        accessibilityRole="button"
        accessibilityState={{ disabled: loading }}
        disabled={loading}
        style={[
          styles.loadFailureRetry,
          loading ? styles.actionDisabled : null
        ]}
        onPress={() => {
          void loadProject(roomMesh);
        }}
      >
        <Text style={styles.loadFailureRetryText}>
          {loading ? "正在重新读取…" : "重试读取"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel="返回房源库"
        accessibilityRole="button"
        style={styles.loadFailureBack}
        onPress={onBack}
      >
        <Text style={styles.loadFailureBackText}>返回房源库</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
```

样式沿用现有米白背景、深色主按钮和至少 44pt 触控目标，不改变正常软装页面。

- [ ] **Step 6: 运行页面、Store 与类型测试**

```powershell
cd apps/mobile
node --test tests/furnish-contract.test.cjs tests/furnish-store-isolation.test.cjs tests/furnish-storage-read-failure.test.cjs
npm.cmd run typecheck
```

Expected: 全部 PASS，TypeScript exit 0。

- [ ] **Step 7: 提交页面实现**

```powershell
git add apps/mobile/screens/FurnishStudioScreen.tsx
git commit -m "fix(android): offer safe furnish read retry"
```

### Task 4: 更新文档并完成全量验证

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: 更新 Android 产品说明**

记录：

- 设备读取失败与损坏恢复的区别；
- 读取失败时不发布空白项目、不挂载可编辑场景；
- 重试成功后恢复现有工作流；
- 不改变存储键或写入队列。

- [ ] **Step 2: 运行 Mobile 全量验证**

```powershell
cd apps/mobile
npm.cmd run verify
```

Expected: 所有测试、TypeScript 和 Expo 配置 PASS。

- [ ] **Step 3: 构建 Android Debug APK**

```powershell
$env:JAVA_HOME='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\jdk17-portable\jdk-17.0.19+10'
$env:ANDROID_HOME='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
cd apps/mobile/android
.\gradlew.bat app:assembleDebug --console=plain
```

Expected: `BUILD SUCCESSFUL`。

- [ ] **Step 4: 构建 release JavaScript bundle**

```powershell
cd apps/mobile
npx.cmd expo export:embed --platform android --dev false --entry-file node_modules/expo/AppEntry.js --bundle-output .tmp/android-release/index.android.bundle --assets-dest .tmp/android-release
```

Expected: Android bundle 与 6 个本地资产写入成功。

- [ ] **Step 5: 完成 API 34 正常链路回归**

保留模拟器数据覆盖安装 Debug APK，使用离线 Metro 启动后验证：

- Library 恢复现有对比和软装计数；
- 样例房型进入软装后加载本地 GLB；
- 返回 Library 后再次进入仍恢复布局；
- ReactNativeJS、AndroidRuntime 与 Chromium error line count 为 0。

本步骤只证明正常读取链路未回归；读取失败保护由自动化测试证明，不伪造存储故障现场结果。

- [ ] **Step 6: 运行全仓验证**

```powershell
cd D:\wt\roomark-maturity
powershell.exe -ExecutionPolicy Bypass -File scripts\product-verify.ps1 -Full
cd services/backend
cargo.exe clippy --locked --all-targets --all-features -- -D warnings
```

Expected: 公开内容、Web、Mobile、Rust 格式、Clippy 与测试全部 PASS。

- [ ] **Step 7: 提交验证文档**

```powershell
git add apps/mobile/README.md docs/product/roomark-android-verification.md
git commit -m "docs(android): record furnish read protection"
```

### Task 5: 发布公开 main 并核对 CI

**Files:**
- No source changes

- [ ] **Step 1: 发布前复验**

```powershell
cd D:\wt\roomark-maturity\apps\mobile
npm.cmd run verify
cd D:\wt\roomark-maturity
node.exe --test scripts\tests\public-repository-policy.test.cjs
powershell.exe -ExecutionPolicy Bypass -File scripts\product-verify.ps1
git diff --check
git status --short
```

Expected: 验证全部 PASS，工作树干净。

- [ ] **Step 2: 核对可快进状态**

```powershell
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
```

Expected: exit 0。

- [ ] **Step 3: 推送公开 main**

```powershell
git push origin public-main:main
```

- [ ] **Step 4: 等待 CI**

```powershell
$sha=(git rev-parse HEAD).Trim()
gh run list --repo Asaseal/roomark --commit $sha --limit 10
gh run watch <run-id> --repo Asaseal/roomark --exit-status
```

Expected: mobile、backend、public-content 与 container 全部成功。

- [ ] **Step 5: 最终核对**

确认本地 HEAD、`origin/main` 与远端 `main` SHA 一致，隔离 worktree 干净，公开网页返回 HTTP 200。保留 `D:\Claw\roomark` 的用户工作区原状。

## 计划自审

- 规格覆盖：Task 1 区分读取失败与损坏内容；Task 2 阻止失败结果进入项目状态并隔离房间；Task 3 提供安全重试与返回；Task 4、5 覆盖自动化、构建、模拟器、文档和发布。
- 类型一致：计划统一使用 `readFailed`、`loadErrorsByRoomId`、`loadProject(roomMesh)`。
- 范围一致：没有新增产品区、账号、云同步、知识库、社区、合同分析、真实扫描或真实 AI 效果图。
- 数据边界：不修改存储键、`FurnishProject` schema 或 AsyncStorage 写入队列。
