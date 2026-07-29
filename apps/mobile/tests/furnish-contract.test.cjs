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

test("stored furnishing projects are validated before restore", () => {
  const storage = read(path.join("services", "furnishStorage.ts"));

  assert.match(storage, /isFurnishProject/);
  assert.match(storage, /Array\.isArray\(project\.placedFurniture\)/);
  assert.match(storage, /createEmptyFurnishProject\(roomMesh\)/);
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

test("furnish writes are serialized and expose retryable failure state", () => {
  const store = read(path.join("stores", "furnishStore.ts"));

  assert.match(store, /saveError\?: string/);
  assert.match(store, /pendingSave: boolean/);
  assert.match(store, /saveProject: \(project: FurnishProject\) => Promise<boolean>/);
  assert.match(store, /retrySave: \(\) => Promise<boolean>/);
  assert.match(store, /furnishPersistenceQueue/);
  assert.match(store, /return true/);
  assert.match(store, /return false/);
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
