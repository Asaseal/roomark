const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mobileRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), "utf8");
}

test("product state is versioned and persisted under one stable key", () => {
  const types = read(path.join("types", "productState.ts"));
  const storage = read(path.join("services", "productStorage.ts"));

  for (const field of ["schemaVersion:", "propertiesById:", "comparisonIds:", "selectedPropertyId?:", "updatedAt:"]) {
    assert.match(types, new RegExp(field.replace("?", "\\?")));
  }

  assert.match(storage, /roomark:mobile:product-state:v1/);
  assert.match(storage, /export async function loadProductState/);
  assert.match(storage, /export async function saveProductState/);
  assert.match(storage, /export function createInitialProductState/);
});

test("stored records pass through strict recovery before reaching the product", () => {
  const storage = read(path.join("services", "productStorage.ts"));
  const recovery = read(path.join("services", "productStateRecovery.ts"));
  const store = read(path.join("stores", "productStore.ts"));

  assert.match(storage, /recoverProductState/);
  assert.match(storage, /MAX_PRODUCT_STATE_LENGTH = 2_000_000/);
  assert.match(storage, /storedValue\.length > MAX_PRODUCT_STATE_LENGTH/);
  assert.match(storage, /Promise<ProductStateLoadResult>/);
  assert.match(storage, /catch/);
  assert.match(storage, /createInitialProductState\(\)/);
  assert.doesNotMatch(storage, /\.\.\.storedProperty/);
  assert.match(recovery, /本地记录无法读取，已恢复设备内置房源。/);
  assert.match(recovery, /部分本地记录已损坏，已保留可恢复内容。/);
  assert.match(store, /hydrationError: loadResult\.message/);
});

test("product store persists every existing state mutation", () => {
  const store = read(path.join("stores", "productStore.ts"));

  for (const operation of ["hydrate:", "selectProperty:", "upsertProperty:", "toggleComparison:", "saveScanResult:"]) {
    assert.match(store, new RegExp(operation));
  }
  assert.match(store, /saveProductState/);
});

test("app hydrates local product state before rendering the library", () => {
  const app = read("App.tsx");

  assert.match(app, /useProductStore/);
  assert.match(app, /void hydrate\(\)/);
  assert.match(app, /if \(!hydrated\)/);
  assert.match(app, /hydrationError/);
});

test("failed product writes remain visible and retryable", () => {
  const store = read(path.join("stores", "productStore.ts"));
  const app = read("App.tsx");
  const library = read(path.join("screens", "LibraryScreen.tsx"));

  for (const field of ["persistenceError?: string", "pendingPersistence: boolean", "retryPersistence:", "dismissPersistenceError:"]) {
    assert.match(store, new RegExp(field.replace("?", "\\?")));
  }

  assert.match(store, /本次修改尚未写入设备，请重试。/);
  assert.match(store, /pendingPersistence: true/);
  assert.match(store, /pendingPersistence: false/);
  assert.match(app, /persistenceError/);
  assert.match(app, /retryPersistence/);
  assert.match(app, /dismissPersistenceError/);
  assert.match(library, /关闭 App 前请确认保存成功。/);
  assert.match(library, /重试保存/);
  assert.match(library, /稍后处理/);
  assert.match(library, /正在保存…/);
});

test("product writes are serialized without poisoning later saves", () => {
  const store = read(path.join("stores", "productStore.ts"));

  assert.match(store, /let persistenceQueue = Promise\.resolve\(\)/);
  assert.match(store, /persistenceQueue\.then\(operation, operation\)/);
  assert.match(store, /queuedWrite\.then\(\(\) => undefined, \(\) => undefined\)/);
  assert.match(store, /pendingPersistenceCount/);

  for (const operation of ["selectProperty", "upsertProperty", "toggleComparison", "retryPersistence"]) {
    assert.match(store, new RegExp(`${operation}[\\s\\S]*persistStateSafely`));
  }
});

test("app retries a failed product write before leaving the foreground", () => {
  const app = read("App.tsx");

  assert.match(app, /import \{[^}]*AppState[^}]*\} from "react-native"/);
  assert.match(app, /AppState\.addEventListener\("change", \(nextState\) => \{/);
  assert.match(
    app,
    /nextState !== "active" && persistenceError && !pendingPersistence/
  );
  assert.match(app, /void retryPersistence\(\)/);
  assert.match(app, /return \(\) => subscription\.remove\(\)/);
});

test("local reads are bounded without timing out non-cancellable writes", () => {
  const productStorage = read(path.join("services", "productStorage.ts"));
  const furnishStorage = read(path.join("services", "furnishStorage.ts"));

  assert.match(productStorage, /runStorageRead/);
  assert.match(
    productStorage,
    /runStorageRead\(\s*\(\) => AsyncStorage\.getItem\(productStorageKey\)/
  );
  assert.match(furnishStorage, /runStorageRead/);
  assert.match(
    furnishStorage,
    /runStorageRead\(\s*\(\) => AsyncStorage\.getItem\(`\$\{storagePrefix\}\$\{roomMesh\.id\}`\)/
  );
  assert.match(
    furnishStorage,
    /catch[\s\S]*recoverFurnishProject\(undefined, roomMesh\)/
  );
  assert.doesNotMatch(
    `${productStorage}\n${furnishStorage}`,
    /runStorageRead\(\(\) => AsyncStorage\.(setItem|removeItem)/
  );
});
