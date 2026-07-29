const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const previewRoot = path.resolve(__dirname, "..");

test("saved scan survives a page reload", () => {
  const script = fs.readFileSync(path.join(previewRoot, "script.js"), "utf8");

  assert.match(script, /roomark:web-preview:scan-state/);
  assert.match(script, /localStorage\.setItem\(\s*scanStateStorageKey/);
  assert.match(script, /restoreSavedScan\(\)/);
  assert.match(script, /scanResultCard\.hidden = !saved/);
  assert.match(script, /scanSavedBanner\.hidden = !saved/);
});
