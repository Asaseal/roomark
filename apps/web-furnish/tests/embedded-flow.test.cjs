const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appRoot = path.resolve(__dirname, "..");
const previewRoot = path.resolve(appRoot, "../web-preview");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("soft furnish page is mobile-first without a tablet-only rail", () => {
  const html = read(path.join(appRoot, "index.html"));

  assert.doesNotMatch(html, /iPad 左侧导航/);
  assert.doesNotMatch(html, /ipad-nav-rail/);
});

test("embedded studio hides its duplicate library and opens the selected property", () => {
  const styles = read(path.join(appRoot, "styles.css"));
  const scene = read(path.join(appRoot, "scene.js"));
  const preview = read(path.join(previewRoot, "script.js"));
  const previewHtml = read(path.join(previewRoot, "index.html"));
  const previewStyles = read(path.join(previewRoot, "styles.css"));

  assert.match(styles, /\.embedded\s+\.library-panel[\s\S]*display:\s*none/);
  assert.match(styles, /\.embedded\s+\.viewport-card[\s\S]*order:\s*1/);
  assert.match(scene, /roomark:open-room/);
  assert.match(scene, /roomark:furnish-back/);
  assert.match(scene, /function renderRoomThumbnails\(\) \{\s*if \(isEmbedded\) return;/);
  assert.match(preview, /roomark:open-room/);
  assert.match(preview, /roomark:furnish-back/);
  assert.doesNotMatch(previewHtml, /furnish-mobile-hero/);
  assert.doesNotMatch(previewHtml, /furnish-private-library/);
  assert.match(previewStyles, /\.furnish-mobile-frame iframe\s*\{[^}]*width:\s*100%/);
  assert.doesNotMatch(previewStyles, /\.furnish-mobile-frame iframe\s*\{[^}]*transform:/);
});
