const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const script = fs.readFileSync(
  path.resolve(__dirname, "../build-release-bundle.ps1"),
  "utf8",
);

test("release bundle verifies the product and requires a store-ready AAB", () => {
  assert.match(script, /product-verify\.ps1/);
  assert.match(script, /-Full/);
  assert.match(script, /-RequireAab/);
  assert.match(script, /app-release\.aab/);
  assert.doesNotMatch(script, /app-(debug|release)\.apk/);
});

test("release bundle is gated by Android signature verification", () => {
  const verification = fs.readFileSync(
    path.resolve(__dirname, "../product-verify.ps1"),
    "utf8",
  );

  assert.match(verification, /jarsigner\.exe/);
  assert.match(verification, /META-INF/);
});

test("release bundle is built from a clean Git commit", () => {
  assert.match(script, /git\.exe status --porcelain/);
  assert.match(script, /git\.exe archive/);
  assert.match(script, /git\.exe rev-parse HEAD/);
  assert.match(script, /working tree must be clean/i);
});

test("release bundle records version and SHA-256 checksums", () => {
  assert.match(script, /app\.json/);
  assert.match(script, /VERSION\.txt/);
  assert.match(script, /SHA256SUMS\.txt/);
  assert.match(script, /Get-FileHash/);
  assert.match(script, /Compress-Archive/);
});

test("release paths are constrained to the repository release directory", () => {
  assert.match(script, /resolvedRelease/);
  assert.match(script, /resolvedBundle/);
  assert.match(script, /StartsWith/);
});
