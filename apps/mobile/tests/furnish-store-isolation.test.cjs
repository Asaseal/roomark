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
  const pendingSaves = [];
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
      pendingLoads.set(roomMesh.id, (result = {
        project: createProject(roomMesh),
        recovered: false
      }) => resolve(result));
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
        saveFurnishProject: (project) =>
          new Promise((resolve, reject) => {
            pendingSaves.push({
              project,
              resolve,
              reject
            });
          })
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
    pendingSaves,
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
  assert.equal(pendingSaves.length, 2);
  const studioWrite = pendingSaves.find(
    ({ project }) => project.roomId === studioRoom.id
  );
  const backgroundWrite = pendingSaves.find(
    ({ project }) => project.roomId === backgroundRoom.id
  );
  assert.ok(studioWrite);
  assert.ok(backgroundWrite);
  studioWrite.reject(new Error("studio write failed"));
  assert.equal(await studioSave, false);

  assert.deepEqual(store.getState().saveErrorsByRoomId, {
    [studioRoom.id]: "软装布局尚未写入设备，请重试。"
  });
  assert.deepEqual(store.getState().pendingSaveRoomIds, {
    [backgroundRoom.id]: true
  });

  backgroundWrite.resolve();
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

test("a pending write in one room does not block another room", async () => {
  const { store, pendingSaves } = loadStore();
  const studioSave = store.getState().saveProject(createProject(studioRoom));
  const backgroundSave = store
    .getState()
    .saveProject(createProject(backgroundRoom));

  await Promise.resolve();

  assert.equal(pendingSaves.length, 2);
  const studioWrite = pendingSaves.find(
    ({ project }) => project.roomId === studioRoom.id
  );
  const backgroundWrite = pendingSaves.find(
    ({ project }) => project.roomId === backgroundRoom.id
  );
  assert.ok(studioWrite);
  assert.ok(backgroundWrite);

  backgroundWrite.resolve();
  assert.equal(await backgroundSave, true);
  assert.deepEqual(store.getState().pendingSaveRoomIds, {
    [studioRoom.id]: true
  });

  studioWrite.resolve();
  assert.equal(await studioSave, true);
  assert.deepEqual(store.getState().pendingSaveRoomIds, {});
});

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
