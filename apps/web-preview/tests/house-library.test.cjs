const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const previewRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(previewRoot, "index.html"), "utf8");
const css = fs.readFileSync(path.join(previewRoot, "styles.css"), "utf8");
const viewer = fs.readFileSync(path.join(previewRoot, "house-models", "house-viewer.js"), "utf8");

assert.match(html, /id="modelList"/, "房型库应保留唯一的 3D 卡片挂载点");
assert.doesNotMatch(html, /id="viewer"/, "不应继续显示重复的顶部单模型 Canvas");
assert.match(viewer, /house-card-render-surface/, "应创建共享 WebGL 渲染画布");
assert.match(viewer, /IntersectionObserver/, "应按卡片可见性控制渲染");
assert.match(viewer, /isNearViewport/, "页面切换后应使用视口距离校验兜底可见性状态");
assert.match(viewer, /libraryScreen\?\.classList\.contains\("active"\)/, "房型库未激活时应暂停 WebGL 渲染");
assert.match(viewer, /rotations:/, "调试状态应暴露各房型旋转角度以便验收手势");
assert.match(viewer, /webglAvailable:\s*false/, "WebGL 兜底也应暴露统一状态 API");
assert.match(viewer, /dataset\.rotation/, "卡片 DOM 应同步当前旋转角度用于交互验收");
assert.doesNotMatch(html, /roomark-3d\.js/, "不应继续加载已隐藏的旧 3D 工作台循环");
assert.match(viewer, /model-card-canvas-slot/, "每张卡片应包含真实 3D 渲染区域");
assert.doesNotMatch(viewer, /preview-floor|preview-wall|preview-room/, "不应继续生成 CSS 假 3D 缩略图");
assert.match(css, /@media \(min-width: 9999px\)/, "iPad 布局分支应被禁用");
assert.match(css, /touch-action:\s*pan-y/, "3D 卡片应允许页面纵向滚动");
assert.match(css, /\.tabbar\s*\{[^}]*z-index:\s*[3-9]\d*/s, "底部导航必须位于共享 WebGL 画布上方");
assert.match(viewer, /const libraryRect = libraryScreen\.getBoundingClientRect\(\)/, "共享 WebGL 必须读取房型库滚动视口边界");
assert.match(viewer, /renderViewer\(viewer, canvasRect, libraryRect, now\)/, "每个 3D 卡片必须裁切在房型库滚动视口内");

console.log("Roomark 3D 房型库结构测试通过");
