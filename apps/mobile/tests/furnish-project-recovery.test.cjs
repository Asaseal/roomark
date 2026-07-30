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
