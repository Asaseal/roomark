const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const mobileRoot = path.resolve(__dirname, "..");
const fixedNow = "2026-07-30T06:00:00.000Z";

function loadRecoveryService() {
  const source = fs.readFileSync(
    path.join(mobileRoot, "services", "productStateRecovery.ts"),
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

function createProperty(id, overrides = {}) {
  return {
    id,
    title: `房源 ${id}`,
    roomMesh: {
      id,
      name: `房型 ${id}`,
      source: "floorplan",
      width: 4.8,
      depth: 3.6,
      height: 2.8,
      capturedAt: "2026-07-30T05:00:00.000Z"
    },
    monthlyRent: "¥5,200",
    deposit: "押一付一",
    oneTimeFees: "清洁费 ¥300",
    totalMoveInCost: "¥10,700",
    commuteMinutes: 28,
    commuteTime: "28 分钟",
    area: "17.3㎡",
    latitude: 31.2304,
    longitude: 121.4737,
    hasVisited: true,
    hasScan: true,
    isFavorite: false,
    recommendationTag: "适合复看",
    furnitureFit: "动线可用",
    compareLabel: "成本和通勤较均衡。",
    decisionSummary: "可以进入下一轮比较。",
    riskSummary: "1 项待确认 / 1 项高风险",
    highRiskCount: 1,
    pendingCount: 1,
    inspection: [
      { label: "漏水痕迹", status: "risk", note: "卫生间门边需复查" },
      { label: "夜间噪音", status: "attention", note: "晚间需要再次测试" },
      { label: "门锁", status: "normal", note: "现场开关正常" }
    ],
    ...overrides
  };
}

const catalogProperty = createProperty("catalog-room", {
  title: "当前目录房源",
  roomMesh: {
    id: "catalog-room",
    name: "当前目录房型",
    source: "floorplan",
    width: 5,
    depth: 4,
    height: 2.9,
    capturedAt: "2026-07-30T05:10:00.000Z"
  },
  monthlyRent: "¥5,600"
});

function createState(propertiesById, overrides = {}) {
  return {
    schemaVersion: 1,
    propertiesById,
    comparisonIds: Object.keys(propertiesById),
    selectedPropertyId: Object.keys(propertiesById)[0],
    updatedAt: "2026-07-30T05:30:00.000Z",
    ...overrides
  };
}

test("catalog stays authoritative while valid user state is preserved", () => {
  const { recoverProductState } = loadRecoveryService();
  const storedProperty = createProperty(catalogProperty.id, {
    title: "旧目录标题",
    roomMesh: {
      ...catalogProperty.roomMesh,
      name: "旧目录房型",
      width: 4.2
    },
    isFavorite: true,
    hasFurnishLayout: true,
    renderStatus: "saved",
    renderUpdatedAt: "2026-07-30T05:20:00.000Z"
  });
  const stored = createState({ [storedProperty.id]: storedProperty });
  const snapshot = structuredClone(stored);

  const result = recoverProductState(stored, [catalogProperty], fixedNow);
  const recovered = result.state.propertiesById[catalogProperty.id];

  assert.equal(result.recoveredFromError, false);
  assert.equal(result.message, undefined);
  assert.equal(recovered.title, catalogProperty.title);
  assert.deepEqual(recovered.roomMesh, catalogProperty.roomMesh);
  assert.equal(recovered.isFavorite, true);
  assert.equal(recovered.hasFurnishLayout, true);
  assert.equal(recovered.renderStatus, "saved");
  assert.equal(recovered.renderUpdatedAt, "2026-07-30T05:20:00.000Z");
  assert.deepEqual(stored, snapshot);
});

test("corrupt catalog record falls back without losing valid mutable fields", () => {
  const { recoverProductState } = loadRecoveryService();
  const storedProperty = {
    ...createProperty(catalogProperty.id),
    monthlyRent: 5600,
    roomMesh: { ...catalogProperty.roomMesh, width: "broken" },
    inspection: "broken",
    isFavorite: true
  };

  const result = recoverProductState(
    createState({ [catalogProperty.id]: storedProperty }),
    [catalogProperty],
    fixedNow
  );
  const recovered = result.state.propertiesById[catalogProperty.id];

  assert.equal(result.recoveredFromError, true);
  assert.equal(result.message, "部分本地记录已损坏，已保留可恢复内容。");
  assert.equal(recovered.monthlyRent, catalogProperty.monthlyRent);
  assert.equal(recovered.roomMesh.width, catalogProperty.roomMesh.width);
  assert.deepEqual(recovered.inspection, catalogProperty.inspection);
  assert.equal(recovered.isFavorite, true);
});

test("custom scans and top-level references are recovered independently", () => {
  const { recoverProductState } = loadRecoveryService();
  const validCatalogCopy = createProperty(catalogProperty.id);
  const validScan = createProperty("scan-valid", {
    title: "现场扫描房型",
    roomMesh: {
      id: "scan-valid",
      name: "现场扫描房型",
      source: "mock",
      width: 4.6,
      depth: 3.4,
      height: 2.75,
      capturedAt: "2026-07-30T05:40:00.000Z"
    }
  });
  const corruptScan = {
    ...createProperty("scan-corrupt"),
    inspection: null
  };
  const stored = createState(
    {
      [catalogProperty.id]: validCatalogCopy,
      [validScan.id]: validScan,
      [corruptScan.id]: corruptScan
    },
    {
      comparisonIds: [
        catalogProperty.id,
        validScan.id,
        validScan.id,
        corruptScan.id,
        "missing",
        42
      ],
      selectedPropertyId: corruptScan.id,
      updatedAt: "not-a-time"
    }
  );

  const result = recoverProductState(stored, [catalogProperty], fixedNow);

  assert.equal(result.recoveredFromError, true);
  assert.deepEqual(Object.keys(result.state.propertiesById).sort(), [
    catalogProperty.id,
    validScan.id
  ]);
  assert.deepEqual(result.state.propertiesById[validScan.id], validScan);
  assert.deepEqual(result.state.comparisonIds, [catalogProperty.id, validScan.id]);
  assert.equal(result.state.selectedPropertyId, undefined);
  assert.equal(result.state.updatedAt, fixedNow);
});

test("invalid top-level state restores the complete current catalog", () => {
  const { recoverProductState } = loadRecoveryService();
  const result = recoverProductState(
    {
      schemaVersion: 1,
      propertiesById: [],
      comparisonIds: []
    },
    [catalogProperty],
    fixedNow
  );

  assert.equal(result.recoveredFromError, true);
  assert.equal(result.message, "本地记录无法读取，已恢复设备内置房源。");
  assert.deepEqual(result.state.propertiesById, {
    [catalogProperty.id]: catalogProperty
  });
  assert.deepEqual(result.state.comparisonIds, [catalogProperty.id]);
  assert.equal(result.state.updatedAt, fixedNow);
});
