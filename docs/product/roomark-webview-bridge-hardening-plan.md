# Roomark WebView Bridge Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate every WebView-to-Native soft-furnish message before it reaches React state or device storage, invalidate stale Mock previews after visual layout changes, and reduce the embedded WebView to the permissions required by the existing offline scene.

**Architecture:** Add a pure `furnishSceneBridge` service that bounds and parses scene messages against the current `FurnishProject`, reusing the existing project recovery module for field-level validation. `FurnishWebView` becomes the single trust-boundary adapter: valid messages retain the current callbacks, invalid messages are ignored with one notice per WebView instance, and navigation/file policies are explicit. `FurnishStudioScreen` accepts the bridge-sanitized project without restoring an obsolete render preview.

**Tech Stack:** React Native 0.74, Expo SDK 51, TypeScript 5.3, react-native-webview 13.8, Zustand, Node `node:test`.

---

### Task 1: Specify WebView bridge behavior

**Files:**
- Create: `apps/mobile/tests/furnish-scene-bridge.test.cjs`
- Reference: `apps/mobile/types/furnish.ts`
- Reference: `apps/mobile/services/furnishProjectRecovery.ts`

- [ ] **Step 1: Add a TypeScript test loader with local dependency injection**

Create `apps/mobile/tests/furnish-scene-bridge.test.cjs` with:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const mobileRoot = path.resolve(__dirname, "..");

function compileService(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.join(mobileRoot, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (Object.hasOwn(dependencies, request)) {
      return dependencies[request];
    }
    throw new Error(`Unexpected test dependency: ${request}`);
  };
  Function("module", "exports", "require", compiled)(
    module,
    module.exports,
    localRequire
  );
  return module.exports;
}

function loadBridgeService() {
  const recovery = compileService(
    path.join("services", "furnishProjectRecovery.ts")
  );
  return compileService(
    path.join("services", "furnishSceneBridge.ts"),
    { "./furnishProjectRecovery": recovery }
  );
}
```

- [ ] **Step 2: Add stable room, furniture, preview, and project fixtures**

Append:

```js
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
    renderPreview: {
      ...renderPreview,
      basis: { ...renderPreview.basis }
    },
    updatedAt: "2026-07-30T08:04:00.000Z",
    syncState: "local",
    ...overrides
  };
}

function sceneMessage(project) {
  return JSON.stringify({ type: "PROJECT_CHANGED", project });
}
```

- [ ] **Step 3: Add passing-protocol and input-boundary tests**

Append:

```js
test("valid scene messages are parsed into the existing protocol", () => {
  const { parseFurnishSceneMessage } = loadBridgeService();
  const currentProject = createProject();

  assert.deepEqual(
    parseFurnishSceneMessage('{"type":"SCENE_READY"}', currentProject),
    { ok: true, message: { type: "SCENE_READY" } }
  );
  assert.deepEqual(
    parseFurnishSceneMessage(
      '{"type":"FURNITURE_SELECTED","furnitureId":"furn-1"}',
      currentProject
    ),
    {
      ok: true,
      message: { type: "FURNITURE_SELECTED", furnitureId: "furn-1" }
    }
  );
  assert.deepEqual(
    parseFurnishSceneMessage(
      '{"type":"FURNITURE_SELECTED","furnitureId":null}',
      currentProject
    ),
    {
      ok: true,
      message: { type: "FURNITURE_SELECTED", furnitureId: null }
    }
  );
  assert.deepEqual(
    parseFurnishSceneMessage(
      '{"type":"SCENE_NOTICE","message":"家具已加载"}',
      currentProject
    ),
    {
      ok: true,
      message: { type: "SCENE_NOTICE", message: "家具已加载" }
    }
  );
  assert.deepEqual(
    parseFurnishSceneMessage(
      '{"type":"SCENE_ERROR","message":"场景加载失败"}',
      currentProject
    ),
    {
      ok: true,
      message: { type: "SCENE_ERROR", message: "场景加载失败" }
    }
  );
});

test("invalid json, unknown types, long text, and oversized payloads are rejected", () => {
  const {
    MAX_FURNISH_SCENE_MESSAGE_LENGTH,
    parseFurnishSceneMessage
  } = loadBridgeService();
  const currentProject = createProject();

  assert.equal(
    parseFurnishSceneMessage("{", currentProject).reason,
    "invalid-json"
  );
  assert.equal(
    parseFurnishSceneMessage('{"type":"UNKNOWN"}', currentProject).reason,
    "invalid-message"
  );
  assert.equal(
    parseFurnishSceneMessage(
      JSON.stringify({ type: "SCENE_NOTICE", message: "x".repeat(241) }),
      currentProject
    ).reason,
    "invalid-message"
  );
  assert.equal(
    parseFurnishSceneMessage(
      "x".repeat(MAX_FURNISH_SCENE_MESSAGE_LENGTH + 1),
      currentProject
    ).reason,
    "too-large"
  );
});
```

- [ ] **Step 4: Add project-integrity and preview-consistency tests**

Append:

```js
test("forged rooms, dropped furniture, and excessive furniture are rejected", () => {
  const {
    MAX_FURNISH_SCENE_FURNITURE,
    parseFurnishSceneMessage
  } = loadBridgeService();
  const currentProject = createProject();
  const malformedFurniture = { ...furniture, position: [0, 0] };
  const excessiveFurniture = Array.from(
    { length: MAX_FURNISH_SCENE_FURNITURE + 1 },
    (_, index) => ({ ...furniture, id: `furn-${index}` })
  );

  for (const project of [
    createProject({ id: "forged-project" }),
    createProject({ roomId: "forged-room" }),
    createProject({ placedFurniture: [malformedFurniture] }),
    createProject({ placedFurniture: excessiveFurniture })
  ]) {
    assert.equal(
      parseFurnishSceneMessage(sceneMessage(project), currentProject).reason,
      "invalid-message"
    );
  }
});

test("safe repairs stay bounded while visual changes invalidate old previews", () => {
  const { parseFurnishSceneMessage } = loadBridgeService();
  const currentProject = createProject();
  const moved = {
    ...furniture,
    position: [99, 0, -99]
  };
  const result = parseFurnishSceneMessage(
    sceneMessage(createProject({ placedFurniture: [moved] })),
    currentProject
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.message.project.placedFurniture[0].position,
    [2.35, 0, -1.65]
  );
  assert.equal(result.message.project.renderPreview, undefined);
});

test("locking furniture does not invalidate an otherwise current preview", () => {
  const { parseFurnishSceneMessage } = loadBridgeService();
  const currentProject = createProject();
  const locked = { ...furniture, locked: true };
  const result = parseFurnishSceneMessage(
    sceneMessage(createProject({ placedFurniture: [locked] })),
    currentProject
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.message.project.renderPreview, renderPreview);
  assert.equal(result.message.project.placedFurniture[0].locked, true);
});

test("only embedded furnish document navigation is allowed", () => {
  const { isAllowedFurnishNavigation } = loadBridgeService();

  assert.equal(isAllowedFurnishNavigation("about:blank"), true);
  assert.equal(
    isAllowedFurnishNavigation("data:text/html;charset=utf-8,roomark"),
    true
  );
  assert.equal(isAllowedFurnishNavigation("https://example.com"), false);
  assert.equal(isAllowedFurnishNavigation("http://example.com"), false);
  assert.equal(isAllowedFurnishNavigation("file:///sdcard/test.html"), false);
  assert.equal(isAllowedFurnishNavigation("roomark://external"), false);
});
```

- [ ] **Step 5: Run the focused tests and verify RED**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-scene-bridge.test.cjs
```

Expected: FAIL because `services/furnishSceneBridge.ts` does not exist.

- [ ] **Step 6: Commit the failing behavior tests**

```powershell
git add apps/mobile/tests/furnish-scene-bridge.test.cjs
git commit -m "test(android): cover webview bridge boundary"
```

### Task 2: Implement the pure bridge boundary

**Files:**
- Create: `apps/mobile/services/furnishSceneBridge.ts`
- Test: `apps/mobile/tests/furnish-scene-bridge.test.cjs`

- [ ] **Step 1: Add constants, parse result, and primitive validators**

Create `apps/mobile/services/furnishSceneBridge.ts` with:

```ts
import type {
  FurnishProject,
  FurnishSceneMessage,
  PlacedFurniture
} from "../types/furnish";
import { recoverFurnishProject } from "./furnishProjectRecovery";

export const MAX_FURNISH_SCENE_MESSAGE_LENGTH = 256_000;
export const MAX_FURNISH_SCENE_FURNITURE = 256;

const MAX_FURNISH_SCENE_TEXT_LENGTH = 240;
const MAX_FURNITURE_ID_LENGTH = 128;

export type FurnishSceneMessageParseResult =
  | { ok: true; message: FurnishSceneMessage }
  | {
      ok: false;
      reason: "too-large" | "invalid-json" | "invalid-message";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}
```

- [ ] **Step 2: Add visual-layout comparison**

Append:

```ts
function equalVector(left: number[], right: number[]) {
  return (
    left.length === right.length &&
    left.every((component, index) => component === right[index])
  );
}

function sameVisualFurniture(
  left: PlacedFurniture,
  right: PlacedFurniture
) {
  return (
    left.id === right.id &&
    left.assetId === right.assetId &&
    left.category === right.category &&
    left.modelUri === right.modelUri &&
    equalVector(left.position, right.position) &&
    equalVector(left.rotation, right.rotation) &&
    equalVector(left.scale, right.scale)
  );
}

function sameVisualLayout(
  left: PlacedFurniture[],
  right: PlacedFurniture[]
) {
  return (
    left.length === right.length &&
    left.every((furniture, index) =>
      sameVisualFurniture(furniture, right[index])
    )
  );
}
```

- [ ] **Step 3: Validate `PROJECT_CHANGED` against the current project**

Append:

```ts
function parseChangedProject(
  value: unknown,
  currentProject: FurnishProject
): FurnishSceneMessageParseResult {
  if (
    !isRecord(value) ||
    value.id !== currentProject.id ||
    value.roomId !== currentProject.roomId ||
    !Array.isArray(value.placedFurniture) ||
    value.placedFurniture.length > MAX_FURNISH_SCENE_FURNITURE
  ) {
    return { ok: false, reason: "invalid-message" };
  }

  const recovered = recoverFurnishProject(
    value,
    currentProject.roomMesh
  ).project;

  if (
    recovered.id !== currentProject.id ||
    recovered.placedFurniture.length !== value.placedFurniture.length
  ) {
    return { ok: false, reason: "invalid-message" };
  }

  const visualLayoutUnchanged = sameVisualLayout(
    currentProject.placedFurniture,
    recovered.placedFurniture
  );
  const project: FurnishProject = {
    ...recovered,
    syncState: "local",
    ...(visualLayoutUnchanged && recovered.renderPreview
      ? { renderPreview: recovered.renderPreview }
      : { renderPreview: undefined })
  };

  return {
    ok: true,
    message: { type: "PROJECT_CHANGED", project }
  };
}
```

- [ ] **Step 4: Parse all five message variants before dispatch**

Append:

```ts
export function parseFurnishSceneMessage(
  raw: string,
  currentProject: FurnishProject
): FurnishSceneMessageParseResult {
  if (raw.length > MAX_FURNISH_SCENE_MESSAGE_LENGTH) {
    return { ok: false, reason: "too-large" };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  if (!isRecord(value) || typeof value.type !== "string") {
    return { ok: false, reason: "invalid-message" };
  }

  if (value.type === "SCENE_READY") {
    return { ok: true, message: { type: "SCENE_READY" } };
  }

  if (value.type === "PROJECT_CHANGED") {
    return parseChangedProject(value.project, currentProject);
  }

  if (
    value.type === "FURNITURE_SELECTED" &&
    (value.furnitureId === null ||
      isBoundedText(value.furnitureId, MAX_FURNITURE_ID_LENGTH))
  ) {
    return {
      ok: true,
      message: {
        type: "FURNITURE_SELECTED",
        furnitureId: value.furnitureId
      }
    };
  }

  if (
    (value.type === "SCENE_ERROR" || value.type === "SCENE_NOTICE") &&
    isBoundedText(value.message, MAX_FURNISH_SCENE_TEXT_LENGTH)
  ) {
    return {
      ok: true,
      message: { type: value.type, message: value.message }
    };
  }

  return { ok: false, reason: "invalid-message" };
}

export function isAllowedFurnishNavigation(url: string) {
  return (
    url === "about:blank" ||
    url.startsWith("data:text/html") ||
    url.startsWith("data:text/html;")
  );
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-scene-bridge.test.cjs
```

Expected: 6 tests passed, 0 failed.

- [ ] **Step 6: Run TypeScript and fix only bridge type errors**

Run:

```powershell
cd apps/mobile
npm.cmd run typecheck
```

Expected: `tsc --noEmit` exits 0.

- [ ] **Step 7: Commit the pure bridge**

```powershell
git add apps/mobile/services/furnishSceneBridge.ts
git commit -m "fix(android): validate webview scene messages"
```

### Task 3: Integrate the bridge and minimum WebView permissions

**Files:**
- Modify: `apps/mobile/components/FurnishWebView.tsx`
- Modify: `apps/mobile/screens/FurnishStudioScreen.tsx`
- Modify: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: Add a failing component contract**

Append to `apps/mobile/tests/furnish-contract.test.cjs`:

```js
test("WebView trust boundary validates messages and uses minimum capabilities", () => {
  const bridge = read(path.join("components", "FurnishWebView.tsx"));
  const screen = read(path.join("screens", "FurnishStudioScreen.tsx"));

  assert.match(bridge, /parseFurnishSceneMessage/);
  assert.match(bridge, /isAllowedFurnishNavigation/);
  assert.match(bridge, /invalidSceneMessageNoticedRef/);
  assert.match(bridge, /已忽略异常的 3D 场景消息，当前布局未保存/);
  assert.doesNotMatch(
    bridge,
    /JSON\.parse\(event\.nativeEvent\.data\) as FurnishSceneMessage/
  );
  assert.match(bridge, /originWhitelist=\{\["about:blank", "data:text\\/html\\*"\]\}/);
  assert.match(bridge, /allowFileAccess=\{false\}/);
  assert.match(bridge, /allowFileAccessFromFileURLs=\{false\}/);
  assert.match(bridge, /allowUniversalAccessFromFileURLs=\{false\}/);
  assert.match(bridge, /mixedContentMode="never"/);
  assert.match(bridge, /setSupportMultipleWindows=\{false\}/);
  assert.match(bridge, /onShouldStartLoadWithRequest/);
  assert.doesNotMatch(
    screen,
    /project\.renderPreview \|\| !activeProject\?\.renderPreview/
  );
  assert.match(screen, /setActiveProject\(project\)/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-contract.test.cjs
```

Expected: the new trust-boundary test fails because the component still parses directly and grants broad capabilities.

- [ ] **Step 3: Route scene messages through the pure parser**

In `apps/mobile/components/FurnishWebView.tsx`:

```ts
import type { FurnishNativeMessage, FurnishProject, FurnitureAsset } from "../types/furnish";
import {
  isAllowedFurnishNavigation,
  parseFurnishSceneMessage
} from "../services/furnishSceneBridge";
```

Add beside the existing refs:

```ts
const invalidSceneMessageNoticedRef = useRef(false);
```

Reset it in `restartScene` before incrementing the key:

```ts
invalidSceneMessageNoticedRef.current = false;
```

Replace `handleMessage` with:

```ts
const handleMessage = (event: WebViewMessageEvent) => {
  const result = parseFurnishSceneMessage(
    event.nativeEvent.data,
    project
  );

  if (!result.ok) {
    if (!invalidSceneMessageNoticedRef.current) {
      invalidSceneMessageNoticedRef.current = true;
      onSceneNotice("已忽略异常的 3D 场景消息，当前布局未保存");
    }
    return;
  }

  const message = result.message;
  if (message.type === "SCENE_READY") {
    clearLoadTimeout();
    automaticRecoveryAttemptedRef.current = false;
    setSceneReady(true);
    onSceneReadyChanged(true);
    setLoadError(null);
    onSceneReady();
  }

  if (message.type === "PROJECT_CHANGED") {
    onProjectChanged(message.project);
  }

  if (message.type === "FURNITURE_SELECTED") {
    onFurnitureSelected(message.furnitureId);
  }

  if (message.type === "SCENE_ERROR") {
    clearLoadTimeout();
    setLoadError(message.message);
    setSceneReady(false);
    onSceneReadyChanged(false);
    onSceneError(message.message);
  }

  if (message.type === "SCENE_NOTICE") {
    onSceneNotice(message.message);
  }
};
```

- [ ] **Step 4: Apply the WebView minimum capability policy**

Replace the broad WebView props with:

```tsx
<WebView
  key={webViewKey}
  ref={webViewRef}
  originWhitelist={["about:blank", "data:text/html*"]}
  source={{ html: sceneHtml, baseUrl: "" }}
  javaScriptEnabled
  domStorageEnabled={false}
  allowFileAccess={false}
  allowFileAccessFromFileURLs={false}
  allowUniversalAccessFromFileURLs={false}
  mixedContentMode="never"
  setSupportMultipleWindows={false}
  onShouldStartLoadWithRequest={(request) =>
    isAllowedFurnishNavigation(request.url)
  }
  onMessage={handleMessage}
  onRenderProcessGone={handleRenderProcessGone}
  onError={() => {
    setLoadError("WebView 加载失败，请点击重试");
    setSceneReady(false);
    onSceneReadyChanged(false);
    onSceneError("WebView 加载失败，请点击重试");
  }}
  style={styles.webView}
/>
```

- [ ] **Step 5: Stop restoring stale previews in the screen**

In `handleProjectChanged`, replace:

```ts
const projectToSave =
  project.renderPreview || !activeProject?.renderPreview
    ? project
    : { ...project, renderPreview: activeProject.renderPreview };
```

Use the parser-sanitized `project` directly:

```ts
setStatusText(
  furnitureCount > 0
    ? `已摆放 ${furnitureCount} 件家具`
    : "房间已清空"
);
setSaveText("等待保存");
setActiveProject(project);
pendingProjectRef.current = project;
```

Remove `activeProject?.renderPreview` from the callback dependency list.

Update the existing “studio keeps the latest layout in memory” contract to search for:

```js
assert.match(screen, /setActiveProject\(project\)/);
const memoryDraftIndex = screen.indexOf("setActiveProject(project)");
const pendingDraftIndex = screen.indexOf("pendingProjectRef.current = project");
assert.ok(memoryDraftIndex >= 0 && memoryDraftIndex < pendingDraftIndex);
```

- [ ] **Step 6: Run focused contracts, bridge behavior, and typecheck**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-scene-bridge.test.cjs tests/furnish-contract.test.cjs
npm.cmd run typecheck
```

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit the integration**

```powershell
git add apps/mobile/components/FurnishWebView.tsx apps/mobile/screens/FurnishStudioScreen.tsx apps/mobile/tests/furnish-contract.test.cjs
git commit -m "fix(android): harden embedded furnish webview"
```

### Task 4: Verify Android behavior and publish evidence

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: Run the complete local verification**

Run from repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\product-verify.ps1 -Full
git diff --check
```

Expected: Mobile tests, TypeScript, Expo config, 33 repository contracts, 7 public policy tests, backend tests, backend formatting, and `git diff --check` all pass.

- [ ] **Step 2: Build the Android debug app and offline release bundle**

Run with the configured JDK 17 and Android SDK:

```powershell
cd apps/mobile/android
.\gradlew.bat app:assembleDebug app:createBundleReleaseJsAndAssets --console=plain
```

Expected: Gradle exits 0 and both files exist:

```text
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
apps/mobile/android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle
```

- [ ] **Step 3: Install and exercise the existing soft-furnish flow**

Run:

```powershell
adb -s emulator-5554 install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 reverse tcp:8081 tcp:8081
```

Start offline Metro, open Roomark, enter the sample property’s soft-furnish screen, add or move one furniture item, wait for the saved state, return to Library, and reopen the room.

Expected:

- Local scene reaches ready state.
- Bundled GLB loads or the existing placeholder degradation appears.
- Furniture count updates and persists after reopening.
- An existing saved Mock preview is removed after visual layout change.
- No external page opens from the embedded scene.
- `ReactNativeJS:E`, `AndroidRuntime:E`, and `chromium:E` logcat filters return no app errors.

- [ ] **Step 4: Record only observed evidence**

Update `apps/mobile/README.md` to state that WebView messages are size- and schema-checked before persistence, invalid messages keep the current project, and the embedded scene uses local-only navigation and minimum file/network capabilities.

Update `docs/product/roomark-android-verification.md` with:

- new Mobile test count,
- exact Gradle outcomes and artifact sizes,
- exact API 34 simulator flow observed,
- whether the GLB or placeholder path was used,
- confirmation that stale Mock state cleared after layout changes,
- logcat result,
- unchanged physical-device and production-signing gates.

- [ ] **Step 5: Run final verification after documentation**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\product-verify.ps1 -Full
git diff --check
```

Expected: all checks pass with the documented Mobile test count.

- [ ] **Step 6: Commit evidence**

```powershell
git add apps/mobile/README.md docs/product/roomark-android-verification.md
git commit -m "docs(android): record webview bridge hardening"
```

- [ ] **Step 7: Push and verify public CI**

Confirm `origin/main` has not advanced, then:

```powershell
git push origin public-main:main
```

Wait for the triggered GitHub Actions run.

Expected:

- `backend`: success
- `public-content`: success
- `container`: success
- `mobile`: success
- local `HEAD` equals `origin/main`
- linked worktree is clean
