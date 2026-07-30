# Roomark Android 软装草稿损坏恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Android 软装草稿在本地数据损坏时保留可安全恢复的家具、阻止坏数据进入 WebView，并明确提示用户。

**Architecture:** 新增无运行时依赖的纯恢复模块，逐项校验和规范化项目、家具与效果图；AsyncStorage 只负责读取和写入，Zustand 按房间携带恢复警告，软装页显示可访问提示。当前 `roomMesh` 始终是权威房型，恢复结果只在用户现有保存流程中写回。

**Tech Stack:** React Native 0.74、Expo SDK 51、TypeScript 5.3、Zustand、AsyncStorage、Node `node:test`。

---

### Task 1: 建立纯恢复行为红灯测试

**Files:**
- Create: `apps/mobile/tests/furnish-project-recovery.test.cjs`
- Test: `apps/mobile/tests/furnish-project-recovery.test.cjs`

- [ ] **Step 1: 写入 TypeScript 模块加载器和测试数据**

创建测试文件，使用仓库已安装的 TypeScript 编译纯模块，并定义当前房型、合法家具、合法项目和合法效果图：

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const mobileRoot = path.resolve(__dirname, "..");

function loadRecoveryService() {
  const source = fs.readFileSync(
    path.join(mobileRoot, "services", "furnishProjectRecovery.ts"),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  Function("module", "exports", compiled)(module, module.exports);
  return module.exports;
}

const roomMesh = {
  id: "room-test",
  name: "当前房型",
  source: "floorplan",
  width: 5,
  depth: 3.6,
  height: 2.8,
  capturedAt: "2026-07-30T08:00:00.000Z"
};

const furniture = {
  id: "furn-1",
  assetId: "sofa-soft-01",
  category: "sofa",
  modelUri: "D-glb/sofa.glb",
  position: [0.5, 0, -0.5],
  rotation: [0, 0.2, 0],
  scale: [1, 1, 1],
  locked: false,
  createdAt: "2026-07-30T08:01:00.000Z"
};

const renderPreview = {
  id: "render-1",
  roomId: roomMesh.id,
  status: "saved",
  renderPrompt: "基于当前布局的概念预览",
  basis: {
    roomSize: "5m × 3.6m × 2.8m",
    furnitureCount: 1,
    style: "温暖现代",
    layoutSummary: "沙发位于房间中部"
  },
  summary: "当前房型的 Mock 概念预览",
  style: "温暖现代",
  createdAt: "2026-07-30T08:02:00.000Z",
  savedAt: "2026-07-30T08:03:00.000Z"
};

function createProject(overrides = {}) {
  return {
    id: `furnish-${roomMesh.id}`,
    roomId: roomMesh.id,
    roomMesh: { ...roomMesh },
    placedFurniture: [{ ...furniture }],
    renderPreview: { ...renderPreview, basis: { ...renderPreview.basis } },
    updatedAt: "2026-07-30T08:04:00.000Z",
    syncState: "local",
    ...overrides
  };
}
```

- [ ] **Step 2: 写入四个行为测试**

```js
test("valid project is preserved while current room mesh stays authoritative", () => {
  const { recoverFurnishProject } = loadRecoveryService();
  const stored = createProject();
  const snapshot = structuredClone(stored);
  const currentRoom = { ...roomMesh, name: "当前房型" };

  const result = recoverFurnishProject(stored, currentRoom);

  assert.equal(result.recovered, false);
  assert.equal(result.warning, undefined);
  assert.deepEqual(result.project.roomMesh, currentRoom);
  assert.deepEqual(result.project.placedFurniture, [furniture]);
  assert.deepEqual(result.project.renderPreview, renderPreview);
  assert.deepEqual(stored, snapshot);
});

test("invalid top-level project falls back to an explained empty layout", () => {
  const { recoverFurnishProject } = loadRecoveryService();
  const result = recoverFurnishProject(
    createProject({ roomId: "another-room" }),
    roomMesh
  );

  assert.equal(result.recovered, true);
  assert.equal(result.warning, "软装记录无法读取，已恢复空白布局。");
  assert.equal(result.project.roomId, roomMesh.id);
  assert.deepEqual(result.project.roomMesh, roomMesh);
  assert.deepEqual(result.project.placedFurniture, []);
  assert.equal(result.project.renderPreview, undefined);
});

test("mixed project keeps unique valid furniture and repairs bounded positions", () => {
  const { recoverFurnishProject } = loadRecoveryService();
  const outOfBounds = {
    ...furniture,
    id: "furn-2",
    position: [99, 2, -99]
  };
  const malformed = {
    ...furniture,
    id: "furn-bad",
    position: [0, 0]
  };
  const duplicate = {
    ...furniture,
    modelUri: "D-glb/duplicate.glb"
  };
  const result = recoverFurnishProject(
    createProject({
      placedFurniture: [furniture, malformed, duplicate, outOfBounds]
    }),
    roomMesh
  );

  assert.equal(result.recovered, true);
  assert.equal(result.warning, "部分软装记录已损坏，已保留可恢复的布局。");
  assert.deepEqual(
    result.project.placedFurniture.map((item) => item.id),
    ["furn-1", "furn-2"]
  );
  assert.deepEqual(result.project.placedFurniture[1].position, [2.35, 0, -1.65]);
  assert.equal(result.project.renderPreview, undefined);
});

test("stale room data and invalid preview never override the current room", () => {
  const { recoverFurnishProject } = loadRecoveryService();
  const storedRoom = { ...roomMesh, width: 99 };
  const result = recoverFurnishProject(
    createProject({
      roomMesh: storedRoom,
      renderPreview: {
        ...renderPreview,
        basis: { ...renderPreview.basis, furnitureCount: Number.NaN }
      }
    }),
    roomMesh
  );

  assert.equal(result.recovered, true);
  assert.deepEqual(result.project.roomMesh, roomMesh);
  assert.equal(result.project.renderPreview, undefined);
});
```

- [ ] **Step 3: 运行测试并确认正确失败**

Run:

```powershell
cd apps/mobile
node.exe --test tests/furnish-project-recovery.test.cjs
```

Expected: 测试因 `services/furnishProjectRecovery.ts` 尚不存在而失败。

- [ ] **Step 4: 提交红灯测试**

```powershell
git add apps/mobile/tests/furnish-project-recovery.test.cjs
git commit -m "test(android): cover corrupt furnish recovery"
```

### Task 2: 实现纯恢复模块

**Files:**
- Create: `apps/mobile/services/furnishProjectRecovery.ts`
- Test: `apps/mobile/tests/furnish-project-recovery.test.cjs`

- [ ] **Step 1: 定义结果类型和基础校验器**

实现 `FurnishProjectLoadResult`、空白项目工厂、对象/字符串/时间/向量/枚举校验器。向量校验必须要求长度恰好为 3 且所有分量为有限数字。

- [ ] **Step 2: 实现家具逐项恢复**

对每条家具执行完整字段校验，丢弃无效或重复 ID，Y 轴归零，并使用：

```ts
const xLimit = Math.max(0, roomMesh.width / 2 - 0.15);
const zLimit = Math.max(0, roomMesh.depth / 2 - 0.15);
const position: Vector3Tuple = [
  clamp(source.position[0], -xLimit, xLimit),
  0,
  clamp(source.position[2], -zLimit, zLimit)
];
```

恢复结果只构造 `PlacedFurniture` 已知字段，不复制未知属性。

- [ ] **Step 3: 实现房型、效果图和同步状态恢复**

比较存储房型与当前房型的 ID、名称、来源、尺寸和捕获时间。只有房型、家具和预览均未发生修复时才保留有效效果图；未知同步状态规范化为 `local`。

- [ ] **Step 4: 运行目标测试**

Run:

```powershell
cd apps/mobile
node.exe --test tests/furnish-project-recovery.test.cjs
```

Expected: 4 tests passed，0 failed。

- [ ] **Step 5: 运行类型检查**

Run:

```powershell
cd apps/mobile
npm.cmd run typecheck
```

Expected: `tsc --noEmit` exit 0。

- [ ] **Step 6: 提交纯恢复模块**

```powershell
git add apps/mobile/services/furnishProjectRecovery.ts
git commit -m "fix(android): recover corrupt furnish drafts"
```

### Task 3: 接入存储、状态和可访问提示

**Files:**
- Modify: `apps/mobile/services/furnishStorage.ts`
- Modify: `apps/mobile/stores/furnishStore.ts`
- Modify: `apps/mobile/screens/FurnishStudioScreen.tsx`
- Modify: `apps/mobile/tests/furnish-contract.test.cjs`
- Test: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: 写入集成红灯契约**

把旧的浅层校验契约替换为：

```js
test("stored furnishing projects use recovery results before restore", () => {
  const storage = read(path.join("services", "furnishStorage.ts"));
  const store = read(path.join("stores", "furnishStore.ts"));
  const screen = read(path.join("screens", "FurnishStudioScreen.tsx"));

  assert.match(storage, /recoverFurnishProject/);
  assert.match(storage, /Promise<FurnishProjectLoadResult>/);
  assert.match(store, /recoveryWarningsByRoomId/);
  assert.match(store, /result\.project/);
  assert.match(store, /result\.warning/);
  assert.match(screen, /recoveryWarning/);
  assert.match(screen, /accessibilityRole="alert"/);
  assert.match(screen, /accessibilityLiveRegion="polite"/);
});
```

并在保存可靠性契约中增加：

```js
assert.match(store, /delete nextWarnings\[nextProject\.roomId\]/);
```

- [ ] **Step 2: 运行契约测试并确认正确失败**

Run:

```powershell
cd apps/mobile
node.exe --test tests/furnish-contract.test.cjs
```

Expected: 新的恢复接入契约失败，既有契约继续通过。

- [ ] **Step 3: 接入 AsyncStorage 读取**

`furnishStorage.ts` 导入恢复模块；没有存储记录时返回 `{ project: createEmptyFurnishProject(roomMesh), recovered: false }`，JSON 解析成功时调用 `recoverFurnishProject`，解析失败时调用同一恢复函数生成带提示的空白结果。删除旧的 `isFurnishProject`。

- [ ] **Step 4: 按房间保存和清除恢复警告**

在 `FurnishState` 增加：

```ts
recoveryWarningsByRoomId: Partial<Record<string, string>>;
```

`loadProject` 使用 `result.project`，并克隆警告表后按 `roomMesh.id` 设置或删除 `result.warning`。`saveProject` 成功后克隆警告表并执行：

```ts
delete nextWarnings[nextProject.roomId];
```

然后同时清除 `saveError` 和该房间恢复警告。

- [ ] **Step 5: 显示可访问恢复提示**

软装页按当前 `roomMesh.id` 选择警告，并在 `statusStack` 内增加：

```tsx
{recoveryWarning ? (
  <View
    accessibilityLiveRegion="polite"
    accessibilityRole="alert"
    style={styles.recoveryNotice}
  >
    <Text style={styles.recoveryNoticeText}>{recoveryWarning}</Text>
  </View>
) : null}
```

样式使用现有暖色系统、最大宽度、圆角边框和居中文字，不增加交互按钮。

- [ ] **Step 6: 运行目标测试与 Mobile 验证**

Run:

```powershell
cd apps/mobile
node.exe --test tests/furnish-project-recovery.test.cjs tests/furnish-contract.test.cjs
npm.cmd run verify
```

Expected: 两个目标测试文件全部通过；Mobile 全部测试、TypeScript 和 Expo 公共配置通过。

- [ ] **Step 7: 提交接入增量**

```powershell
git add apps/mobile/services/furnishStorage.ts apps/mobile/stores/furnishStore.ts apps/mobile/screens/FurnishStudioScreen.tsx apps/mobile/tests/furnish-contract.test.cjs
git commit -m "fix(android): surface furnish draft recovery"
```

### Task 4: 文档、构建、模拟器与发布验证

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `docs/product/roomark-android-verification.md`
- Verify: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Verify: `apps/mobile/android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle`

- [ ] **Step 1: 记录真实恢复行为和限制**

在 Mobile README 的本地数据说明中记录选择性恢复、当前房型权威、警告与正常保存写回。在 Android 验证记录中增加本轮自动化、构建和模拟器证据，物理真机项目继续标记为待验证。

- [ ] **Step 2: 运行完整本地验证**

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/product-verify.ps1 -Full
git diff --check
```

Expected: Mobile、Repository、Public content、JavaScript、Backend tests 和 Backend formatting 全部通过；`git diff --check` 无输出。

- [ ] **Step 3: 构建 Android Debug 与 Release 离线资产**

Run:

```powershell
$env:JAVA_HOME='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\jdk17-portable\jdk-17.0.19+10'
$env:ANDROID_HOME='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
cd apps/mobile/android
.\gradlew.bat app:assembleDebug
.\gradlew.bat app:createBundleReleaseJsAndAssets
```

Expected: 两个 Gradle 任务均为 `BUILD SUCCESSFUL`，Debug APK 和 Release bundle 存在。

- [ ] **Step 4: 在 API 34 模拟器执行烟雾检查**

安装本轮 Debug APK，连接离线 Metro，启动 `com.roomark.app/.MainActivity`，打开任一软装页。确认页面、3D 场景和恢复提示接线没有 React Native 红屏或未处理 JavaScript 异常。若不能安全注入损坏数据库，只记录自动化恢复测试，不伪造设备损坏恢复结果。

- [ ] **Step 5: 写回本轮真实证据并提交**

```powershell
git add apps/mobile/README.md docs/product/roomark-android-verification.md
git commit -m "docs(android): record furnish draft recovery"
```

- [ ] **Step 6: 最终核对并推送公开主分支**

```powershell
git status --short
git log --oneline origin/main..HEAD
git push origin public-main:main
```

Expected: 推送成功，本地工作区干净，公开 `main` 指向本轮 HEAD。

- [ ] **Step 7: 等待并核验 GitHub CI**

```powershell
$headSha = git rev-parse HEAD
$runs = gh run list --repo Asaseal/roomark --limit 10 --json databaseId,name,status,conclusion,headSha,url | ConvertFrom-Json
$ciRunId = ($runs | Where-Object { $_.name -eq 'CI' -and $_.headSha -eq $headSha } | Select-Object -First 1).databaseId
if (-not $ciRunId) { throw "CI run not found for $headSha" }
gh run watch $ciRunId --repo Asaseal/roomark --exit-status --interval 5
```

Expected: Mobile、Backend、Public content 和 Container 作业全部成功；本地 HEAD 与 `origin/main` SHA 一致。

