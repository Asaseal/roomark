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
