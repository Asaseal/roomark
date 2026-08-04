const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const mobileRoot = path.resolve(__dirname, "..");

const roomMesh = {
  id: "room-storage",
  name: "存储测试房间",
  source: "floorplan",
  width: 3,
  depth: 3,
  height: 3,
  capturedAt: "2026-08-03T13:30:00.000Z"
};

function createProject(room) {
  return {
    id: `furnish-${room.id}`,
    roomId: room.id,
    roomMesh: room,
    placedFurniture: [],
    updatedAt: "2026-08-03T13:31:00.000Z",
    syncState: "local"
  };
}

function loadStorage({ runStorageRead }) {
  const source = fs.readFileSync(
    path.join(mobileRoot, "services", "furnishStorage.ts"),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const asyncStorage = {
    getItem: async () => null,
    removeItem: async () => {},
    setItem: async () => {}
  };
  const recovery = {
    createEmptyFurnishProject: createProject,
    recoverFurnishProject: (_value, room) => ({
      project: createProject(room),
      recovered: true,
      warning: "软装记录无法读取，已恢复空白布局。"
    })
  };
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === "@react-native-async-storage/async-storage") {
      return {
        __esModule: true,
        default: asyncStorage
      };
    }
    if (request === "./furnishProjectRecovery") {
      return recovery;
    }
    if (request === "./storageOperation") {
      return { runStorageRead };
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
