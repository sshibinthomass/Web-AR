# Photo to AR Ready Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the completed generation overlay and reveal the active AR camera with the newly generated model ready to place.

**Architecture:** Preserve synchronous WebXR startup from the Generate and place user gesture. Make `ARHud.showFullFlowReady` complete the visual state transition explicitly so it works even when the router is already on `#/ar` and skips same-route preparation.

**Tech Stack:** TypeScript, DOM/CSS state, Vitest, Vite

## Global Constraints

- Keep WebXR startup attached to the Generate and place user gesture.
- Do not change same-route router behavior globally.
- Do not change generation, segmentation, or model-hosting services.
- Keep existing generation and model-loading error paths.

---

### Task 1: Complete the same-route loading-to-placement transition

**Files:**
- Modify: `tests/ui/ARHud.test.ts`
- Modify: `src/ui/ARHud.ts`

**Interfaces:**
- Consumes: `ARHud.showFullFlowLoading(message)` and `ARHud.showFullFlowReady(message, modelOption?)`.
- Produces: An idempotent ready transition that hides `.full-flow-loading`, clears loading presentation classes, shows `.hud-actions` and `.gesture-surface`, keeps `.ar-model-picker` hidden, and selects the generated model.

- [ ] **Step 1: Add the failing regression test**

Exercise the real sequence: open Photo to AR, show a captured image, click Generate and place so the active route is already `#/ar`, then call `showFullFlowReady` with a generated model. Assert:

```ts
expect(root.querySelector('.full-flow-loading')?.classList.contains('hidden')).toBe(true);
expect(root.querySelector('.status-panel')?.classList.contains('full-flow-active')).toBe(false);
expect(root.querySelector('.hud-actions')?.classList.contains('hidden')).toBe(false);
expect(root.querySelector('.gesture-surface')?.classList.contains('hidden')).toBe(false);
expect(root.querySelector('.ar-model-picker')?.classList.contains('hidden')).toBe(true);
expect(root.querySelector<HTMLSelectElement>('.model-picker select')?.value)
  .toBe('full-flow-generated-object');
```

- [ ] **Step 2: Verify the regression test fails**

Run: `npm test -- --run tests/ui/ARHud.test.ts`

Expected: FAIL because `.full-flow-loading` remains visible and `.status-panel` retains `full-flow-active` after same-route completion.

- [ ] **Step 3: Implement the minimal ready-state cleanup**

In `showFullFlowReady`, before revealing placement controls:

```ts
this.fullFlowLoading.classList.add('hidden');
this.statusPanel.classList.remove('camera-active', 'ar-picker-active', 'full-flow-active');
```

Keep the existing route replacement, placement-state update, model selection, and status message behavior.

- [ ] **Step 4: Run focused and complete verification**

Run:

```powershell
npm test -- --run tests/ui/ARHud.test.ts
npm test -- --run
npm run build
git diff --check
```

Expected: all tests pass, the build succeeds, and the diff check is clean.

- [ ] **Step 5: Commit and publish**

```powershell
git add src/ui/ARHud.ts tests/ui/ARHud.test.ts
git commit -m "fix: reveal AR when photo generation completes"
git push origin main
```

Wait for GitHub Pages and verify the production ready transition reveals the AR camera instead of leaving the generation overlay visible.
