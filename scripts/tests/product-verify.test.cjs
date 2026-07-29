const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const script = fs.readFileSync(path.resolve(__dirname, "../product-verify.ps1"), "utf8");

test("product verification can require Android store release evidence", () => {
  assert.match(script, /app-release\.aab/);
  assert.doesNotMatch(script, /app-(debug|release)\.apk/);
  assert.match(script, /\[switch\]\$RequireAab/);
  assert.match(script, /jarsigner\.exe/);
  assert.match(script, /Join-Path \$env:JAVA_HOME "bin\\jarsigner\.exe"/);
  assert.match(script, /META-INF/);
  assert.match(script, /Android App Bundle is not signed/i);
  assert.match(script, /roomark-android-verification\.md/);
});

test("full verification covers every maintained surface", () => {
  assert.match(script, /-FilePath "npm\.cmd"/);
  assert.match(script, /@\("run", "verify"\)/);
  assert.match(script, /-FilePath "node\.exe"/);
  assert.match(script, /"--test"/);
  assert.match(script, /"--check"/);
  assert.match(script, /-FilePath "cargo\.exe"/);
  assert.match(script, /@\("test", "--locked"\)/);
  assert.match(script, /@\("fmt", "--check"\)/);
  assert.match(script, /public-repository-policy\.test\.cjs/);
});

test("live service checks are optional", () => {
  assert.match(script, /\[switch\]\$Live/);
  assert.match(script, /if \(\$Live\)/);
  assert.match(script, /health/);
});

test("commands are executed without expression evaluation", () => {
  assert.match(script, /& \$FilePath @Arguments/);
  assert.doesNotMatch(script, /Invoke-Expression/);
});
