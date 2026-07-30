# Roomark Truthful Render Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android room-detail copy describe the existing local Mock concept preview truthfully without adding features or changing stored data.

**Architecture:** Keep the existing `RenderPreview` data flow and persistence schema unchanged. Add one source-contract test around the user-visible detail screen, then replace only misleading labels and future promises in `RoomDetailScreen.tsx`.

**Tech Stack:** React Native, TypeScript, Node.js built-in test runner, PowerShell verification scripts.

---

### Task 1: Add the truthful-copy regression contract

**Files:**
- Modify: `apps/mobile/tests/core-flow-contract.test.cjs`
- Test: `apps/mobile/tests/core-flow-contract.test.cjs`

- [ ] **Step 1: Write the failing test**

Append this contract:

```js
test("room detail describes the local concept preview without future promises", () => {
  const detail = read(path.join("screens", "RoomDetailScreen.tsx"));

  assert.match(detail, /Mock 概念图/);
  assert.match(detail, /本地概念预览/);
  assert.doesNotMatch(detail, /AI 效果图/);
  assert.doesNotMatch(detail, /生成效果图/);
  assert.doesNotMatch(detail, /生成一张室内效果图/);
  assert.doesNotMatch(detail, /导出 PDF/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
cd apps/mobile
node --test tests/core-flow-contract.test.cjs
```

Expected: the new test fails because `RoomDetailScreen.tsx` still contains `AI 效果图`, image-generation wording, and `导出 PDF`.

- [ ] **Step 3: Commit the failing contract**

```powershell
git add apps/mobile/tests/core-flow-contract.test.cjs
git commit -m "test(android): require truthful concept preview copy"
```

### Task 2: Align the room-detail copy

**Files:**
- Modify: `apps/mobile/screens/RoomDetailScreen.tsx`
- Test: `apps/mobile/tests/core-flow-contract.test.cjs`

- [ ] **Step 1: Replace only user-visible misleading wording**

Apply these exact semantic changes:

```tsx
const previewTime = formatClockTime(project?.renderPreview?.savedAt ?? project?.renderPreview?.createdAt);
```

```tsx
<Text style={styles.sectionTitle}>模拟与概念图</Text>
<Text style={styles.statusLabel}>Mock 概念图</Text>
<Text style={styles.statusValue}>{hasRenderPreview ? "已保存" : "未创建"}</Text>
<Text style={styles.statusMeta}>{hasRenderPreview ? `最近保存 ${previewTime}` : "进入软装后创建"}</Text>
```

```tsx
<Text style={styles.primaryButtonSubText}>验证家具摆放，并保存概念预览</Text>
```

```tsx
<Text style={styles.aiStateTitle}>查看 Mock 概念图状态</Text>
<Text style={styles.aiStateText}>
  {hasRenderPreview ? `Mock 概念图已保存，可继续调整 · ${previewTime}` : "摆好家具后，可创建本地概念预览。"}
</Text>
```

```tsx
<Text style={styles.evidenceLabel}>看房记录摘要</Text>
<Text style={styles.evidenceText}>本地记录预览：已整理风险标签、现场备注、软装状态和 Mock 概念图状态。</Text>
```

- [ ] **Step 2: Run the focused test and verify GREEN**

Run:

```powershell
cd apps/mobile
node --test tests/core-flow-contract.test.cjs
```

Expected: all focused tests pass.

- [ ] **Step 3: Run Mobile verification**

Run:

```powershell
cd apps/mobile
npm.cmd run verify
```

Expected: all Mobile tests, TypeScript, and Expo public config checks pass.

- [ ] **Step 4: Commit the implementation**

```powershell
git add apps/mobile/screens/RoomDetailScreen.tsx
git commit -m "fix(android): describe concept previews truthfully"
```

### Task 3: Record evidence and publish

**Files:**
- Modify: `docs/product/roomark-android-verification.md`

- [ ] **Step 1: Record the completed copy audit**

Add a 2026-07-30 maturity note stating that the room-detail screen now uses `Mock 概念图`, removes AI-generation language and removes the PDF promise without changing the persisted project schema.

- [ ] **Step 2: Run the full repository gate**

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\product-verify.ps1 -Full
git diff --check
```

Expected: verification exits zero and Git reports no whitespace errors.

- [ ] **Step 3: Commit the verification evidence**

```powershell
git add docs/product/roomark-android-verification.md
git commit -m "docs(android): record truthful preview copy"
```

- [ ] **Step 4: Push the verified branch**

```powershell
git push origin public-main:main
```

Expected: the public `main` branch advances to the new local commit.

- [ ] **Step 5: Wait for CI**

Use `gh run list` and `gh run view` for the pushed SHA. Expected: public-content, mobile, backend, and container jobs all complete successfully.
