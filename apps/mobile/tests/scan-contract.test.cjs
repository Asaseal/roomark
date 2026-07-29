const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const mobileRoot = path.resolve(__dirname, "..");

function loadScanService() {
  const source = fs.readFileSync(path.join(mobileRoot, "services", "scanSimulation.ts"), "utf8");
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

test("simulated room scan creates a deterministic valid mock mesh", () => {
  const { simulateRoomScan } = loadScanService();
  const room = simulateRoomScan({
    id: "scan-test",
    name: "现场扫描房型",
    width: 4.8,
    depth: 3.6,
    height: 2.75,
    capturedAt: "2026-07-20T08:00:00.000Z"
  });

  assert.deepEqual(room, {
    id: "scan-test",
    name: "现场扫描房型",
    source: "mock",
    width: 4.8,
    depth: 3.6,
    height: 2.75,
    capturedAt: "2026-07-20T08:00:00.000Z"
  });
});

test("floor-plan fallback derives positive dimensions from aspect ratio", () => {
  const { createFloorPlanFallback } = loadScanService();
  const room = createFloorPlanFallback({
    id: "plan-test",
    name: "户型图生成房型",
    aspectRatio: 1.4,
    height: 2.75,
    capturedAt: "2026-07-20T08:00:00.000Z"
  });

  assert.equal(room.source, "floorplan");
  assert.equal(room.width, 5.04);
  assert.equal(room.depth, 3.6);
  assert.equal(room.height, 2.75);
});

test("scan simulation rejects invalid physical dimensions", () => {
  const { simulateRoomScan } = loadScanService();

  assert.throws(
    () => simulateRoomScan({ id: "bad", name: "bad", width: 0, depth: 3, height: 2.8 }),
    /尺寸必须大于 0/
  );
});

test("scan screen labels simulation honestly and saves a property record", () => {
  const screen = fs.readFileSync(path.join(mobileRoot, "screens", "ScanScreen.tsx"), "utf8");
  const app = fs.readFileSync(path.join(mobileRoot, "App.tsx"), "utf8");
  const store = fs.readFileSync(path.join(mobileRoot, "stores", "productStore.ts"), "utf8");

  assert.match(screen, /模拟扫描/);
  assert.match(screen, /户型图简化 3D/);
  assert.match(screen, /onSave/);
  assert.match(screen, /processing/);
  assert.match(screen, /createScannedProperty/);
  assert.match(screen, /const persisted = await onSave/);
  assert.match(screen, /if \(!persisted\)/);
  assert.match(app, /const persisted = await saveScanResult\(property\)/);
  assert.match(app, /return persisted/);
  assert.match(store, /saveScanResult: \(property: PropertyRecord\) => Promise<boolean>/);
});

test("scan save feedback is accessible and reflects processing state", () => {
  const screen = fs.readFileSync(path.join(mobileRoot, "screens", "ScanScreen.tsx"), "utf8");

  assert.match(screen, /accessibilityLiveRegion="polite"/);
  assert.match(screen, /accessibilityRole="alert"/);
  assert.match(screen, /accessibilityState=\{\{ disabled: processing \}\}/);
  assert.match(screen, /accessibilityState=\{\{ disabled: processing \|\| saved \}\}/);
  assert.match(screen, /accessibilityLabel="房间宽度，单位米"/);
  assert.match(screen, /accessibilityLabel="房间深度，单位米"/);
  assert.match(screen, /accessibilityLabel="房间层高，单位米"/);
});
