const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const mobileRoot = path.resolve(__dirname, "..");
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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
  const { runStorageRead, StorageOperationTimeoutError } =
    loadStorageOperation();

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
    () =>
      new Promise((resolve) => {
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
