const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const mobileRoot = path.resolve(__dirname, "..");

function loadProjectionService() {
  const source = fs.readFileSync(path.join(mobileRoot, "services", "mapProjection.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  Function("module", "exports", compiled)(module, module.exports);
  return module.exports;
}

const properties = [
  { id: "a", latitude: 31.2, longitude: 121.4, hasVisited: true, hasScan: false, isFavorite: false, highRiskCount: 0 },
  { id: "b", latitude: 31.3, longitude: 121.5, hasVisited: false, hasScan: true, isFavorite: true, highRiskCount: 1 }
];

test("offline projection keeps every marker inside the local canvas", () => {
  const { createMapBounds, projectProperty } = loadProjectionService();
  const bounds = createMapBounds(properties);

  for (const property of properties) {
    const point = projectProperty(property, bounds);
    assert.ok(point.x >= 6 && point.x <= 94);
    assert.ok(point.y >= 6 && point.y <= 94);
  }
});

test("existing map filters select persisted property states", () => {
  const { filterProperties } = loadProjectionService();

  assert.equal(filterProperties(properties, "all").length, 2);
  assert.deepEqual(filterProperties(properties, "visited").map((item) => item.id), ["a"]);
  assert.deepEqual(filterProperties(properties, "scanned").map((item) => item.id), ["b"]);
  assert.deepEqual(filterProperties(properties, "high-risk").map((item) => item.id), ["b"]);
  assert.deepEqual(filterProperties(properties, "favorite").map((item) => item.id), ["b"]);
});

test("map screen reuses detail and furnish actions", () => {
  const screen = fs.readFileSync(path.join(mobileRoot, "screens", "PropertyMapScreen.tsx"), "utf8");

  for (const filter of ["all", "visited", "scanned", "high-risk", "favorite"]) {
    assert.match(screen, new RegExp(`"${filter}"`));
  }
  assert.match(screen, /onOpenDetail/);
  assert.match(screen, /onStartFurnish/);
  assert.match(screen, /selectedProperty/);
});
