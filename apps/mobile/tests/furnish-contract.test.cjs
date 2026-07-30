const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mobileRoot = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(mobileRoot, relativePath), "utf8");

test("native and scene bridge handle the complete existing message protocol", () => {
  const types = read(path.join("types", "furnish.ts"));
  const bridge = read(path.join("components", "FurnishWebView.tsx"));

  for (const message of ["SCENE_READY", "PROJECT_CHANGED", "FURNITURE_SELECTED", "SCENE_ERROR", "SCENE_NOTICE"]) {
    assert.match(types, new RegExp(`"${message}"`));
    assert.match(bridge, new RegExp(`message\\.type === "${message}"`));
  }

  for (const action of ["INIT_PROJECT", "ADD_FURNITURE", "LOCK_SELECTED", "DELETE_SELECTED", "RESET_CAMERA"]) {
    assert.match(types, new RegExp(`"${action}"`));
  }
});

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

test("scene changes debounce saves and flush on exit", () => {
  const screen = read(path.join("screens", "FurnishStudioScreen.tsx"));

  assert.match(screen, /projectSaveTimerRef/);
  assert.match(screen, /setTimeout/);
  assert.match(screen, /flushProjectSave/);
});

test("mock render is labelled honestly and writes status back to the product", () => {
  const screen = read(path.join("screens", "FurnishStudioScreen.tsx"));
  const app = read("App.tsx");
  const store = read(path.join("stores", "productStore.ts"));

  assert.match(screen, /Mock 效果图/);
  assert.match(screen, /onProjectStatusChanged/);
  assert.match(app, /onProjectStatusChanged/);
  assert.match(store, /updateProjectStatus:/);
});

test("project status updates do not reload already hydrated furnishing projects", () => {
  const app = read("App.tsx");

  assert.match(app, /furnishProjectRequestsRef/);
  assert.match(
    app,
    /if \(projectsByRoomId\[roomId\] \|\| furnishProjectRequestsRef\.current\.has\(roomId\)\) \{/
  );
  assert.match(app, /\[loadProject, projectsByRoomId, propertiesById\]/);
});

test("furnish writes are serialized and expose retryable failure state", () => {
  const store = read(path.join("stores", "furnishStore.ts"));

  assert.match(store, /saveError\?: string/);
  assert.match(store, /pendingSave: boolean/);
  assert.match(store, /saveProject: \(project: FurnishProject\) => Promise<boolean>/);
  assert.match(store, /retrySave: \(\) => Promise<boolean>/);
  assert.match(store, /furnishPersistenceQueue/);
  assert.match(store, /return true/);
  assert.match(store, /return false/);
  assert.match(store, /delete nextWarnings\[nextProject\.roomId\]/);
});

test("studio keeps failed layouts pending and only reports successful saves", () => {
  const screen = read(path.join("screens", "FurnishStudioScreen.tsx"));

  assert.match(screen, /setSaveText\("等待保存"\)/);
  assert.match(screen, /setSaveText\("正在保存…"\)/);
  assert.match(screen, /const persisted = await saveProject/);
  assert.match(screen, /if \(!persisted\)/);
  assert.match(screen, /pendingProjectRef\.current = pendingProject/);
  assert.match(screen, /onProjectStatusChanged\(pendingProject\)/);
  assert.match(screen, /重试保存/);
});

test("3D failure offers retry and return while scene actions stay disabled", () => {
  const bridge = read(path.join("components", "FurnishWebView.tsx"));
  const screen = read(path.join("screens", "FurnishStudioScreen.tsx"));

  assert.match(bridge, /onSceneReadyChanged: \(ready: boolean\) => void/);
  assert.match(bridge, /返回房源详情/);
  assert.match(bridge, /onExit/);
  assert.match(screen, /sceneReady/);
  assert.match(screen, /accessibilityState=\{\{ disabled: !sceneReady \}\}/);
  assert.match(screen, /disabled=\{!sceneReady\}/);
});

test("studio owns Android back and stays open when flush fails", () => {
  const screen = read(path.join("screens", "FurnishStudioScreen.tsx"));
  const app = read("App.tsx");

  assert.match(screen, /BackHandler\.addEventListener\("hardwareBackPress"/);
  assert.match(screen, /const persisted = await flushProjectSave\(\)/);
  assert.match(screen, /if \(persisted\) \{\s*onBack\(\)/);
  assert.doesNotMatch(app, /if \(studioRoom\) \{\s*setStudioRoom\(null\)/);
});

test("3D furnishing runtime is bundled for first-run offline use", () => {
  const bridge = read(path.join("components", "FurnishWebView.tsx"));
  const scene = read(path.join("webview", "furnish-scene", "sceneHtml.ts"));
  const metro = read("metro.config.js");
  const packageJson = JSON.parse(read("package.json"));
  const generatorPath = path.join(mobileRoot, "scripts", "build-furnish-runtime.cjs");
  const runtimePath = path.join(
    mobileRoot,
    "assets",
    "vendor",
    "furnish-runtime.js.txt",
  );
  const licensePath = path.join(
    mobileRoot,
    "assets",
    "vendor",
    "three-LICENSE.txt",
  );

  assert.doesNotMatch(scene, /https?:\/\//);
  assert.doesNotMatch(scene, /<script\s+src=/);
  assert.match(scene, /getFurnishSceneHtml\(runtimeSource: string\)/);
  assert.match(scene, /escapeInlineScript\(runtimeSource\)/);
  assert.match(bridge, /furnish-runtime\.js\.txt/);
  assert.match(bridge, /Asset\.loadAsync\(furnishRuntimeModule\)/);
  assert.match(bridge, /FileSystem\.readAsStringAsync\(readableRuntimeUri\)/);
  assert.match(bridge, /getFurnishSceneHtml\(runtimeSource\)/);
  assert.match(metro, /"txt"/);
  assert.equal(packageJson.devDependencies.three, "0.132.2");
  assert.match(packageJson.scripts["build:furnish-runtime"], /build-furnish-runtime\.cjs/);
  assert.equal(fs.existsSync(generatorPath), true);
  assert.equal(fs.existsSync(runtimePath), true);
  assert.equal(fs.existsSync(licensePath), true);

  const runtime = fs.readFileSync(runtimePath, "utf8");
  const license = fs.readFileSync(licensePath, "utf8");
  assert.ok(runtime.length > 500_000, "bundled Three.js runtime is unexpectedly small");
  assert.match(runtime, /OrbitControls/);
  assert.match(runtime, /GLTFLoader/);
  assert.doesNotMatch(runtime, /https?:\/\/cdn\.jsdelivr\.net/);
  assert.match(license, /MIT License/);
});

test("studio keeps the latest layout in memory and flushes it when the app backgrounds", () => {
  const screen = read(path.join("screens", "FurnishStudioScreen.tsx"));

  assert.match(screen, /AppState/);
  assert.match(screen, /const setActiveProject = useFurnishStore/);
  assert.match(screen, /setActiveProject\(project\)/);
  assert.match(screen, /AppState\.addEventListener\("change"/);
  assert.match(screen, /nextState !== "active"/);
  assert.match(screen, /void flushProjectSave\(\)/);

  const memoryDraftIndex = screen.indexOf("setActiveProject(project)");
  const pendingDraftIndex = screen.indexOf("pendingProjectRef.current = project");
  assert.ok(memoryDraftIndex >= 0 && memoryDraftIndex < pendingDraftIndex);
});

test("Android WebView renderer exit recovers once before showing manual fallback", () => {
  const bridge = read(path.join("components", "FurnishWebView.tsx"));

  assert.match(bridge, /WebViewRenderProcessGoneEvent/);
  assert.match(bridge, /automaticRecoveryAttemptedRef/);
  assert.match(bridge, /onRenderProcessGone=\{handleRenderProcessGone\}/);
  assert.match(bridge, /if \(!automaticRecoveryAttemptedRef\.current\)/);
  assert.match(bridge, /automaticRecoveryAttemptedRef\.current = true/);
  assert.match(bridge, /automaticRecoveryAttemptedRef\.current = false/);
  assert.match(bridge, /3D 场景意外退出，正在恢复/);
  assert.match(bridge, /3D 场景连续恢复失败，请重试或返回房源详情/);
});

test("3D loading timeout starts after the local scene is ready to mount", () => {
  const bridge = read(path.join("components", "FurnishWebView.tsx"));

  assert.match(bridge, /const SCENE_LOAD_TIMEOUT_MS = 45000/);
  assert.match(bridge, /if \(!sceneHtml\) \{\s*return;/);
  assert.match(bridge, /}, \[clearLoadTimeout, onSceneError, onSceneReadyChanged, sceneHtml, webViewKey\]\);/);
});

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
  assert.match(bridge, /originWhitelist=\{\["about:blank", "data:text\/html\*"\]\}/);
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
