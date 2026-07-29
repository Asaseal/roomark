const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const androidRoot = path.resolve(__dirname, "../android/app/src/main/res");

test("Android splash drawable references a declared background color", () => {
  const splash = fs.readFileSync(path.join(androidRoot, "drawable/splashscreen.xml"), "utf8");
  const colors = fs.readFileSync(path.join(androidRoot, "values/colors.xml"), "utf8");
  const match = splash.match(/@color\/([a-zA-Z0-9_]+)/);

  assert.ok(match, "splash drawable must reference a color resource");
  assert.match(colors, new RegExp(`<color name="${match[1]}">`));
});

test("delivery scripts require a standalone release APK", () => {
  const projectRoot = path.resolve(__dirname, "../../..");
  const verification = fs.readFileSync(
    path.join(projectRoot, "scripts/product-verify.ps1"),
    "utf8",
  );
  const release = fs.readFileSync(
    path.join(projectRoot, "scripts/build-release-bundle.ps1"),
    "utf8",
  );

  assert.match(verification, /app-release\.apk/);
  assert.match(release, /app-release\.apk/);
  assert.doesNotMatch(`${verification}\n${release}`, /app-debug\.apk/);
});
