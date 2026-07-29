const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(root, "../..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const expectedImages = [
  "roomark-overview.jpg",
  "roomark-map.jpg",
  "roomark-decision.jpg",
  "roomark-furnishing.jpg",
];

test("homepage presents the real Android product and open-source project", () => {
  for (const anchor of ["product", "workflow", "gallery", "open-source"]) {
    assert.match(html, new RegExp(`id="${anchor}"`));
    assert.match(html, new RegExp(`href="#${anchor}"`));
  }

  assert.match(html, /Android/);
  assert.match(html, /GitHub/);
  assert.match(html, /MIT/);
  assert.match(html, /Asaseal\/roomark/);
  assert.doesNotMatch(html, /<iframe/i);
});

test("product gallery uses all four accessible Roomark images", () => {
  for (const image of expectedImages) {
    assert.equal(
      fs.existsSync(path.join(repositoryRoot, "docs/images/product", image)),
      true,
      image,
    );
    assert.match(html, new RegExp(`assets/product/${image}`));
  }

  assert.doesNotMatch(html, /<img(?![^>]*\salt=)[^>]*>/i);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /width="1080"/);
  assert.match(html, /height="1350"/);
});

test("navigation is keyboard and screen-reader ready", () => {
  assert.match(html, /aria-label="主导航"/);
  assert.match(html, /id="menuToggle"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /href="#main-content"/);
  assert.match(script, /aria-expanded/);
  assert.match(script, /Escape/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
});

test("responsive motion respects user preferences", () => {
  assert.match(css, /@media \(max-width:\s*720px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /overflow-x:\s*clip|overflow-x:\s*hidden/);
  assert.match(script, /IntersectionObserver/);
});

test("homepage contains no remote font or runtime dependency", () => {
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  assert.doesNotMatch(html, /unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com/);
  assert.doesNotMatch(html, /https?:\/\/[^"']+\.(js|css)/);
});
