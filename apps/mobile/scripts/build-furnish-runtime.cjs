const fs = require("node:fs");
const path = require("node:path");

const mobileRoot = path.resolve(__dirname, "..");
const threeRoot = path.dirname(require.resolve("three/package.json"));
const outputDirectory = path.join(mobileRoot, "assets", "vendor");
const runtimeSources = [
  path.join(threeRoot, "build", "three.min.js"),
  path.join(threeRoot, "examples", "js", "controls", "OrbitControls.js"),
  path.join(threeRoot, "examples", "js", "loaders", "GLTFLoader.js")
];

const runtimeSource = [
  "/*! Roomark bundled Three.js r132 runtime. See three-LICENSE.txt. */",
  ...runtimeSources.map((sourcePath) => fs.readFileSync(sourcePath, "utf8"))
].join("\n;\n");

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "furnish-runtime.js.txt"),
  runtimeSource,
  "utf8"
);
fs.copyFileSync(
  path.join(threeRoot, "LICENSE"),
  path.join(outputDirectory, "three-LICENSE.txt")
);
