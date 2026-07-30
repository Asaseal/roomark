# Roomark Android Core Accessibility Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Roomark 现有 Android 核心触控目标补齐可验证的中文动作语义、按钮角色、选中状态和禁用状态，不改变任何可见界面或业务行为。

**Architecture:** 直接在现有 React Native `TouchableOpacity` 上添加平台标准无障碍属性，保留原有样式、回调、导航和状态计算。新增一份 Node 源码契约测试，按页面组验证必须存在的标签、角色和状态，再通过 API 34 UI Automator 检查 Android 暴露的节点语义。

**Tech Stack:** React Native 0.74、TypeScript、Node.js `node:test`、Expo 51、Android Gradle、ADB/UI Automator

---

## 文件结构

- Create: `apps/mobile/tests/accessibility-contract.test.cjs` — 固定核心页面必须暴露的无障碍语义。
- Modify: `apps/mobile/screens/LibraryScreen.tsx` — 首页动作、房源卡片、对比和软装入口。
- Modify: `apps/mobile/screens/CompareScreen.tsx` — 返回和房源对比卡片。
- Modify: `apps/mobile/screens/RoomDetailScreen.tsx` — 返回和软装入口。
- Modify: `apps/mobile/screens/ScanScreen.tsx` — 返回、扫描模式角色与选中状态。
- Modify: `apps/mobile/screens/PropertyMapScreen.tsx` — 返回、筛选、地图标记和详情操作。
- Modify: `apps/mobile/components/FurnitureDrawer.tsx` — 家具条目的放入动作。
- Modify: `apps/mobile/screens/FurnishStudioScreen.tsx` — 返回、Mock 概念图和场景操作。
- Modify: `apps/mobile/components/FurnishWebView.tsx` — 3D 加载失败的重试与退出标签。
- Modify: `docs/product/roomark-android-verification.md` — 记录自动化、构建和模拟器证据。

### Task 1: 建立失败的无障碍契约

**Files:**
- Create: `apps/mobile/tests/accessibility-contract.test.cjs`

- [ ] **Step 1: 写入页面语义契约**

创建测试并使用现有源码读取模式：

```js
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
    "保存软装布局并返回房源详情",
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
  assert.match(bridge, /accessibilityLabel="退出 3D 场景并返回房源详情"/);
});
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `cd apps/mobile && node --test tests/accessibility-contract.test.cjs`

Expected: 3 个测试因现有标签或状态缺失而失败，不是语法错误。

- [ ] **Step 3: 提交失败契约**

```bash
git add apps/mobile/tests/accessibility-contract.test.cjs
git commit -m "test(android): specify core accessibility semantics"
```

### Task 2: 补齐房源决策流程语义

**Files:**
- Modify: `apps/mobile/screens/LibraryScreen.tsx`
- Modify: `apps/mobile/screens/CompareScreen.tsx`
- Modify: `apps/mobile/screens/RoomDetailScreen.tsx`

- [ ] **Step 1: 为房源库主操作和卡片添加语义**

保持现有 `onPress`，为三个主操作分别添加：

```tsx
accessibilityLabel="创建模拟扫描记录"
accessibilityRole="button"
```

```tsx
accessibilityLabel="打开看房地图"
accessibilityRole="button"
```

```tsx
accessibilityLabel={`打开房源对比，已选择 ${comparisonIds.length} 套`}
accessibilityRole="button"
```

房源卡片添加摘要、按钮角色和详情提示：

```tsx
accessibilityLabel={`${property.title}，${property.riskSummary}，${property.monthlyRent}，通勤 ${property.commuteTime}`}
accessibilityHint="打开房源详情"
accessibilityRole="button"
```

对比按钮添加动态动作和选择状态：

```tsx
accessibilityLabel={`${selectedForComparison ? "移出" : "加入"}${property.title}房源对比`}
accessibilityRole="button"
accessibilityState={{ selected: selectedForComparison }}
```

软装按钮添加动态动作：

```tsx
accessibilityLabel={`${furnitureCount > 0 ? "继续" : "开始"}${property.title}模拟软装`}
accessibilityRole="button"
```

- [ ] **Step 2: 为对比页和详情页添加语义**

三个返回入口统一使用：

```tsx
accessibilityLabel="返回房源库"
accessibilityRole="button"
```

对比卡片使用：

```tsx
accessibilityLabel={`${property.title}，${property.monthlyRent}，入住 ${property.totalMoveInCost}，通勤 ${property.commuteTime}，高风险 ${property.highRiskCount} 项`}
accessibilityHint={`打开 ${property.title} 房源详情`}
accessibilityRole="button"
```

详情页软装入口使用：

```tsx
accessibilityLabel={`${hasFurnishLayout || hasRenderPreview ? "继续" : "开始"}${room.name}模拟软装`}
accessibilityRole="button"
```

- [ ] **Step 3: 运行契约测试观察剩余失败**

Run: `cd apps/mobile && node --test tests/accessibility-contract.test.cjs`

Expected: 第一组通过，扫描/地图和软装两组仍失败。

- [ ] **Step 4: 提交房源决策流程**

```bash
git add apps/mobile/screens/LibraryScreen.tsx apps/mobile/screens/CompareScreen.tsx apps/mobile/screens/RoomDetailScreen.tsx
git commit -m "a11y(android): label property decision actions"
```

### Task 3: 补齐扫描和地图选择语义

**Files:**
- Modify: `apps/mobile/screens/ScanScreen.tsx`
- Modify: `apps/mobile/screens/PropertyMapScreen.tsx`

- [ ] **Step 1: 为扫描页模式补充选择状态**

返回按钮使用“返回房源库”。两个模式按钮分别添加：

```tsx
accessibilityLabel="使用模拟扫描模式"
accessibilityRole="button"
accessibilityState={{ selected: mode === "mock" }}
```

```tsx
accessibilityLabel="使用户型图简化 3D 模式"
accessibilityRole="button"
accessibilityState={{ selected: mode === "floorplan" }}
```

- [ ] **Step 2: 为地图筛选和标记补充状态**

返回按钮使用“返回房源库”。筛选按钮添加：

```tsx
accessibilityLabel={`筛选：${filter.label}`}
accessibilityRole="button"
accessibilityState={{ selected: activeFilter === filter.id }}
```

地图标记保留当前摘要并添加：

```tsx
accessibilityRole="button"
accessibilityState={{ selected: selectedProperty?.id === property.id }}
accessibilityHint={`选择 ${property.title} 并查看地图摘要`}
```

详情和软装按钮分别使用：

```tsx
accessibilityLabel={`打开 ${selectedProperty.title} 房源详情`}
accessibilityRole="button"
```

```tsx
accessibilityLabel={`开始 ${selectedProperty.title} 模拟软装`}
accessibilityRole="button"
```

- [ ] **Step 3: 运行契约测试观察剩余失败**

Run: `cd apps/mobile && node --test tests/accessibility-contract.test.cjs`

Expected: 前两组通过，软装组仍失败。

- [ ] **Step 4: 提交扫描和地图语义**

```bash
git add apps/mobile/screens/ScanScreen.tsx apps/mobile/screens/PropertyMapScreen.tsx
git commit -m "a11y(android): expose scan and map selection state"
```

### Task 4: 补齐软装流程语义

**Files:**
- Modify: `apps/mobile/components/FurnitureDrawer.tsx`
- Modify: `apps/mobile/screens/FurnishStudioScreen.tsx`
- Modify: `apps/mobile/components/FurnishWebView.tsx`

- [ ] **Step 1: 为家具条目添加上下文标签**

保持现有添加回调，为每个家具条目添加：

```tsx
accessibilityLabel={`放入 ${asset.name}，${asset.description}`}
accessibilityHint="添加到当前 3D 房间"
accessibilityRole="button"
```

- [ ] **Step 2: 为工作室现有操作添加明确动作**

返回按钮：

```tsx
accessibilityLabel="保存软装布局并返回房源详情"
accessibilityRole="button"
```

生成、锁定、重置和删除分别添加按钮角色及以下标签，并保留现有禁用状态：

```text
根据当前布局生成 Mock 概念图
锁定当前选中的家具
重置 3D 场景视角
删除当前选中的家具
```

预览弹窗的关闭和保存按钮分别使用：

```text
关闭 Mock 概念图预览
保存 Mock 概念图到房源库
```

- [ ] **Step 3: 为 3D 失败页补充稳定标签**

保持现有角色和回调，分别添加：

```tsx
accessibilityLabel="重新加载 3D 场景"
```

```tsx
accessibilityLabel="退出 3D 场景并返回房源详情"
```

- [ ] **Step 4: 运行无障碍契约并确认绿灯**

Run: `cd apps/mobile && node --test tests/accessibility-contract.test.cjs`

Expected: 3/3 tests pass。

- [ ] **Step 5: 提交软装流程语义**

```bash
git add apps/mobile/components/FurnitureDrawer.tsx apps/mobile/screens/FurnishStudioScreen.tsx apps/mobile/components/FurnishWebView.tsx
git commit -m "a11y(android): label furnishing controls"
```

### Task 5: 完成仓库和 Android 验证

**Files:**
- Modify: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: 运行移动端专项验证**

Run: `cd apps/mobile && npm test`

Expected: 全部 Mobile 测试通过，包含新增 3 个无障碍契约。

Run: `cd apps/mobile && npm run typecheck`

Expected: TypeScript 退出码 0。

Run: `cd apps/mobile && npx expo config --type public`

Expected: Expo 公共配置可解析。

- [ ] **Step 2: 运行 Android 构建**

Run: `cd apps/mobile/android && .\gradlew.bat app:assembleDebug`

Expected: `BUILD SUCCESSFUL`，生成 `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`。

Run: `cd apps/mobile && npx expo export:embed --platform android --dev false --entry-file node_modules/expo/AppEntry.js --bundle-output .tmp/android-release/index.android.bundle --assets-dest .tmp/android-release`

Expected: release JavaScript bundle 成功写入。

- [ ] **Step 3: 在 API 34 模拟器检查节点语义**

安装时保留已有设备数据：

```powershell
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

依次打开房源库、模拟扫描、看房地图、房源详情和软装工作室，每页执行：

```powershell
adb shell uiautomator dump /sdcard/window.xml
adb pull /sdcard/window.xml .tmp/window.xml
```

Expected:

- `content-desc` 包含页面对应的中文动作标签。
- 扫描模式和地图筛选节点能区分选中状态。
- 软装场景未就绪时的场景操作仍不可用，就绪后可用。
- 已保存房源、软装布局和 Mock 概念图状态仍能恢复。

- [ ] **Step 4: 检查运行时错误日志**

Run:

```powershell
adb logcat -d ReactNativeJS:E AndroidRuntime:E chromium:E *:S
```

Expected: 与本轮操作相关的 React Native、AndroidRuntime 和 Chromium 错误为 0。

- [ ] **Step 5: 运行仓库级验证**

Run: `powershell -ExecutionPolicy Bypass -File scripts/verify-product.ps1`

Expected: Mobile、repository、public、后端和公开仓库检查全部通过。

- [ ] **Step 6: 记录验证证据**

在 `docs/product/roomark-android-verification.md` 记录：

- 新增无障碍契约测试数和总测试数。
- APK 与 release bundle 构建结果和大小。
- API 34 检查过的页面、节点标签和状态。
- 运行时错误日志计数。
- 物理设备 TalkBack 验收仍待完成。

- [ ] **Step 7: 提交验证记录**

```bash
git add docs/product/roomark-android-verification.md
git commit -m "docs(android): record accessibility verification"
```

### Task 6: 发布公开主分支

**Files:**
- No file changes.

- [ ] **Step 1: 确认工作区和提交范围**

Run: `git status --short`

Expected: 工作区干净。

Run: `git log --oneline origin/main..HEAD`

Expected: 仅包含本轮设计、计划、测试、语义和验证记录提交。

- [ ] **Step 2: 推送公开 main**

Run: `git push origin public-main:main`

Expected: `main` 前进到本轮最终提交。

- [ ] **Step 3: 检查 GitHub Actions**

使用仓库 Actions 页面或 `gh run list --branch main --limit 1` 找到本次推送的工作流，并等待所有必需任务成功。

Expected: 公开仓库 CI 全部成功。

- [ ] **Step 4: 核对公开链接**

Expected:

- 仓库：`https://github.com/Asaseal/roomark`
- 产品页：`https://asaseal.github.io/roomark/`
- 公开页面不出现“黑客松”“演示”“半小时更新”等已禁止措辞。

## 自审结果

- 规格覆盖：房源库、对比、详情、扫描、地图、家具抽屉、软装工作室和 3D 失败页均有对应任务。
- 范围控制：只增加标准无障碍属性、契约测试和验证记录，没有新增功能或重构组件。
- 状态一致：扫描模式、地图筛选和地图标记使用 `selected`；软装条件操作继续使用 `disabled`。
- 发布边界：模拟器验证不替代物理设备 TalkBack，验证文档必须明确保留该发布门槛。
- 占位检查：计划中没有 TBD、TODO、未定义函数或待补充步骤。
