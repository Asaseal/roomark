const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mobileRoot = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(mobileRoot, relativePath), "utf8");

test("library, compare, and detail actions expose explicit semantics", () => {
  const library = read("screens/LibraryScreen.tsx");
  const compare = read("screens/CompareScreen.tsx");
  const detail = read("screens/RoomDetailScreen.tsx");

  for (const label of ["创建模拟扫描记录", "打开看房地图", "返回房源库"]) {
    assert.match(`${library}\n${compare}\n${detail}`, new RegExp(label));
  }
  assert.match(library, /打开房源对比，已选择 \$\{comparisonIds\.length\} 套/);
  assert.match(library, /打开房源详情/);
  assert.match(library, /selected: selectedForComparison/);
  assert.match(compare, /打开 \$\{property\.title\} 房源详情/);
  assert.match(detail, /模拟软装/);
});

test("scan and map choices expose selected button state", () => {
  const scan = read("screens/ScanScreen.tsx");
  const map = read("screens/PropertyMapScreen.tsx");

  assert.match(scan, /accessibilityLabel="使用模拟扫描模式"/);
  assert.match(scan, /selected: mode === "mock"/);
  assert.match(scan, /accessibilityLabel="使用户型图简化 3D 模式"/);
  assert.match(scan, /selected: mode === "floorplan"/);
  assert.match(map, /accessibilityLabel=\{`筛选：\$\{filter\.label\}`\}/);
  assert.match(map, /selected: activeFilter === filter\.id/);
  assert.match(map, /selected: selectedProperty\?\.id === property\.id/);
});

test("furnishing controls expose contextual actions and disabled state", () => {
  const drawer = read("components/FurnitureDrawer.tsx");
  const studio = read("screens/FurnishStudioScreen.tsx");
  const bridge = read("components/FurnishWebView.tsx");

  assert.match(drawer, /放入 \$\{asset\.name\}，\$\{asset\.description\}/);
  for (const label of [
    "保存软装布局并返回房源库",
    "根据当前布局生成 Mock 概念图",
    "锁定当前选中的家具",
    "重置 3D 场景视角",
    "删除当前选中的家具",
    "关闭 Mock 概念图预览",
    "保存 Mock 概念图到房源库"
  ]) {
    assert.match(studio, new RegExp(label));
  }
  assert.match(studio, /accessibilityState=\{\{ disabled: !sceneReady \}\}/);
  assert.match(bridge, /accessibilityLabel="重新加载 3D 场景"/);
  assert.match(bridge, /accessibilityLabel="退出 3D 场景并返回房源库"/);
});
