# Roomark Android WebView 生命周期恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让现有 Android 3D 软装在 WebView renderer 退出和应用切入后台时保留最新布局、正确禁用操作并有界恢复。

**Architecture:** WebView 发出的每次有效布局先同步进入 Zustand 内存草稿，设备持久化继续使用现有 350ms 防抖和串行队列。页面进入后台时刷新待保存项目；Android renderer 退出时 WebView 自动重建一次，只有场景重新就绪或用户手动重试才开启新的恢复周期。

**Tech Stack:** React Native 0.74、Expo SDK 51、Zustand、react-native-webview 13.8.6、Node `node:test`、Android Gradle Plugin。

---

### Task 1: 建立生命周期恢复红灯契约

**Files:**
- Modify: `apps/mobile/tests/furnish-contract.test.cjs`
- Test: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: 写入失败契约测试**

在文件末尾增加：

```js
test("studio keeps the latest layout in memory and flushes it when the app backgrounds", () => {
  const screen = read(path.join("screens", "FurnishStudioScreen.tsx"));

  assert.match(screen, /AppState/);
  assert.match(screen, /const setActiveProject = useFurnishStore/);
  assert.match(screen, /setActiveProject\(projectToSave\)/);
  assert.match(screen, /AppState\.addEventListener\("change"/);
  assert.match(screen, /nextState !== "active"/);
  assert.match(screen, /void flushProjectSave\(\)/);

  const memoryDraftIndex = screen.indexOf("setActiveProject(projectToSave)");
  const pendingDraftIndex = screen.indexOf("pendingProjectRef.current = projectToSave");
  assert.ok(memoryDraftIndex >= 0 && memoryDraftIndex < pendingDraftIndex);
});

test("Android WebView renderer exit recovers once before showing manual fallback", () => {
  const bridge = read(path.join("components", "FurnishWebView.tsx"));

  assert.match(bridge, /WebViewRenderProcessGoneEvent/);
  assert.match(bridge, /automaticRecoveryAttemptedRef/);
  assert.match(bridge, /onRenderProcessGone=\{handleRenderProcessGone\}/);
  assert.match(bridge, /if \(!automaticRecoveryAttemptedRef\.current\)/);
  assert.match(bridge, /automaticRecoveryAttemptedRef\.current = true/);
  assert.match(bridge, /automaticRecoveryAttemptedRef\.current = false/);
  assert.match(bridge, /3D 场景意外退出，正在恢复/);
  assert.match(bridge, /3D 场景连续恢复失败，请重试或返回房源详情/);
});
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run:

```powershell
cd apps/mobile
node.exe --test tests/furnish-contract.test.cjs
```

Expected: 新增两个测试失败；失败原因分别是缺少 `AppState`/`setActiveProject(projectToSave)` 和缺少 `onRenderProcessGone`，原有 9 个测试通过。

- [ ] **Step 3: 提交红灯测试**

```powershell
git add apps/mobile/tests/furnish-contract.test.cjs
git commit -m "test(android): cover WebView lifecycle recovery"
```

### Task 2: 保持最新内存草稿并刷新后台保存

**Files:**
- Modify: `apps/mobile/screens/FurnishStudioScreen.tsx`
- Test: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: 接入 AppState 和内存草稿更新**

把 React Native 导入扩展为：

```ts
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
```

在 store selector 区域增加：

```ts
const setActiveProject = useFurnishStore((state) => state.setActiveProject);
```

在 `handleProjectChanged` 内、写入 `pendingProjectRef` 前增加：

```ts
setActiveProject(projectToSave);
```

并把 `setActiveProject` 加入 `useCallback` 依赖：

```ts
[activeProject?.renderPreview, flushProjectSave, setActiveProject]
```

- [ ] **Step 2: 在离开 active 状态时刷新待保存项目**

紧接 `flushProjectSave` 定义后增加：

```ts
useEffect(() => {
  const subscription = AppState.addEventListener("change", (nextState) => {
    if (nextState !== "active" && pendingProjectRef.current) {
      void flushProjectSave();
    }
  });

  return () => subscription.remove();
}, [flushProjectSave]);
```

- [ ] **Step 3: 运行目标测试**

Run:

```powershell
cd apps/mobile
node.exe --test tests/furnish-contract.test.cjs
```

Expected: “studio keeps the latest layout…” 通过；renderer 恢复测试仍因缺少 `onRenderProcessGone` 失败。

- [ ] **Step 4: 运行类型检查**

Run:

```powershell
cd apps/mobile
npm.cmd run typecheck
```

Expected: `tsc --noEmit` exit 0。

- [ ] **Step 5: 提交草稿与后台保存增量**

```powershell
git add apps/mobile/screens/FurnishStudioScreen.tsx
git commit -m "fix(android): flush furnish drafts on background"
```

### Task 3: 有界恢复 Android WebView renderer

**Files:**
- Modify: `apps/mobile/components/FurnishWebView.tsx`
- Test: `apps/mobile/tests/furnish-contract.test.cjs`

- [ ] **Step 1: 导入 renderer 事件类型并增加恢复守卫**

把 WebView 导入改为：

```ts
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewRenderProcessGoneEvent } from "react-native-webview";
```

在其他 ref 旁增加：

```ts
const automaticRecoveryAttemptedRef = useRef(false);
```

- [ ] **Step 2: 提取同一套场景重建动作**

在 `retryScene` 原位置前增加：

```ts
const restartScene = useCallback(() => {
  clearLoadTimeout();
  setLoadError(null);
  setSceneReady(false);
  setSceneHtml(null);
  initSentRef.current = false;
  onSceneReadyChanged(false);
  setWebViewKey((value) => value + 1);
}, [clearLoadTimeout, onSceneReadyChanged]);
```

把手动重试改为：

```ts
const retryScene = () => {
  automaticRecoveryAttemptedRef.current = false;
  restartScene();
};
```

- [ ] **Step 3: 实现 renderer 退出处理**

在 `handleMessage` 前增加：

```ts
const handleRenderProcessGone = useCallback(
  (event: WebViewRenderProcessGoneEvent) => {
    clearLoadTimeout();
    setSceneReady(false);
    onSceneReadyChanged(false);

    if (!automaticRecoveryAttemptedRef.current) {
      automaticRecoveryAttemptedRef.current = true;
      onSceneNotice(
        event.nativeEvent.didCrash
          ? "3D 场景意外退出，正在恢复"
          : "3D 场景被系统回收，正在恢复"
      );
      restartScene();
      return;
    }

    const message = "3D 场景连续恢复失败，请重试或返回房源详情";
    setLoadError(message);
    onSceneError(message);
  },
  [clearLoadTimeout, onSceneError, onSceneNotice, onSceneReadyChanged, restartScene]
);
```

在 `SCENE_READY` 分支中、通知父页面前增加：

```ts
automaticRecoveryAttemptedRef.current = false;
```

在 `<WebView>` 上增加：

```tsx
onRenderProcessGone={handleRenderProcessGone}
```

- [ ] **Step 4: 运行红绿测试**

Run:

```powershell
cd apps/mobile
node.exe --test tests/furnish-contract.test.cjs
```

Expected: 11 tests passed，0 failed。

- [ ] **Step 5: 运行 Mobile 验证**

Run:

```powershell
cd apps/mobile
npm.cmd run verify
```

Expected: Mobile 全部测试、TypeScript 和 Expo 公共配置均通过。

- [ ] **Step 6: 提交 renderer 恢复增量**

```powershell
git add apps/mobile/components/FurnishWebView.tsx
git commit -m "fix(android): recover the 3D renderer safely"
```

### Task 4: 更新可靠性文档

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: 记录生命周期恢复行为**

在 `apps/mobile/README.md` 的“本地数据”段落补充：

```markdown
软装布局变化会先进入当前会话的内存草稿，再通过防抖队列写入设备；应用切到后台时会主动刷新待保存布局。Android WebView renderer 被系统回收或崩溃后自动恢复一次，连续失败时停止循环并提供手动重试和返回入口。
```

在 `docs/product/roomark-android-verification.md` 的“成熟度可靠性增量”增加：

```markdown
- 软装布局变化先同步为最新内存草稿，350ms 防抖仍只控制设备写入；WebView 重建不会回退到旧的 `activeProject`。
- 应用离开前台时主动刷新待保存软装布局，失败后继续保留重试状态。
- Android WebView renderer 退出后自动重建一次；连续退出停止自动循环并显示手动恢复入口。
```

- [ ] **Step 2: 运行公开策略测试**

Run:

```powershell
node.exe --test scripts/tests/public-repository-policy.test.cjs
```

Expected: 7 tests passed，0 failed。

- [ ] **Step 3: 提交文档**

```powershell
git add apps/mobile/README.md docs/product/roomark-android-verification.md
git commit -m "docs(android): record WebView recovery behavior"
```

### Task 5: 原生构建与模拟器真实验收

**Files:**
- Verify: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Verify: `apps/mobile/android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle`
- Evidence: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: 构建 Android Debug APK**

Run:

```powershell
$env:JAVA_HOME='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\jdk17-portable\jdk-17.0.19+10'
$env:ANDROID_HOME='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
cd apps/mobile/android
.\gradlew.bat app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`。

- [ ] **Step 2: 生成 Release 离线 JS 与资产**

Run:

```powershell
.\gradlew.bat app:createBundleReleaseJsAndAssets
```

Expected: Metro 打包成功，输出 bundle 并复制 6 个资产文件。

- [ ] **Step 3: 启动或重启 API 34 headless 模拟器**

使用仓库既有工具链；如果旧模拟器不响应，先关闭该 `Roomark_API_34` 实例，再运行：

```powershell
$sdk='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\android-sdk'
Start-Process -FilePath "$sdk\emulator\emulator.exe" -ArgumentList @(
  '-avd','Roomark_API_34','-no-window','-no-audio','-no-boot-anim',
  '-gpu','swiftshader_indirect','-no-snapshot','-wipe-data'
) -WindowStyle Hidden
& "$sdk\platform-tools\adb.exe" wait-for-device
& "$sdk\platform-tools\adb.exe" shell getprop sys.boot_completed
```

Expected: `sys.boot_completed` 返回 `1`。

- [ ] **Step 4: 安装 Debug APK 并连接 Metro**

```powershell
$mobile='D:\wt\roomark-maturity\apps\mobile'
$sdk='C:\Users\gaowe\Documents\Codex\2026-07-20\black-swan-product-review\work\toolchain\android-sdk'
$env:CI='1'
$metroOut=Join-Path $env:TEMP 'roomark-metro.out.log'
$metroErr=Join-Path $env:TEMP 'roomark-metro.err.log'
Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','start','--','--port','8081') -WorkingDirectory $mobile -WindowStyle Hidden -RedirectStandardOutput $metroOut -RedirectStandardError $metroErr
& "$sdk\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
& "$sdk\platform-tools\adb.exe" install -r "$mobile\android\app\build\outputs\apk\debug\app-debug.apk"
& "$sdk\platform-tools\adb.exe" shell am start -n com.roomark.app/.MainActivity
```

Expected: 安装成功，`MainActivity` 启动且没有 React Native 红屏。

- [ ] **Step 5: 验证后台刷新与重启恢复**

通过 `uiautomator dump`、坐标点击和截图进入任一房源软装页，添加家具后立即执行：

```powershell
& "$sdk\platform-tools\adb.exe" shell input keyevent KEYCODE_HOME
Start-Sleep -Seconds 2
& "$sdk\platform-tools\adb.exe" shell am force-stop com.roomark.app
& "$sdk\platform-tools\adb.exe" shell am start -n com.roomark.app/.MainActivity
```

Expected: 重新进入对应软装页后，家具数量和布局状态从设备恢复；logcat 中没有 AsyncStorage 未处理异常。

- [ ] **Step 6: 验证 renderer 自动恢复与有界失败**

保持软装页前台，获取 renderer PID 并终止：

```powershell
& "$sdk\platform-tools\adb.exe" root
$rendererLine = & "$sdk\platform-tools\adb.exe" shell ps -A -o PID,NAME |
  Select-String 'sandboxed_process' |
  Select-Object -First 1
$rendererPid = ($rendererLine.ToString().Trim() -split '\s+')[0]
& "$sdk\platform-tools\adb.exe" shell kill -9 $rendererPid
```

Expected: Roomark 主进程仍在前台，场景操作先禁用，随后 3D 场景自动恢复且保留最新内存布局。再次在场景就绪前终止新 renderer，Expected: 不再自动循环，显示“重试加载”和“返回房源详情”。

- [ ] **Step 7: 把实际设备证据写回验证记录**

只记录真实观察到的模拟器结果、Android/API/WebView 版本、命令和限制；未能复现的项目标记为 `DEFERRED`，不得写成 `PASS`。

### Task 6: 全仓验证、发布与远端核验

**Files:**
- Verify: repository-wide maintained surfaces
- Publish: `public-main` to `origin/main`

- [ ] **Step 1: 运行最终全仓验证**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/product-verify.ps1 -Full
git diff --check
```

Expected: Mobile、Repository、Public content、JavaScript、Backend tests 和 Backend formatting 全部通过；`git diff --check` 无输出。

- [ ] **Step 2: 提交模拟器证据**

```powershell
git add docs/product/roomark-android-verification.md
git commit -m "test(android): record WebView recovery validation"
```

- [ ] **Step 3: 核对提交范围和工作区**

```powershell
git status --short
git log --oneline origin/main..HEAD
```

Expected: 工作区干净，只有本规格、实施计划、测试、生命周期恢复和验证文档相关提交。

- [ ] **Step 4: 推送公开主分支**

```powershell
git push origin public-main:main
```

- [ ] **Step 5: 等待并核验 GitHub CI**

```powershell
$headSha = git rev-parse HEAD
$runs = gh run list --repo Asaseal/roomark --limit 10 --json databaseId,name,status,conclusion,headSha,url | ConvertFrom-Json
$ciRunId = ($runs | Where-Object { $_.name -eq 'CI' -and $_.headSha -eq $headSha } | Select-Object -First 1).databaseId
if (-not $ciRunId) { throw "CI run not found for $headSha" }
gh run watch $ciRunId --repo Asaseal/roomark --exit-status --interval 5
```

Expected: Mobile、Backend、Public content 和 Container 作业全部成功；本地 `HEAD` 与 `origin/main` SHA 一致，公开仓库仍为 `main` 和 `public`。
