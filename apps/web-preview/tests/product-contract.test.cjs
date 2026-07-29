const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const previewRoot = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(previewRoot, relativePath), "utf8");

test("browser fallback keeps stable property and state semantics", () => {
  const propertyData = read(path.join("house-models", "property-data.js"));
  const script = read("script.js");

  for (const field of ["id:", "modelId:", "price:", "moveInCost:", "commuteMinutes:", "riskCount:", "highRiskCount:", "hasScan:", "hasFurnishLayout:"]) {
    assert.match(propertyData, new RegExp(field));
  }
  assert.match(script, /roomark:web-preview:scan-state/);
  assert.match(script, /roomark:web-preview:render-status/);
});

test("primary browser product navigation excludes out-of-scope placeholders", () => {
  const html = read("index.html");

  assert.doesNotMatch(html, /data-target="community"/);
  assert.doesNotMatch(html, /data-target="knowledge"/);
  assert.doesNotMatch(html, /id="communityScreen"/);
  assert.doesNotMatch(html, /id="knowledgeScreen"/);
});

test("browser mock output is labelled as a mock concept preview", () => {
  const html = read(path.join("..", "web-furnish", "index.html"));
  const scene = read(path.join("..", "web-furnish", "scene.js"));

  assert.match(`${html}\n${scene}`, /Mock 效果图/);
  assert.doesNotMatch(`${html}\n${scene}`, /真实 AI 效果图/);
});
