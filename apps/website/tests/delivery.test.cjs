const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const websiteRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(websiteRoot, "../..");
const server = fs.readFileSync(path.join(websiteRoot, "server.cjs"), "utf8");
const workflow = fs.readFileSync(
  path.join(repositoryRoot, ".github/workflows/pages.yml"),
  "utf8",
);

test("local website server exposes canonical product images safely", () => {
  assert.match(server, /docs\/images\/product/);
  assert.match(server, /resolveSafePath/);
  assert.match(server, /path\.relative/);
  assert.match(server, /X-Content-Type-Options/);
  assert.doesNotMatch(server, /assets[\\/]+promo/);
});

test("GitHub Pages workflow verifies and deploys the static website", () => {
  assert.match(workflow, /node --test apps\/website\/tests\/\*\.test\.cjs/);
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /configure-pages@v6/);
  assert.match(workflow, /upload-pages-artifact@v5/);
  assert.match(workflow, /deploy-pages@v5/);
  assert.match(workflow, /docs\/images\/product\/\*\.jpg/);
});
