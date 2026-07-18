# Photo-to-AR Immersive Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Photo-to-AR use a full-viewport camera/capture layout and loop the segmented object reconstruction throughout model generation.

**Architecture:** Extend the existing canvas renderer with explicit loop playback, then create a second renderer bound to a dedicated generation-stage host. ARHud caches the latest successful mask and bounds, while WebARApp preserves an in-flight segmentation request during the intentional capture-to-generation transition so the loading view can upgrade without another backend call. Route-scoped CSS makes only Photo-to-AR capture surfaces edge-to-edge.

**Tech Stack:** TypeScript, DOM Canvas 2D, Vitest/jsdom, CSS media queries, Vite.

## Global Constraints

- Do not send a second segmentation request for generation loading.
- Model generation starts immediately and does not wait for segmentation or animation.
- Segmentation failure must not fail model generation.
- Reduced-motion mode shows a static outlined object until cancellation.
- Upload, speech, model-management, and standard AR-picker layouts remain unchanged.
- Every timer, frame, observer, image load, and canvas must be cleaned up on cancellation or disposal.

---

### Task 1: Loop Playback in ObjectReconstructionOverlay

**Files:**
- Modify: `src/ui/ObjectReconstructionOverlay.ts`
- Test: `tests/ui/ObjectReconstructionOverlay.test.ts`

**Interfaces:**
- Consumes: existing `ObjectReconstructionOverlay.play(ReconstructionPlayback): Promise<void>`.
- Produces: `ReconstructionPlayback.loop?: boolean`; loop playback remains pending until `cancel()`/`dispose()` and then resolves.

- [ ] **Step 1: Write failing loop and reduced-motion tests**

Add tests that call `play({ maskUrl, bounds, durationMs: 100, loop: true })`, advance animation time past two durations, and assert the canvas remains connected and another animation frame is scheduled. Add a reduced-motion loop test asserting the static canvas remains until `cancel()` and the playback promise then resolves.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --run tests/ui/ObjectReconstructionOverlay.test.ts`

Expected: FAIL because loop playback currently finishes when progress reaches `1` and reduced-motion playback finishes after `360ms`.

- [ ] **Step 3: Implement loop playback**

Extend the public contract:

```ts
export interface ReconstructionPlayback {
  maskUrl: string;
  bounds: ObjectBounds;
  durationMs?: number;
  reducedMotion?: boolean;
  loop?: boolean;
}
```

For reduced motion, draw the static outline and leave it active when `loop === true`; finite playback retains its timer. For animated loop playback, calculate `progress` with `(elapsed % durationMs) / durationMs` and continue scheduling frames. Keep the existing finite `Math.min(1, elapsed / durationMs)` behavior when loop is false.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- --run tests/ui/ObjectReconstructionOverlay.test.ts`

Expected: all overlay tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/ObjectReconstructionOverlay.ts tests/ui/ObjectReconstructionOverlay.test.ts
git commit -m "feat: loop object reconstruction playback"
```

---

### Task 2: Cached Reconstruction on the Generation Screen

**Files:**
- Modify: `src/ui/ARHud.ts`
- Modify: `src/styles.css`
- Test: `tests/ui/ARHud.test.ts`
- Test: `tests/ui/styles.test.ts`

**Interfaces:**
- Consumes: `ReconstructionPlayback.loop`, existing mask URL and `ObjectBounds` passed to `playObjectReconstruction`.
- Produces: cached latest reconstruction payload; dedicated loading host/image/renderer; `discardObjectReconstruction(): void` for complete resets.

- [ ] **Step 1: Write failing HUD loading animation tests**

Extend the renderer test mock so each instance records `play`, `cancel`, and `dispose`. Assert that:

```ts
await hud.playObjectReconstruction(maskUrl, bounds);
hud.showFullFlowLoading('Building...');
```

starts a second renderer with `{ maskUrl, bounds, loop: true }`, exposes `.full-flow-reconstruction-stage`, and hides `.loading-ring`. Add tests that no cached payload leaves the spinner visible, `showFullFlowReady`/`showFullFlowError` cancel loading playback, and `discardObjectReconstruction` prevents stale reuse.

- [ ] **Step 2: Run HUD tests and verify RED**

Run: `npm test -- --run tests/ui/ARHud.test.ts`

Expected: FAIL because the loading screen has only a spinner and `showFullFlowLoading` cancels the capture overlay without reusing its payload.

- [ ] **Step 3: Add the dedicated loading stage and reconstruction cache**

Create the loading markup:

```html
<div class="full-flow-reconstruction-stage hidden" aria-hidden="true">
  <img class="full-flow-reconstruction-preview" alt="">
</div>
<div class="loading-ring" aria-hidden="true"></div>
<p>Building your 3D object in Modal...</p>
```

Instantiate a second `ObjectReconstructionOverlay` with the loading stage and preview. Cache `{ maskUrl, bounds }` before starting capture playback. `showFullFlowLoading` cancels only the visible capture canvas, starts cached payload with `loop: true`, and falls back to the spinner on a rejected playback. `discardObjectReconstruction` cancels both renderers and clears the cache. Success, failure, and disposal cancel the loading renderer.

- [ ] **Step 4: Style the generation reconstruction stage**

Make the stage responsive with a centered `min(72vw, 560px)` square/portrait area, keep the renderer canvas absolute within it, and visually hide the ring while reconstruction is active. Preserve the current status copy below the stage.

- [ ] **Step 5: Run HUD and style tests and verify GREEN**

Run: `npm test -- --run tests/ui/ARHud.test.ts tests/ui/styles.test.ts`

Expected: both files pass.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/ARHud.ts src/styles.css tests/ui/ARHud.test.ts tests/ui/styles.test.ts
git commit -m "feat: animate detected object during generation"
```

---

### Task 3: Preserve Pending Segmentation Through Generation Transition

**Files:**
- Modify: `src/app/WebARApp.ts`
- Test: `tests/app/WebARAppSegmentation.test.ts`

**Interfaces:**
- Consumes: `ARHud.playObjectReconstruction`, `ARHud.showFullFlowLoading`, and `ARHud.discardObjectReconstruction`.
- Produces: intentional generation transition that does not cancel the current segmentation request; late successful segmentation updates the active loading HUD.

- [ ] **Step 1: Write failing orchestration tests**

Add a deferred segmentation test that captures, starts `runFullFlow`, resolves segmentation, and verifies:

```ts
expect(controller.signal.aborted).toBe(false);
expect(app.hud.playObjectReconstruction).toHaveBeenCalledWith(maskUrl, bounds);
expect(dependencies.segmentObject).toHaveBeenCalledOnce();
```

Also assert a new capture and route reset abort pending segmentation and call `discardObjectReconstruction`, while a failed/undetected segmentation leaves generation active with the spinner.

- [ ] **Step 2: Run orchestration tests and verify RED**

Run: `npm test -- --run tests/app/WebARAppSegmentation.test.ts`

Expected: FAIL because `runFullFlow`, `clearCapturedImagePreview`, and the route transition currently cancel segmentation and invalidate captured-image identity.

- [ ] **Step 3: Separate generation transition cleanup from full reset**

Preserve the captured image object used by the in-flight segmentation token even after model generation takes its own immutable image data copy. Add a narrow transition cleanup path that revokes the preview URL and cancels the visible capture canvas without aborting segmentation or discarding cached reconstruction. Keep existing cancellation for new capture, upload replacement, extraction, explicit route exit, reset, and disposal.

When late segmentation succeeds, `playObjectReconstruction` updates the HUD cache; if the loading route is active, ARHud begins loop playback immediately. Errors remain non-fatal and retain the spinner.

- [ ] **Step 4: Run orchestration tests and verify GREEN**

Run: `npm test -- --run tests/app/WebARAppSegmentation.test.ts`

Expected: all segmentation orchestration tests pass with exactly one backend request.

- [ ] **Step 5: Commit**

```powershell
git add src/app/WebARApp.ts tests/app/WebARAppSegmentation.test.ts
git commit -m "fix: preserve segmentation during photo generation"
```

---

### Task 4: Full-Viewport Photo-to-AR Capture and Captured Image

**Files:**
- Modify: `src/ui/ARHud.ts`
- Modify: `src/styles.css`
- Test: `tests/ui/ARHud.test.ts`
- Test: `tests/ui/styles.test.ts`

**Interfaces:**
- Consumes: existing `data-route="full-flow"`, `.creation-workspace.fullscreen`, `.creation-stage`, `.camera-media-layer`, and `.creation-guidance` DOM structure.
- Produces: route-scoped `.photo-to-ar-immersive` state on the camera workspace for live and captured media.

- [ ] **Step 1: Write failing DOM and style tests**

Assert the full-flow camera panel receives `photo-to-ar-immersive` while upload routes do not. Add exact CSS expectations for fixed full-viewport media, `object-fit: cover`, a top overlay, a safe-area-aware translucent bottom guidance sheet, and unchanged upload selectors.

- [ ] **Step 2: Run HUD/style tests and verify RED**

Run: `npm test -- --run tests/ui/ARHud.test.ts tests/ui/styles.test.ts`

Expected: FAIL because the current mobile layout uses `grid-template-rows: minmax(260px, 1fr) auto`, padding, gaps, borders, and a small card-shaped media stage.

- [ ] **Step 3: Apply route-scoped immersive state**

Toggle `photo-to-ar-immersive` only while `activeRoute` is `full-flow`. Remove it during route preparation and disposal. Do not infer from `.fullscreen`, which is shared with upload routes.

- [ ] **Step 4: Implement edge-to-edge layout**

For `.creation-workspace.fullscreen.photo-to-ar-immersive`:

- use `position: fixed; inset: 0; padding: 0; display: block; overflow: hidden`;
- make `.creation-stage`, `.camera-media-layer`, video, and captured image fill the viewport with no border/radius;
- use `object-fit: cover` for both video and image;
- position camera label/progress at `max(12px, env(safe-area-inset-top))`;
- position `.creation-guidance` as a bottom overlay with a readable translucent/blurred surface and `padding-bottom: max(16px, env(safe-area-inset-bottom))`;
- keep buttons at least `var(--control-height)` and allow the guidance sheet to scroll within a bounded height.

- [ ] **Step 5: Run HUD/style tests and verify GREEN**

Run: `npm test -- --run tests/ui/ARHud.test.ts tests/ui/styles.test.ts`

Expected: both files pass and upload route assertions remain unchanged.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/ARHud.ts src/styles.css tests/ui/ARHud.test.ts tests/ui/styles.test.ts
git commit -m "style: make photo capture edge to edge"
```

---

### Task 5: Integration Verification and Production Release

**Files:**
- Verify: all modified source and tests
- Update only if implementation details changed: `docs/superpowers/specs/2026-07-18-photo-to-ar-immersive-reconstruction-design.md`

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: reviewed, merged, deployed, and live-verified production behavior.

- [ ] **Step 1: Run focused integration tests**

Run:

```powershell
npm test -- --run tests/ui/ObjectReconstructionOverlay.test.ts tests/ui/ARHud.test.ts tests/ui/styles.test.ts tests/app/WebARAppSegmentation.test.ts
```

Expected: all focused tests pass with zero failures.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm test -- --run
npm run build
git diff --check
```

Expected: 397 or more tests pass, Vite production build exits `0`, and `git diff --check` is clean.

- [ ] **Step 3: Request code review and address findings**

Review the complete diff against the design spec. Fix every critical or important finding with a failing test first, then repeat focused and full verification.

- [ ] **Step 4: Merge and publish**

Fast-forward `main` from the primary checkout, preserving the user's existing uncommitted Worker files, then push `main`. Wait for the GitHub Pages workflow to complete successfully.

- [ ] **Step 5: Verify production on a phone-sized authenticated browser**

Confirm live camera and captured media occupy the full viewport; segmentation displays only the detected-object reconstruction; **Generate and place** shows the looping object rather than only the spinner or model picker; and no console errors occur. Keep the production result tab available to the user.
