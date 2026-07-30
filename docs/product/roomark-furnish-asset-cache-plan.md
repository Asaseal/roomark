# Roomark Android 3D Static Asset Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse successful bundled 3D runtime and GLB preparation work within one Android process while preserving retry and WebView security behavior.

**Architecture:** Add a focused service that owns successful Promise caches for scene HTML and per-model Base64 URIs. Failed runtime and model attempts are removed from the cache, while `FurnishWebView` keeps the static Metro asset map and delegates file preparation to the service.

**Tech Stack:** React Native 0.74, Expo Asset, Expo FileSystem, TypeScript 5.3, Node.js `node:test`.

---

### Task 1: Specify retryable cache behavior

**Files:**
- Create: `apps/mobile/tests/furnish-asset-cache.test.cjs`
- Modify: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: Add a compiled service harness**

Compile `services/furnishAssetCache.ts` with TypeScript and provide controlled `expo-asset`, `expo-file-system`, and `sceneHtml` dependencies. Track Asset and FileSystem call counts separately for runtime and Base64 model reads.

```js
function loadAssetCache({ failRuntimeReadOnce = false, failModelReadOnce = false } = {}) {
  const source = fs.readFileSync(
    path.join(mobileRoot, "services", "furnishAssetCache.ts"),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const counts = {
    assetLoads: new Map(),
    runtimeReads: 0,
    modelReads: 0
  };
  let runtimeFailureRemaining = failRuntimeReadOnce;
  let modelFailureRemaining = failModelReadOnce;
  const localRequire = (request) => {
    if (request === "expo-asset") {
      return {
        Asset: {
          loadAsync: async (moduleId) => {
            counts.assetLoads.set(
              moduleId,
              (counts.assetLoads.get(moduleId) ?? 0) + 1
            );
            return [{ localUri: `file:///asset-${moduleId}` }];
          }
        }
      };
    }
    if (request === "expo-file-system") {
      return {
        EncodingType: { Base64: "base64" },
        readAsStringAsync: async (_uri, options) => {
          if (options?.encoding === "base64") {
            counts.modelReads += 1;
            if (modelFailureRemaining) {
              modelFailureRemaining = false;
              throw new Error("model read failed");
            }
            return "R0xC";
          }
          counts.runtimeReads += 1;
          if (runtimeFailureRemaining) {
            runtimeFailureRemaining = false;
            throw new Error("runtime read failed");
          }
          return "runtime-source";
        }
      };
    }
    if (request === "../webview/furnish-scene/sceneHtml") {
      return {
        getFurnishSceneHtml: (runtimeSource) => `html:${runtimeSource}`
      };
    }
    throw new Error(`Unexpected test dependency: ${request}`);
  };
  const module = { exports: {} };
  Function("module", "exports", "require", compiled)(
    module,
    module.exports,
    localRequire
  );
  return { service: module.exports, counts };
}
```

- [ ] **Step 2: Add runtime reuse and retry tests**

```js
test("runtime html is shared across concurrent and later requests", async () => {
  const { service, counts } = loadAssetCache();
  const [first, second] = await Promise.all([
    service.loadFurnishSceneHtml(1),
    service.loadFurnishSceneHtml(1)
  ]);
  const third = await service.loadFurnishSceneHtml(1);
  assert.equal(first, "html:runtime-source");
  assert.equal(second, first);
  assert.equal(third, first);
  assert.equal(counts.assetLoads.get(1), 1);
  assert.equal(counts.runtimeReads, 1);
});

test("failed runtime reads are evicted so retry can succeed", async () => {
  const { service, counts } = loadAssetCache({
    failRuntimeReadOnce: true
  });
  await assert.rejects(service.loadFurnishSceneHtml(1));
  assert.equal(await service.loadFurnishSceneHtml(1), "html:runtime-source");
  assert.equal(counts.runtimeReads, 2);
});
```

- [ ] **Step 3: Add model reuse, retry, and isolation tests**

```js
test("successful model data uris are shared and retained", async () => {
  const { service, counts } = loadAssetCache();
  const modules = { "D-glb/sofa.glb": 2 };
  const [first, second] = await Promise.all([
    service.resolveFurnishModelUris(modules),
    service.resolveFurnishModelUris(modules)
  ]);
  const third = await service.resolveFurnishModelUris(modules);
  assert.equal(
    first.uris["D-glb/sofa.glb"],
    "data:model/gltf-binary;base64,R0xC"
  );
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(counts.assetLoads.get(2), 1);
  assert.equal(counts.modelReads, 1);
});

test("failed model reads fall back without poisoning retry", async () => {
  const { service, counts } = loadAssetCache({
    failModelReadOnce: true
  });
  const modules = { "D-glb/sofa.glb": 2 };
  const first = await service.resolveFurnishModelUris(modules);
  const second = await service.resolveFurnishModelUris(modules);
  assert.equal(first.uris["D-glb/sofa.glb"], "file:///asset-2");
  assert.equal(first.notices.length, 1);
  assert.equal(
    second.uris["D-glb/sofa.glb"],
    "data:model/gltf-binary;base64,R0xC"
  );
  assert.equal(counts.modelReads, 2);
});
```

```js
test("one failed model does not evict another successful model", async () => {
  const { service, counts } = loadAssetCache({
    failModelReadOnce: true
  });
  const modules = {
    "D-glb/retry.glb": 3,
    "D-glb/stable.glb": 4
  };
  const first = await service.resolveFurnishModelUris(modules);
  const second = await service.resolveFurnishModelUris(modules);
  assert.equal(first.uris["D-glb/retry.glb"], "file:///asset-3");
  assert.equal(
    first.uris["D-glb/stable.glb"],
    "data:model/gltf-binary;base64,R0xC"
  );
  assert.equal(
    second.uris["D-glb/retry.glb"],
    "data:model/gltf-binary;base64,R0xC"
  );
  assert.equal(
    second.uris["D-glb/stable.glb"],
    "data:model/gltf-binary;base64,R0xC"
  );
  assert.equal(counts.assetLoads.get(3), 2);
  assert.equal(counts.assetLoads.get(4), 1);
  assert.equal(counts.modelReads, 3);
});
```

- [ ] **Step 4: Extend the component contract**

Require `FurnishWebView.tsx` to import and call both service functions, and prohibit direct `FileSystem.readAsStringAsync` in the component.

```js
assert.match(bridge, /loadFurnishSceneHtml/);
assert.match(bridge, /resolveFurnishModelUris/);
assert.doesNotMatch(bridge, /FileSystem\.readAsStringAsync/);
```

- [ ] **Step 5: Run RED verification**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-asset-cache.test.cjs tests/furnish-contract.test.cjs
```

Expected: new cache behavior tests fail because `services/furnishAssetCache.ts` does not exist, and component contract assertions fail because `FurnishWebView` still performs direct reads.

- [ ] **Step 6: Commit failing tests**

```powershell
git add apps/mobile/tests/furnish-asset-cache.test.cjs apps/mobile/tests/furnish-contract.test.cjs
git commit -m "test(android): specify retryable 3D asset cache"
```

### Task 2: Implement the cache service

**Files:**
- Create: `apps/mobile/services/furnishAssetCache.ts`
- Test: `apps/mobile/tests/furnish-asset-cache.test.cjs`

- [ ] **Step 1: Add successful Promise caching**

```ts
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { getFurnishSceneHtml } from "../webview/furnish-scene/sceneHtml";

const GLB_DATA_URI_PREFIX = "data:model/gltf-binary;base64,";
const runtimeHtmlPromises = new Map<number, Promise<string>>();
const modelResolutionPromises = new Map<string, Promise<ModelResolution>>();

type ModelResolution = {
  uri: string;
  notice?: string;
  cacheable: boolean;
};

export type FurnishModelResolution = {
  uris: Record<string, string>;
  notices: string[];
};

function cacheSuccessfulPromise<Key, Value>(
  cache: Map<Key, Promise<Value>>,
  key: Key,
  loader: () => Promise<Value>
): Promise<Value> {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const loading = Promise.resolve()
    .then(loader)
    .catch((error) => {
      if (cache.get(key) === loading) {
        cache.delete(key);
      }
      throw error;
    });
  cache.set(key, loading);
  return loading;
}
```

- [ ] **Step 2: Add runtime HTML loading**

```ts
export function loadFurnishSceneHtml(runtimeModule: number): Promise<string> {
  return cacheSuccessfulPromise(runtimeHtmlPromises, runtimeModule, async () => {
    const [runtimeAsset] = await Asset.loadAsync(runtimeModule);
    const readableRuntimeUri = runtimeAsset.localUri ?? runtimeAsset.uri;
    if (!readableRuntimeUri) {
      throw new Error("Bundled 3D runtime URI is unavailable");
    }
    const runtimeSource = await FileSystem.readAsStringAsync(readableRuntimeUri);
    return getFurnishSceneHtml(runtimeSource);
  });
}
```

- [ ] **Step 3: Add retryable per-model resolution**

Use `${modelUri}:${moduleId}` as the cache key. Store successful Base64 results; delete fallback results after concurrent consumers receive them.

```ts
async function resolveFurnishModelUri(
  modelUri: string,
  moduleId: number
): Promise<ModelResolution> {
  const key = `${modelUri}:${moduleId}`;
  const existing = modelResolutionPromises.get(key);
  if (existing) {
    return existing;
  }

  const loading = (async (): Promise<ModelResolution> => {
    let readableUri: string | undefined;
    try {
      const [modelAsset] = await Asset.loadAsync(moduleId);
      readableUri = modelAsset.localUri ?? modelAsset.uri;
      if (!readableUri) {
        throw new Error("Bundled model URI is unavailable");
      }
      const base64Model = await FileSystem.readAsStringAsync(readableUri, {
        encoding: FileSystem.EncodingType.Base64
      });
      return {
        uri: `${GLB_DATA_URI_PREFIX}${base64Model}`,
        cacheable: true
      };
    } catch {
      return readableUri
        ? {
            uri: readableUri,
            notice: `${modelUri} 已解析为本地文件 URI，若真机无法读取会自动使用占位模型`,
            cacheable: false
          }
        : {
            uri: modelUri,
            notice: `${modelUri} 资源准备失败，将使用占位模型`,
            cacheable: false
          };
    }
  })();

  modelResolutionPromises.set(key, loading);
  const resolution = await loading;
  if (!resolution.cacheable && modelResolutionPromises.get(key) === loading) {
    modelResolutionPromises.delete(key);
  }
  return resolution;
}
```

- [ ] **Step 4: Add aggregate model resolution**

```ts
export async function resolveFurnishModelUris(
  modelModules: Record<string, number>
): Promise<FurnishModelResolution> {
  const entries = await Promise.all(
    Object.entries(modelModules).map(async ([modelUri, moduleId]) => {
      const resolution = await resolveFurnishModelUri(modelUri, moduleId);
      return [modelUri, resolution] as const;
    })
  );
  return {
    uris: Object.fromEntries(
      entries.map(([modelUri, resolution]) => [modelUri, resolution.uri])
    ),
    notices: entries.flatMap(([, resolution]) =>
      resolution.notice ? [resolution.notice] : []
    )
  };
}
```

- [ ] **Step 5: Run service tests**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-asset-cache.test.cjs
```

Expected: all cache behavior tests pass.

- [ ] **Step 6: Commit the service**

```powershell
git add apps/mobile/services/furnishAssetCache.ts
git commit -m "perf(android): cache bundled 3D assets"
```

### Task 3: Integrate `FurnishWebView`

**Files:**
- Modify: `apps/mobile/components/FurnishWebView.tsx`
- Test: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: Replace direct asset reads**

Remove the component imports for Expo Asset, Expo FileSystem, and `getFurnishSceneHtml`. Import:

```ts
import {
  loadFurnishSceneHtml,
  resolveFurnishModelUris
} from "../services/furnishAssetCache";
```

Keep `furnitureModelModules` and `furnishRuntimeModule` in the component file so Metro statically includes every asset.

- [ ] **Step 2: Use cached runtime HTML**

Replace the Asset/FileSystem runtime sequence with:

```ts
const html = await loadFurnishSceneHtml(furnishRuntimeModule);
if (mounted) {
  setSceneHtml(html);
}
```

Keep the existing error message, scene reset, timeout clearing, and retry behavior.

- [ ] **Step 3: Use cached model resolution**

Replace the per-entry Asset/FileSystem work with:

```ts
const result = await resolveFurnishModelUris(furnitureModelModules);
if (mounted) {
  result.notices.forEach(onSceneNotice);
  setResolvedModelUris(result.uris);
  setAssetResolutionReady(true);
}
```

- [ ] **Step 4: Run focused verification**

Run:

```powershell
cd apps/mobile
node --test tests/furnish-asset-cache.test.cjs tests/furnish-contract.test.cjs
npm.cmd run typecheck
```

Expected: cache and component tests pass; TypeScript reports no errors.

- [ ] **Step 5: Commit integration**

```powershell
git add apps/mobile/components/FurnishWebView.tsx
git commit -m "perf(android): reuse prepared 3D assets"
```

### Task 4: Verify and publish evidence

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: Run full repository verification**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\product-verify.ps1 -Full
git diff --check
```

Expected: Mobile, repository, public-content, JavaScript, backend, formatting, and whitespace checks all pass.

- [ ] **Step 2: Build Android artifacts**

With the existing JDK 17 and Android SDK:

```powershell
cd apps/mobile/android
.\gradlew.bat app:assembleDebug app:createBundleReleaseJsAndAssets --console=plain
```

Expected: both tasks finish successfully. Record exact APK and bundle byte sizes.

- [ ] **Step 3: Run API 34 emulator validation**

Preserve current app data, install with `adb install -r`, start Metro offline, and verify:

1. Library still shows the existing 4-furniture sample state and Mock not generated.
2. First studio entry restores the local GLB scene and saved layout.
3. Return to Library and re-enter the same room; scene and layout restore again.
4. Terminate the WebView renderer once; automatic recovery restores the scene.
5. React Native, AndroidRuntime, and Chromium error filters remain at 0.

- [ ] **Step 4: Update public evidence**

Document that successful runtime HTML and GLB data URIs are reused only in process memory, failures remain retryable, and WebView permissions remain unchanged. Record the current automated count, build sizes, emulator observations, and unchanged physical-device/release gates.

- [ ] **Step 5: Re-run full verification and commit**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\product-verify.ps1 -Full
git diff --check
git add apps/mobile/README.md docs/product/roomark-android-verification.md
git commit -m "docs(android): record 3D asset cache evidence"
```

- [ ] **Step 6: Push and monitor CI**

Fetch and confirm `origin/main` remains the merge base, then:

```powershell
git push origin public-main:main
```

Monitor the CI run until `mobile`, `public-content`, `backend`, and `container` all complete successfully. Preserve the isolated worktree for the next maturity loop.
