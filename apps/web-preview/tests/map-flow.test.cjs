const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const previewRoot = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(previewRoot, relativePath), "utf8");

const html = read("index.html");
const css = read("styles.css");
const app = read("script.js");
const map = read("map.js");
const propertyData = read(path.join("house-models", "property-data.js"));

for (const title of ["晨光 L 型两居", "北岛中庭公寓", "海岸双卧套房", "都市 Loft 小宅", "现场扫描房型"]) {
  assert.match(propertyData, new RegExp(title), `共享房源数据应包含 ${title}`);
}

assert.match(propertyData, /latitude:/, "房源数据应集中保存纬度");
assert.match(propertyData, /longitude:/, "房源数据应集中保存经度");
assert.match(propertyData, /hasFurnishLayout:/, "房源数据应包含软装状态");

assert.match(html, /id="mapScreen"/, "App 应包含看房地图页面");
assert.match(html, /id="roomarkMap"/, "地图页面应包含离线地图画布");
assert.match(html, /data-map-filter="high-risk"/, "地图应提供高风险筛选");
assert.match(html, /id="mapPropertySheet"/, "地图应包含半屏房源卡片");
assert.match(html, /data-target="map"[^>]*aria-label="地图"/, "底部导航应提供地图入口");
assert.match(html, /id="detailMapButton"/, "房源详情应提供地图入口");
assert.match(html, /rel="icon" href="data:image\/svg\+xml/, "预览页应使用内联 favicon");
assert.match(html, /data-src="\.\.\/web-furnish\/index\.html"/, "软装 iframe 应延迟加载");
assert.match(html, /src="about:blank"/, "隐藏软装 iframe 不应提前启动 WebGL");
assert.match(html, /house-models\/property-data\.js/, "App 应加载统一房源数据");
assert.match(html, /map\.js/, "App 应加载地图交互脚本");

assert.match(css, /grid-template-columns:\s*repeat\(4,\s*1fr\)/, "四项产品底部导航应平均分配宽度");
assert.match(css, /\.map-marker\.status-risk/, "高风险标记应有独立视觉状态");
assert.match(css, /\.map-property-sheet/, "房源卡片应适配底部安全区");
assert.match(css, /\.map-empty-state\[hidden\]/, "有房源时空状态必须真正隐藏");

assert.match(app, /map:\s*"我的看房地图"/, "页面标题映射应包含地图");
assert.match(app, /map:\s*document\.getElementById\("mapScreen"\)/, "页面导航应注册地图页面");
assert.match(app, /ensureFurnishFrameLoaded/, "进入软装页时才应加载 3D iframe");

assert.match(map, /roomark:web-preview:map-markers/, "新增标记应写入稳定 localStorage key");
assert.match(map, /pointerdown/, "地图应支持长按新增标记");
assert.match(map, /data-map-filter/, "地图应支持状态筛选");
assert.match(map, /RoomarkOpenRoomDetail/, "地图详情按钮应复用现有详情页");
assert.match(map, /RoomarkEnterFurnishMode/, "地图软装按钮应复用现有模拟器");

console.log("Roomark 看房地图结构测试通过");
