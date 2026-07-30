# Roomark Android Bounded Storage Reads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为产品状态和软装项目的本地读取增加统一 8 秒上限，使 Android 在底层读取永久 pending 时进入现有安全恢复结果，而不是永久停留在加载状态。

**Architecture:** 新增一个不依赖 React、Zustand 或 AsyncStorage 的 Promise 读取保护器，只负责单次结算、计时器清理和迟到结果忽略。`productStorage` 与 `furnishStorage` 的 `getItem` 使用该保护器；写入与删除保持现状，避免不可取消写入发生迟到覆盖。

**Tech Stack:** TypeScript、React Native 0.74、AsyncStorage、Zustand、Node.js `node:test`、Android Gradle、ADB/UI Automator

---

## 文件结构

- Create: `apps/mobile/services/storageOperation.ts` — 共享本地读取时间边界。
- Create: `apps/mobile/tests/storage-operation-timeout.test.cjs` — 执行真实 Promise 成功、失败、超时和迟到结算行为。
- Modify: `apps/mobile/tests/product-storage-contract.test.cjs` — 固定产品与软装服务接入边界，并禁止误包裹写入。
- Modify: `apps/mobile/services/productStorage.ts` — 为产品状态 `getItem` 增加读取上限。
- Modify: `apps/mobile/services/furnishStorage.ts` — 为软装 `getItem` 增加读取上限并复用现有空白恢复。
- Modify: `apps/mobile/README.md` — 记录本地读取不会无限等待。
- Modify: `docs/product/roomark-android-verification.md` — 记录自动化、构建和模拟器证据。

### Task 1: 建立读取保护器失败测试

**Files:**
- Create: `apps/mobile/tests/storage-operation-timeout.test.cjs`

- [ ] **Step 1: 写入真实 Promise 行为测试**

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const mobileRoot = path.resolve(__dirname, "..");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function loadStorageOperation() {
  const source = fs.readFileSync(
    path.join(mobileRoot, "services", "storageOperation.ts"),
    "utf8"
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  Function("module", "exports", compiled)(module, module.exports);
  return module.exports;
}

test("storage read returns the original value before the deadline", async () => {
  const { runStorageRead } = loadStorageOperation();
  let readCount = 0;

  const result = await runStorageRead(
    async () => {
      readCount += 1;
      return "stored-value";
    },
    { operationName: "测试读取", timeoutMs: 100 }
  );

  assert.equal(result, "stored-value");
  assert.equal(readCount, 1);
});

test("storage read preserves an original rejection before the deadline", async () => {
  const { runStorageRead } = loadStorageOperation();
  const originalError = new Error("native read failed");

  await assert.rejects(
    runStorageRead(
      async () => {
        throw originalError;
      },
      { operationName: "测试读取", timeoutMs: 100 }
    ),
    (error) => error === originalError
  );
});

test("pending storage read rejects with a typed timeout", async () => {
  const { runStorageRead, StorageOperationTimeoutError } = loadStorageOperation();

  await assert.rejects(
    runStorageRead(
      () => new Promise(() => {}),
      { operationName: "看房记录读取", timeoutMs: 15 }
    ),
    (error) => {
      assert.ok(error instanceof StorageOperationTimeoutError);
      assert.equal(error.name, "StorageOperationTimeoutError");
      assert.match(error.message, /看房记录读取/);
      assert.match(error.message, /15/);
      return true;
    }
  );
});

test("late storage result cannot replace an earlier timeout", async () => {
  const { runStorageRead } = loadStorageOperation();
  let finishRead;
  const outcomes = [];
  const guardedRead = runStorageRead(
    () => new Promise((resolve) => {
      finishRead = resolve;
    }),
    { operationName: "软装记录读取", timeoutMs: 15 }
  );

  void guardedRead.then(
    (value) => outcomes.push(`resolved:${value}`),
    () => outcomes.push("timeout")
  );
  await delay(30);
  assert.deepEqual(outcomes, ["timeout"]);

  finishRead("late-value");
  await delay(0);
  assert.deepEqual(outcomes, ["timeout"]);
});
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `cd apps/mobile && node --test tests/storage-operation-timeout.test.cjs`

Expected: 测试因 `services/storageOperation.ts` 不存在而失败。

- [ ] **Step 3: 提交失败测试**

```bash
git add apps/mobile/tests/storage-operation-timeout.test.cjs
git commit -m "test(android): specify bounded storage reads"
```

### Task 2: 实现共享读取时间边界

**Files:**
- Create: `apps/mobile/services/storageOperation.ts`
- Test: `apps/mobile/tests/storage-operation-timeout.test.cjs`

- [ ] **Step 1: 实现单次结算保护器**

```ts
export const STORAGE_READ_TIMEOUT_MS = 8_000;

type StorageReadOptions = {
  operationName?: string;
  timeoutMs?: number;
};

export class StorageOperationTimeoutError extends Error {
  constructor(operationName: string, timeoutMs: number) {
    super(`${operationName}超过 ${timeoutMs}ms 仍未完成。`);
    this.name = "StorageOperationTimeoutError";
  }
}

export function runStorageRead<T>(
  operation: () => Promise<T>,
  options: StorageReadOptions = {}
): Promise<T> {
  const operationName = options.operationName ?? "本地存储读取";
  const timeoutMs = options.timeoutMs ?? STORAGE_READ_TIMEOUT_MS;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new StorageOperationTimeoutError(operationName, timeoutMs));
    }, timeoutMs);

    void Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          resolve(value);
        },
        (error) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      );
  });
}
```

- [ ] **Step 2: 运行专项测试并确认绿灯**

Run: `cd apps/mobile && node --test tests/storage-operation-timeout.test.cjs`

Expected: 4/4 tests pass，测试进程立即退出，没有遗留 8 秒计时器。

- [ ] **Step 3: 运行 TypeScript**

Run: `cd apps/mobile && npm.cmd run typecheck`

Expected: TypeScript 退出码 0。

- [ ] **Step 4: 提交读取保护器**

```bash
git add apps/mobile/services/storageOperation.ts
git commit -m "fix(android): bound local storage reads"
```

### Task 3: 接入产品与软装读取链路

**Files:**
- Modify: `apps/mobile/tests/product-storage-contract.test.cjs`
- Modify: `apps/mobile/services/productStorage.ts`
- Modify: `apps/mobile/services/furnishStorage.ts`

- [ ] **Step 1: 添加服务接入失败契约**

在 `product-storage-contract.test.cjs` 增加：

```js
test("local reads are bounded without timing out non-cancellable writes", () => {
  const productStorage = read(path.join("services", "productStorage.ts"));
  const furnishStorage = read(path.join("services", "furnishStorage.ts"));

  assert.match(productStorage, /runStorageRead/);
  assert.match(
    productStorage,
    /runStorageRead\(\s*\(\) => AsyncStorage\.getItem\(productStorageKey\)/
  );
  assert.match(furnishStorage, /runStorageRead/);
  assert.match(
    furnishStorage,
    /runStorageRead\(\s*\(\) => AsyncStorage\.getItem\(`\$\{storagePrefix\}\$\{roomMesh\.id\}`\)/
  );
  assert.match(
    furnishStorage,
    /catch[\s\S]*recoverFurnishProject\(undefined, roomMesh\)/
  );
  assert.doesNotMatch(
    `${productStorage}\n${furnishStorage}`,
    /runStorageRead\(\(\) => AsyncStorage\.(setItem|removeItem)/
  );
});
```

- [ ] **Step 2: 运行契约并确认红灯**

Run: `cd apps/mobile && node --test tests/product-storage-contract.test.cjs`

Expected: 新测试因两个服务尚未使用 `runStorageRead` 而失败。

- [ ] **Step 3: 接入产品状态读取**

在 `productStorage.ts` 导入保护器：

```ts
import { runStorageRead } from "./storageOperation";
```

把读取替换为：

```ts
const storedValue = await runStorageRead(
  () => AsyncStorage.getItem(productStorageKey),
  { operationName: "看房记录读取" }
);
```

保留现有 `catch` 和 `recoverProductState(undefined, propertyCatalog)`。

- [ ] **Step 4: 接入软装读取与现有恢复**

在 `furnishStorage.ts` 导入保护器：

```ts
import { runStorageRead } from "./storageOperation";
```

将整个读取与解析放进同一个 `try`：

```ts
export async function loadFurnishProject(roomMesh: RoomMesh): Promise<FurnishProjectLoadResult> {
  try {
    const stored = await runStorageRead(
      () => AsyncStorage.getItem(`${storagePrefix}${roomMesh.id}`),
      { operationName: "软装记录读取" }
    );

    if (!stored) {
      return {
        project: createEmptyFurnishProject(roomMesh),
        recovered: false
      };
    }

    return recoverFurnishProject(JSON.parse(stored) as unknown, roomMesh);
  } catch {
    return recoverFurnishProject(undefined, roomMesh);
  }
}
```

`saveFurnishProject`、`clearFurnishProject` 和 `queueFurnishProjectSync` 保持不变。

- [ ] **Step 5: 运行专项测试**

Run: `cd apps/mobile && node --test tests/storage-operation-timeout.test.cjs tests/product-storage-contract.test.cjs tests/furnish-project-recovery.test.cjs tests/furnish-store-isolation.test.cjs`

Expected: 全部通过，软装加载隔离与恢复行为不回归。

- [ ] **Step 6: 提交服务接入**

```bash
git add apps/mobile/tests/product-storage-contract.test.cjs apps/mobile/services/productStorage.ts apps/mobile/services/furnishStorage.ts
git commit -m "fix(android): recover stalled local reads"
```

### Task 4: 文档、Android 与仓库验证

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: 更新移动端数据说明**

在“本地数据”中补充：

```text
产品状态和软装项目读取最多等待 8 秒；读取超时会进入现有设备内置房源或空白软装恢复结果，迟到读取不会覆盖用户已经开始使用后的当前状态。写入不使用读取超时保护，避免不可取消的旧写入迟到覆盖新数据。
```

- [ ] **Step 2: 运行 Mobile 全量验证**

Run: `cd apps/mobile && npm.cmd test`

Expected: 原有 74 个测试加新增 4 个行为测试与 1 个契约测试全部通过。

Run: `cd apps/mobile && npm.cmd run typecheck`

Expected: TypeScript 退出码 0。

Run: `cd apps/mobile && npx.cmd expo config --type public`

Expected: Expo 公共配置可解析。

- [ ] **Step 3: 构建 Android 产物**

为当前任务便携工具链设置 `JAVA_HOME`、`ANDROID_HOME` 和 `ANDROID_SDK_ROOT`，运行：

```powershell
cd apps/mobile/android
.\gradlew.bat app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`。

Run:

```powershell
cd apps/mobile
npx.cmd expo export:embed --platform android --dev false --entry-file node_modules/expo/AppEntry.js --bundle-output .tmp/android-release/index.android.bundle --assets-dest .tmp/android-release
```

Expected: release JavaScript bundle 成功写入。

- [ ] **Step 4: API 34 正常数据回归**

启动离线 Metro，仅使用覆盖安装保留当前数据：

```powershell
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081
```

Expected:

- Library 恢复当前 3 套内置房源、比较状态和样例房型 4 件家具。
- 进入样例房型软装后本地 GLB 与“已恢复上次软装布局”出现。
- 返回 Library 后状态不丢失。
- React Native、AndroidRuntime 和 Chromium 错误日志为 0。

- [ ] **Step 5: 记录验证证据**

在 `roomark-android-verification.md` 记录：

- 新增行为与契约测试数量、Mobile 总数。
- 8 秒读取边界、迟到读取忽略和写入排除原因。
- APK 与 release bundle 构建结果和大小。
- API 34 正常启动、4 件布局恢复和错误日志。
- 物理设备存储故障仍是正式发布前门槛。

- [ ] **Step 6: 运行仓库级验证**

Run:

```powershell
node --test scripts/tests/*.test.cjs
node --test apps/web-preview/tests/*.test.cjs
node --test apps/web-furnish/tests/*.test.cjs
node --test apps/website/tests/*.test.cjs
powershell -ExecutionPolicy Bypass -File scripts/product-verify.ps1
```

Run in `services/backend`:

```powershell
cargo fmt --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked
```

Expected: 全部通过。

- [ ] **Step 7: 提交文档证据**

```bash
git add apps/mobile/README.md docs/product/roomark-android-verification.md
git commit -m "docs(android): record bounded storage verification"
```

### Task 5: 发布公开主分支

**Files:**
- No file changes.

- [ ] **Step 1: 确认范围与远端基线**

Run:

```powershell
git status --short
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git log --oneline origin/main..HEAD
```

Expected: 工作区干净，公开 `main` 是当前分支祖先，提交仅属于本轮读取保护。

- [ ] **Step 2: 推送公开 main**

Run: `git push origin public-main:main`

Expected: 远端 `main` 快进到本轮最终提交。

- [ ] **Step 3: 等待 GitHub Actions**

使用 `gh run list --repo Asaseal/roomark --branch main` 找到本次提交的 CI，并等待 `public-content`、`mobile`、`backend` 和 `container` 全部成功。

- [ ] **Step 4: 核对最终状态**

Expected:

- `git rev-parse HEAD`、`git rev-parse origin/main` 与 `git ls-remote origin refs/heads/main` 一致。
- 公开仓库：`https://github.com/Asaseal/roomark`
- 产品页面：`https://asaseal.github.io/roomark/`

## 自审结果

- 规格覆盖：产品启动与软装预载两条 `getItem` 链路均接入共享保护器。
- 行为覆盖：正常成功、原始失败、永久 pending 和超时后迟到结果均有真实 Promise 测试。
- 数据安全：`setItem` 与 `removeItem` 明确不接入读取保护，避免不可取消写入乱序。
- 范围控制：不新增页面、入口、存储键、schema 或业务功能。
- 验收边界：模拟器只验证正常数据回归；物理设备存储故障不作虚假声明。
- 占位检查：计划没有未定义函数、待填内容或模糊实施步骤。
