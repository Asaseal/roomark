const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const mobileRoot = path.resolve(__dirname, "..");

function loadAssetCache({
  failRuntimeReadOnce = false,
  failModelReadOnce = false
} = {}) {
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
