# Roomark Android Furnish Project Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate cross-room soft-furnish load races by making project and loading state room-scoped while preserving all existing Android behavior.

**Architecture:** The Zustand store remains the single owner of furnishing projects, but removes global active-project and loading fields. A module-level in-flight Promise Map deduplicates reads per room, and `FurnishStudioScreen` selects the project and loading flag directly by `roomMesh.id`.

**Tech Stack:** React Native, TypeScript, Zustand, AsyncStorage, Node.js built-in test runner.

---

### Task 1: Reproduce Store Concurrency Behavior

**Files:**
- Create: `apps/mobile/tests/furnish-store-isolation.test.cjs`
- Modify: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: Write a real store harness with controlled storage reads**

Compile `stores/furnishStore.ts` with TypeScript and provide a minimal Zustand implementation plus controlled `loadFurnishProject` promises:

```js
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
    throw new Error(`Unexpected dependency: ${request}`);
  };
  Function("module", "exports", "require", compiled)(
    module,
    module.exports,
    localRequire
  );
  const store = module.exports.useFurnishStore;
  return { store, pendingLoads, getLoadCount: () => loadCount };
}
```

- [ ] **Step 2: Add the failing cross-room isolation test**

```js
test("concurrent room loads keep projects and loading state isolated", async () => {
  const { store, pendingLoads } = loadStore();
  const backgroundLoad = store.getState().loadProject(backgroundRoom);
  const studioLoad = store.getState().loadProject(studioRoom);

  pendingLoads.get(studioRoom.id)();
  await studioLoad;

  assert.equal(store.getState().loadingRoomIds[studioRoom.id], undefined);
  assert.equal(store.getState().loadingRoomIds[backgroundRoom.id], true);
  assert.equal(store.getState().projectsByRoomId[studioRoom.id].roomId, studioRoom.id);

  pendingLoads.get(backgroundRoom.id)();
  await backgroundLoad;

  assert.equal(store.getState().projectsByRoomId[backgroundRoom.id].roomId, backgroundRoom.id);
  assert.equal(Object.hasOwn(store.getState(), "activeProject"), false);
});
```

- [ ] **Step 3: Add the failing same-room deduplication test**

```js
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
```

- [ ] **Step 4: Update the screen contract before implementation**

Require `FurnishStudioScreen` to select `projectsByRoomId[roomMesh.id]` and `loadingRoomIds[roomMesh.id]`, and reject `activeProject` and `setActiveProject`.

- [ ] **Step 5: Run tests and verify RED**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-store-isolation.test.cjs tests/furnish-contract.test.cjs
```

Expected: the new tests fail because `loadingRoomIds` and room-scoped screen selectors do not exist, and because duplicate room reads call storage twice.

- [ ] **Step 6: Commit the failing tests**

```powershell
git add apps/mobile/tests/furnish-store-isolation.test.cjs apps/mobile/tests/furnish-contract.test.cjs
git commit -m "test(android): reproduce furnish load races"
```

### Task 2: Isolate Furnish Store State by Room

**Files:**
- Modify: `apps/mobile/stores/furnishStore.ts`

- [ ] **Step 1: Replace global state fields**

Change the store contract to:

```ts
type FurnishState = {
  projectsByRoomId: Record<string, FurnishProject>;
  loadingRoomIds: Partial<Record<string, true>>;
  recoveryWarningsByRoomId: Partial<Record<string, string>>;
  saveError?: string;
  pendingSave: boolean;
  loadProject: (roomMesh: RoomMesh) => Promise<FurnishProject>;
  setProject: (project: FurnishProject) => void;
  saveProject: (project: FurnishProject) => Promise<boolean>;
  retrySave: (roomId: string) => Promise<boolean>;
  hasProjectFurniture: (roomId: string) => boolean;
};
```

- [ ] **Step 2: Add per-room in-flight deduplication**

```ts
const furnishProjectLoads = new Map<string, Promise<FurnishProject>>();
```

`loadProject` must return an existing Promise for the same room, otherwise create one that marks only that room as loading, updates only that room, and clears only that room in `finally`.

- [ ] **Step 3: Remove global active-project writes**

`setProject` and `saveProject` update only `projectsByRoomId[project.roomId]`. `retrySave(roomId)` retrieves `projectsByRoomId[roomId]`.

- [ ] **Step 4: Run store tests and verify GREEN**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-store-isolation.test.cjs
```

Expected: both store isolation tests pass.

- [ ] **Step 5: Commit the store change**

```powershell
git add apps/mobile/stores/furnishStore.ts
git commit -m "fix(android): isolate furnish projects by room"
```

### Task 3: Integrate Room-Scoped Project Selection

**Files:**
- Modify: `apps/mobile/screens/FurnishStudioScreen.tsx`
- Modify: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: Select current room state**

Replace global selectors with:

```ts
const setProject = useFurnishStore((state) => state.setProject);
const project = useFurnishStore((state) => state.projectsByRoomId[roomMesh.id]);
const loading = useFurnishStore((state) => state.loadingRoomIds[roomMesh.id] ?? false);
```

- [ ] **Step 2: Replace active-project references**

Use `project` for exit flushing, Mock generation, Mock saving, loading gates and WebView props. Layout changes call `setProject(project)`.

- [ ] **Step 3: Run focused and full Mobile verification**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-store-isolation.test.cjs tests/furnish-contract.test.cjs
npm.cmd run verify
```

Expected: all Mobile tests, TypeScript and Expo public config pass.

- [ ] **Step 4: Commit screen integration**

```powershell
git add apps/mobile/screens/FurnishStudioScreen.tsx apps/mobile/tests/furnish-contract.test.cjs
git commit -m "fix(android): select furnish state by room"
```

### Task 4: Verify Android Runtime and Publish Evidence

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: Run full repository verification**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\product-verify.ps1 -Full
git diff --check
```

Expected: Mobile, repository, public-content and backend verification all pass.

- [ ] **Step 2: Build Android artifacts**

Run `app:assembleDebug app:createBundleReleaseJsAndAssets` with JDK 17 and Android SDK 34. Record the exact APK and offline bundle sizes.

- [ ] **Step 3: Exercise the API 34 emulator**

Preserve existing app data. Force-stop and restart Roomark, enter the sample soft-furnish project, confirm the saved GLB layout opens, add one existing furniture item, wait for the saved indicator, return to Library, force-stop again, and confirm that room’s incremented furniture count persists. Require zero React Native, AndroidRuntime and Chromium error entries.

- [ ] **Step 4: Update documentation**

Document room-scoped project ownership, same-room load deduplication, automated counts, artifact sizes and actual emulator observations. Keep physical-device, production-signing and store gates deferred.

- [ ] **Step 5: Run fresh verification and commit evidence**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\product-verify.ps1 -Full
git diff --check
git add apps/mobile/README.md docs/product/roomark-android-verification.md
git commit -m "docs(android): record furnish isolation evidence"
```

- [ ] **Step 6: Push and inspect CI**

Confirm `origin/main` still matches the recorded base, push `public-main:main`, and wait for every CI job to reach `success`.
