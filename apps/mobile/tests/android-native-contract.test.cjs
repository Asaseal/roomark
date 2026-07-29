const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mobileRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(mobileRoot, "../..");
const appConfig = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, "app.json"), "utf8"),
);
const easConfig = JSON.parse(
  fs.readFileSync(path.join(mobileRoot, "eas.json"), "utf8"),
);
const manifest = fs.readFileSync(
  path.join(mobileRoot, "android/app/src/main/AndroidManifest.xml"),
  "utf8",
);
const appGradle = fs.readFileSync(
  path.join(mobileRoot, "android/app/build.gradle"),
  "utf8",
);
const androidRoot = path.resolve(__dirname, "../android/app/src/main/res");
const permissionTags = manifest.match(/<uses-permission\b[^>]*\/>/g) ?? [];

function hasActivePermission(permission) {
  return permissionTags.some(
    (tag) => tag.includes(permission) && !tag.includes('tools:node="remove"'),
  );
}

test("Android splash drawable references a declared background color", () => {
  const splash = fs.readFileSync(path.join(androidRoot, "drawable/splashscreen.xml"), "utf8");
  const colors = fs.readFileSync(path.join(androidRoot, "values/colors.xml"), "utf8");
  const match = splash.match(/@color\/([a-zA-Z0-9_]+)/);

  assert.ok(match, "splash drawable must reference a color resource");
  assert.match(colors, new RegExp(`<color name="${match[1]}">`));
});

test("Expo config blocks permissions that are not required by Roomark", () => {
  assert.deepEqual(
    new Set(appConfig.expo.android.blockedPermissions),
    new Set([
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ]),
  );
});

test("Android production manifest uses minimal permissions", () => {
  assert.equal(hasActivePermission("android.permission.INTERNET"), true);
  assert.equal(hasActivePermission("android.permission.VIBRATE"), true);
  assert.equal(hasActivePermission("android.permission.READ_EXTERNAL_STORAGE"), false);
  assert.equal(hasActivePermission("android.permission.WRITE_EXTERNAL_STORAGE"), false);
  assert.equal(hasActivePermission("android.permission.SYSTEM_ALERT_WINDOW"), false);
});

test("Android manifest removes permissions contributed by dependencies", () => {
  assert.match(manifest, /xmlns:tools=/);
  for (const permission of appConfig.expo.android.blockedPermissions) {
    assert.equal(
      permissionTags.some(
        (tag) =>
          tag.includes(permission) && tag.includes('tools:node="remove"'),
      ),
      true,
      `${permission} must be removed during manifest merging`,
    );
  }
});

test("Android backups are disabled for local viewing records", () => {
  assert.equal(appConfig.expo.android.allowBackup, false);
  assert.match(manifest, /android:allowBackup="false"/);
});

test("Expo and native Android version codes stay synchronized", () => {
  const nativeVersionCode = Number(
    appGradle.match(/versionCode\s+(\d+)/)?.[1],
  );

  assert.equal(Number.isInteger(appConfig.expo.android.versionCode), true);
  assert.equal(appConfig.expo.android.versionCode, nativeVersionCode);
});

test("release builds never use the checked-in debug keystore", () => {
  const releaseBlock = appGradle.match(
    /release\s*\{(?<body>[\s\S]*?)^\s{8}\}/m,
  )?.groups?.body;

  assert.ok(releaseBlock, "release build type must exist");
  assert.doesNotMatch(releaseBlock, /signingConfigs\.debug/);
  assert.match(appGradle, /ROOMARK_UPLOAD_STORE_FILE/);
  assert.match(appGradle, /ROOMARK_UPLOAD_STORE_PASSWORD/);
  assert.match(appGradle, /ROOMARK_UPLOAD_KEY_ALIAS/);
  assert.match(appGradle, /ROOMARK_UPLOAD_KEY_PASSWORD/);
  assert.match(appGradle, /GradleException/);
  assert.match(appGradle, /release signing credentials/i);
});

test("EAS production profile builds a versioned Android App Bundle", () => {
  assert.equal(easConfig.build.production.android.buildType, "app-bundle");
  assert.equal(easConfig.build.production.android.autoIncrement, "versionCode");
  assert.equal(easConfig.build.production.credentialsSource, "remote");
});

test("release signing secrets cannot be committed accidentally", () => {
  const rootIgnore = fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf8");

  assert.match(rootIgnore, /^credentials\.json$/m);
  assert.match(rootIgnore, /^\*\.jks$/m);
  assert.match(rootIgnore, /^\*\.keystore$/m);
});

test("delivery scripts require a production Android App Bundle", () => {
  const verification = fs.readFileSync(
    path.join(projectRoot, "scripts/product-verify.ps1"),
    "utf8",
  );
  const release = fs.readFileSync(
    path.join(projectRoot, "scripts/build-release-bundle.ps1"),
    "utf8",
  );

  assert.match(verification, /app-release\.aab/);
  assert.match(release, /app-release\.aab/);
  assert.doesNotMatch(`${verification}\n${release}`, /app-(debug|release)\.apk/);
});
