const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mobileRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(mobileRoot, relativePath), "utf8");
}

test("Android is a supported Roomark product platform", () => {
  const appConfig = JSON.parse(read("app.json"));

  assert.ok(appConfig.expo.platforms.includes("android"));
  assert.equal(appConfig.expo.android.package, "com.roomark.app");
});

test("mobile navigation contains only the confirmed existing product areas", () => {
  const screenRegistry = read(path.join("navigation", "productScreens.ts"));
  const expectedScreens = ["library", "detail", "scan", "compare", "map", "furnish"];
  const forbiddenLabels = ["知识库", "社区", "合同分析", "云同步"];

  for (const screen of expectedScreens) {
    assert.match(screenRegistry, new RegExp(`"${screen}"`));
  }

  for (const forbiddenLabel of forbiddenLabels) {
    assert.doesNotMatch(screenRegistry, new RegExp(forbiddenLabel));
  }
});

test("Android shell has reproducible profiles and hardware-back routing", () => {
  const app = read("App.tsx");
  const easConfig = JSON.parse(read("eas.json"));

  assert.match(app, /BackHandler/);
  assert.match(app, /hardwareBackPress/);
  assert.ok(easConfig.build.development.android);
  assert.ok(easConfig.build.preview.android);
  assert.equal(easConfig.build.preview.android.buildType, "apk");
});
