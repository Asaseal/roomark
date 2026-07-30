const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const mobileRoot = path.resolve(__dirname, "..");

const studioRoom = {
  id: "room-studio",
  name: "当前工作室",
  source: "floorplan",
  width: 3,
  depth: 3,
  height: 3,
  capturedAt: "2026-07-30T08:00:00.000Z"
};

const backgroundRoom = {
  id: "room-background",
  name: "后台房间",
  source: "floorplan",
  width: 4,
  depth: 3.2,
  height: 2.8,
  capturedAt: "2026-07-30T08:01:00.000Z"
};

function createProject(roomMesh) {
  return {
    id: `furnish-${roomMesh.id}`,
    roomId: roomMesh.id,
    roomMesh,
    placedFurniture: [],
    updatedAt: "2026-07-30T08:02:00.000Z",
    syncState: "local"
  };
}

function loadStore() {
  const source = fs.readFileSync(
    path.join(mobileRoot, "stores", "furnishStore.ts"),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const pendingLoads = new Map();
  let loadCount = 0;
  const create = (initializer) => {
    let state;
    const set = (next) => {
      state = {
        ...state,
        ...(typeof next === "function" ? next(state) : next)
      };
    };
    const get = () => state;
    state = initializer(set, get);
    const hook = (selector) => selector(state);
    hook.getState = get;
    return hook;
  };
  const loadFurnishProject = (roomMesh) => {
    loadCount += 1;
    return new Promise((resolve) => {
      pendingLoads.set(roomMesh.id, () => resolve({
        project: createProject(roomMesh),
        recovered: false
      }));
    });
  };
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === "zustand") {
      return { create };
    }
    if (request === "../services/furnishStorage") {
      return {
        loadFurnishProject,
        saveFurnishProject: async () => {}
      };
    }
    throw new Error(`Unexpected test dependency: ${request}`);
  };
  Function("module", "exports", "require", compiled)(
    module,
    module.exports,
    localRequire
  );
  return {
    store: module.exports.useFurnishStore,
    pendingLoads,
    getLoadCount: () => loadCount
  };
}

test("concurrent room loads keep projects and loading state isolated", async () => {
  const { store, pendingLoads } = loadStore();
  const backgroundLoad = store.getState().loadProject(backgroundRoom);
  const studioLoad = store.getState().loadProject(studioRoom);

  assert.deepEqual(store.getState().loadingRoomIds, {
    [backgroundRoom.id]: true,
    [studioRoom.id]: true
  });

  pendingLoads.get(studioRoom.id)();
  await studioLoad;

  assert.deepEqual(store.getState().loadingRoomIds, {
    [backgroundRoom.id]: true
  });
  assert.equal(
    store.getState().projectsByRoomId[studioRoom.id].roomId,
    studioRoom.id
  );

  pendingLoads.get(backgroundRoom.id)();
  await backgroundLoad;

  assert.deepEqual(store.getState().loadingRoomIds, {});
  assert.equal(
    store.getState().projectsByRoomId[backgroundRoom.id].roomId,
    backgroundRoom.id
  );
  assert.equal(Object.hasOwn(store.getState(), "activeProject"), false);
});

test("concurrent reads for one room reuse the same storage operation", async () => {
  const { store, pendingLoads, getLoadCount } = loadStore();
  const first = store.getState().loadProject(studioRoom);
  const second = store.getState().loadProject(studioRoom);

  assert.equal(getLoadCount(), 1);
  pendingLoads.get(studioRoom.id)();
  const [firstProject, secondProject] = await Promise.all([first, second]);

  assert.equal(firstProject.roomId, studioRoom.id);
  assert.equal(secondProject.roomId, studioRoom.id);
});
