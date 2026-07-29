const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mobileRoot = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(mobileRoot, relativePath), "utf8");

test("library exposes detail, comparison, scan, map, and furnish entry points", () => {
  const library = read(path.join("screens", "LibraryScreen.tsx"));

  for (const callback of ["onOpenDetail", "onToggleComparison", "onOpenCompare", "onOpenScan", "onOpenMap", "onStartFurnish"]) {
    assert.match(library, new RegExp(callback));
  }
  assert.match(library, /minimumTouchTarget\s*=\s*44/);
});

test("comparison renders the existing decision fields from property records", () => {
  const compare = read(path.join("screens", "CompareScreen.tsx"));

  for (const field of ["monthlyRent", "totalMoveInCost", "commuteTime", "highRiskCount", "recommendationTag", "decisionSummary"]) {
    assert.match(compare, new RegExp(`property\\.${field}`));
  }
  assert.match(compare, /comparisonIds\.length < 2/);
  assert.match(compare, /onBack/);
});

test("app routes persisted records through the core product flow", () => {
  const app = read("App.tsx");

  assert.match(app, /LibraryScreen/);
  assert.match(app, /CompareScreen/);
  assert.match(app, /toggleComparison/);
  assert.match(app, /selectProperty/);
});

test("storage recovery feedback is accessible and announces state changes", () => {
  const library = read(path.join("screens", "LibraryScreen.tsx"));

  assert.match(library, /accessibilityLiveRegion="polite"/);
  assert.match(library, /accessibilityRole="alert"/);
  assert.match(library, /accessibilityRole="button"/);
  assert.match(library, /accessibilityLabel=\{pendingPersistence \? "正在保存看房记录" : "重试保存看房记录"\}/);
  assert.match(library, /accessibilityState=\{\{ disabled: pendingPersistence \}\}/);
  assert.match(library, /accessibilityLabel="稍后处理保存失败提示"/);
});
