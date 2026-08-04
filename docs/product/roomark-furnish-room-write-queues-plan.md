# Furnish Room Write Queues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate a permanently pending furnishing write to its room while preserving same-room write order.

**Architecture:** Replace the single process-wide Promise tail with a `Map<string, Promise<void>>` keyed by `roomId`. Queue operations against only the matching room and delete settled tails safely by identity.

**Tech Stack:** TypeScript, Zustand, AsyncStorage, Node test runner

---

### Task 1: Prove cross-room head-of-line blocking

**Files:**
- Modify: `apps/mobile/tests/furnish-store-isolation.test.cjs`

- [ ] **Step 1: Write the failing behavior test**

Add a test that starts saves for `studioRoom` and `backgroundRoom`, leaves the studio write pending, flushes microtasks, and asserts two underlying `pendingSaves` entries exist. Resolve the background write first and assert its save returns `true` while studio remains pending.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/furnish-store-isolation.test.cjs`

Expected: FAIL because the global queue creates only one underlying write until the studio write settles.

- [ ] **Step 3: Commit the regression test**

Run:

```powershell
git add apps/mobile/tests/furnish-store-isolation.test.cjs
git commit -m "test(android): reproduce cross-room save blocking"
```

### Task 2: Isolate queues by room

**Files:**
- Modify: `apps/mobile/stores/furnishStore.ts`

- [ ] **Step 1: Replace the global tail with a room map**

Use:

```ts
const furnishPersistenceQueues = new Map<string, Promise<void>>();

function enqueueFurnishPersistence(
  roomId: string,
  operation: () => Promise<void>
): Promise<void> {
  const previousWrite = furnishPersistenceQueues.get(roomId) ?? Promise.resolve();
  const queuedWrite = previousWrite.then(operation, operation);
  const queueTail = queuedWrite.then(() => undefined, () => undefined);
  furnishPersistenceQueues.set(roomId, queueTail);
  void queueTail.finally(() => {
    if (furnishPersistenceQueues.get(roomId) === queueTail) {
      furnishPersistenceQueues.delete(roomId);
    }
  });
  return queuedWrite;
}
```

Pass `nextProject.roomId` from `saveProject`.

- [ ] **Step 2: Run focused tests and verify GREEN**

Run: `node --test tests/furnish-store-isolation.test.cjs`

Expected: all Store isolation tests pass, including cross-room concurrency and same-room serialization.

- [ ] **Step 3: Run mobile verification**

Run: `npm run verify`

Expected: all tests, TypeScript, and Expo public config pass.

- [ ] **Step 4: Commit the implementation**

Run:

```powershell
git add apps/mobile/stores/furnishStore.ts
git commit -m "fix(android): isolate furnish writes by room"
```

### Task 3: Record evidence and publish

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: Document the queue boundary**

State that writes remain serialized within each room while other rooms are no longer blocked by a pending write. Explicitly preserve the no-write-timeout rationale.

- [ ] **Step 2: Run full repository verification**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/product-verify.ps1 -Full
git diff --check
git status --short
```

Expected: verification passes and only intended documentation changes remain before commit.

- [ ] **Step 3: Commit documentation**

Run:

```powershell
git add apps/mobile/README.md docs/product/roomark-android-verification.md
git commit -m "docs(android): record room-isolated writes"
```

- [ ] **Step 4: Push and verify CI**

Fetch `origin/main`, confirm it is an ancestor of `HEAD`, push `public-main:main`, then wait for the exact commit's GitHub Actions workflow to complete successfully.
