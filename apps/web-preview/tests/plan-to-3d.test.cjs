const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const previewRoot = path.resolve(__dirname, "..");

test("floor plan import calls the GPT-backed 3D generation service without adding UI", () => {
  const index = fs.readFileSync(path.join(previewRoot, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(previewRoot, "script.js"), "utf8");
  const server = fs.readFileSync(path.join(previewRoot, "server.cjs"), "utf8");

  assert.match(index, /plan-to-3d\.js/);
  assert.ok(index.indexOf("plan-to-3d.js") < index.indexOf("script.js"));

  assert.match(script, /simulatePlan\.addEventListener\("click", async/);
  assert.match(script, /RoomarkPlanTo3D\.generate/);
  assert.match(script, /saveScanState\("floor-plan", Number\(height\), planResult/);

  assert.match(server, /\/api\/plan-to-3d/);
  assert.match(server, /OPENAI_API_KEY/);
  assert.match(server, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(server, /createFallbackPlanModel/);
});

test("browser bridge posts floor plan metadata and keeps a local fallback", () => {
  const bridge = fs.readFileSync(path.join(previewRoot, "plan-to-3d.js"), "utf8");

  assert.match(bridge, /RoomarkPlanTo3D/);
  assert.match(bridge, /\/api\/plan-to-3d/);
  assert.match(bridge, /readFileAsDataUrl/);
  assert.match(bridge, /createLocalFallback/);
});
