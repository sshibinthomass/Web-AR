# Compact Light AR HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the mobile model rail from overlapping Animation, shrink the model cards and bottom action buttons, and give the complete placed-object HUD one light translucent color treatment.

**Architecture:** `ARHud.updateAnimationOptions()` will expose animation-control visibility as a class on the model rail, allowing CSS to raise the rail only when the extra control row exists. Existing HTML structure and behavior stay intact; compact dimensions and the shared light surface remain CSS-owned and are pinned by HUD and stylesheet regression tests.

**Tech Stack:** TypeScript, DOM APIs, CSS, Vitest, jsdom, Vite, in-app browser verification.

## Global Constraints

- Preserve all existing model selection, animation selection, rotation, placement, scale-reset, and reset behavior.
- Keep the model rail horizontally scrollable.
- Use the extra rail height only when multiple animation clips make Animation visible.
- Use one translucent white surface with dark teal text for cards, Animation, Rotate, Place, 1x, and Reset.
- Reserve turquoise for selected-state emphasis and the rotation-slider accent.
- Preserve existing accessible names and usable touch targets.
- Do not stage or overwrite unrelated changes already present in `src/ui/ARHud.ts`, `tests/ui/ARHud.test.ts`, `tests/worker/generateModelWorker.test.ts`, or `worker/src/index.ts`.

---

## File Map

- Modify `src/ui/ARHud.ts`: toggle a model-rail class when the Animation row is visible.
- Modify `src/styles.css`: dynamic rail offset, compact rail/card/button dimensions, and shared light control surfaces.
- Modify `tests/ui/ARHud.test.ts`: verify the rail state follows animation-option visibility.
- Modify `tests/ui/styles.test.ts`: verify dynamic spacing, compact dimensions, and light surfaces.

### Task 1: Make model-rail spacing follow Animation visibility

**Files:**
- Modify: `tests/ui/ARHud.test.ts:414-443`
- Modify: `src/ui/ARHud.ts:831-848`

**Interfaces:**
- Consumes: `ARHud.updateAnimationOptions(options: AnimationOption[], selectedIndex: number): void`
- Produces: `.model-rail.has-animation-control`, present only while `options.length > 1`

- [ ] **Step 1: Extend the existing animation-selector test with a failing rail-state assertion**

Add these assertions to `shows an animation selector for models with multiple clips`:

```ts
const modelRail = root.querySelector('.model-rail');
expect(modelRail?.classList.contains('has-animation-control')).toBe(false);

hud.updateAnimationOptions([{ index: 0, label: 'Idle' }], 0);
expect(modelRail?.classList.contains('has-animation-control')).toBe(false);

hud.updateAnimationOptions([
  { index: 0, label: 'Idle' },
  { index: 1, label: 'Walk' },
], 0);
expect(modelRail?.classList.contains('has-animation-control')).toBe(true);

hud.updateAnimationOptions([{ index: 0, label: 'Idle' }], 0);
expect(modelRail?.classList.contains('has-animation-control')).toBe(false);
```

- [ ] **Step 2: Run the focused test and verify the new assertion fails**

Run:

```powershell
npm.cmd test -- tests/ui/ARHud.test.ts
```

Expected: FAIL because `.model-rail` never receives `has-animation-control`.

- [ ] **Step 3: Toggle the rail class beside the Animation control state**

Update `ARHud.updateAnimationOptions()`:

```ts
const hasMultipleAnimations = options.length > 1;
this.animationControl.classList.toggle('hidden', !hasMultipleAnimations);
this.modelRail.classList.toggle('has-animation-control', hasMultipleAnimations);
this.animationSelect.disabled = !hasMultipleAnimations;
```

- [ ] **Step 4: Run the focused HUD test and verify it passes**

Run:

```powershell
npm.cmd test -- tests/ui/ARHud.test.ts
```

Expected: the HUD test file passes with the rail class added and removed correctly.

- [ ] **Step 5: Commit only Task 1 hunks**

Because both files may contain pre-existing local changes, stage only the new assertions and the one class toggle:

```powershell
git add -p -- tests/ui/ARHud.test.ts src/ui/ARHud.ts
git diff --cached --check
git commit -m "fix: keep animated HUD clear of model rail"
```

### Task 2: Compact and unify the placed-object HUD

**Files:**
- Modify: `tests/ui/styles.test.ts:13-30`
- Modify: `src/styles.css:397-619`
- Modify: `src/styles.css:2346-2391`
- Modify: `src/styles.css:2748-2757`

**Interfaces:**
- Consumes: `.model-rail.has-animation-control` from Task 1
- Produces: compact model rail, compact `.hud-action-chip`, light `.rotate-control`, light `.animation-control`, and light placed-object action buttons

- [ ] **Step 1: Add failing stylesheet assertions for spacing, size, and color**

Extend `tests/ui/styles.test.ts` with:

```ts
it('raises the compact model rail when Animation is visible', () => {
  const animatedRailRule = cssRule('.model-rail.has-animation-control');
  const itemRule = cssRule('.model-rail-item');
  const thumbRule = cssRule('.model-rail-thumb');
  const labelRule = cssRule('.model-rail-label');

  expect(animatedRailRule).toContain(
    'bottom: calc(max(18px, env(safe-area-inset-bottom)) + 160px);',
  );
  expect(itemRule).toContain('flex: 0 0 76px;');
  expect(itemRule).toContain('grid-template-rows: 48px 2.5em;');
  expect(itemRule).toContain('min-height: 88px;');
  expect(thumbRule).toContain('height: 48px;');
  expect(labelRule).toContain('font-size: 10px;');
});

it('uses one compact light surface for placed-object controls', () => {
  const chipRule = cssRule('.hud-actions button.hud-action-chip');
  const controlRule = cssRule('.rotate-control,\n.animation-control');
  const selectRule = cssRule('.animation-control select');

  expect(chipRule).toContain('min-height: 38px;');
  expect(chipRule).toContain('padding: 0 10px;');
  expect(chipRule).toContain('font-size: 12px;');
  expect(controlRule).toContain('min-height: 38px;');
  expect(controlRule).toContain('color: #102326;');
  expect(controlRule).toContain('background: rgba(255, 255, 255, 0.86);');
  expect(selectRule).toContain('color: #102326;');
  expect(selectRule).toContain('background: rgba(255, 255, 255, 0.88);');
});
```

Update the existing compact-control expectations from `44px`/`12px` padding to `38px`/`10px` padding.

- [ ] **Step 2: Run the stylesheet tests and verify the new assertions fail**

Run:

```powershell
npm.cmd test -- tests/ui/styles.test.ts
```

Expected: FAIL on the missing animated-rail rule and the old card/button/control dimensions and dark surfaces.

- [ ] **Step 3: Add the dynamic rail offset**

Add immediately after `.model-rail`:

```css
.model-rail.has-animation-control {
  bottom: calc(max(18px, env(safe-area-inset-bottom)) + 160px);
}
```

Keep the existing `118px` offset for models without the Animation row.

- [ ] **Step 4: Apply the compact dimensions**

Use these values in `src/styles.css`:

```css
.hud-actions button.hud-action-chip {
  flex: 0 0 auto;
  min-width: 40px;
  min-height: 38px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 850;
  touch-action: manipulation;
}

.model-rail-item {
  flex: 0 0 76px;
  grid-template-rows: 48px 2.5em;
  gap: 5px;
  min-width: 76px;
  min-height: 88px;
  padding: 6px;
  font-size: 10px;
}

.model-rail-thumb {
  height: 48px;
  font-size: 11px;
}

.model-rail-label {
  font-size: 10px;
}
```

In the `max-width: 420px` media query, set the rail item basis and minimum width to `76px` so the mobile override does not restore the old `82px` size.

- [ ] **Step 5: Apply the shared light control surface**

Replace the dark Animation/Rotate control colors with:

```css
.rotate-control,
.animation-control {
  min-height: 38px;
  border: 1px solid rgba(15, 118, 110, 0.2);
  padding: 6px 9px;
  color: #102326;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 12px 32px rgba(15, 118, 110, 0.12);
  backdrop-filter: blur(14px);
}

.animation-control select {
  min-height: 28px;
  border: 1px solid rgba(15, 118, 110, 0.18);
  color: #102326;
  background: rgba(255, 255, 255, 0.88);
}
```

Change both `.hud-actions button.primary` declarations to the same light background and dark text used by the other HUD buttons. Leave `#ARButton` and `.ar-model-place-button` in their existing primary treatment by splitting the combined selectors where necessary.

- [ ] **Step 6: Run focused HUD/style tests and verify they pass**

Run:

```powershell
npm.cmd test -- tests/ui/styles.test.ts tests/ui/ARHud.test.ts
```

Expected: all focused HUD and stylesheet tests pass.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- src/styles.css tests/ui/styles.test.ts
git diff --cached --check
git commit -m "style: compact and unify AR HUD controls"
```

### Task 3: Full regression and mobile acceptance verification

**Files:**
- Verify only; no production files should change.

**Interfaces:**
- Consumes: the Task 1 HUD state and Task 2 CSS rules
- Produces: evidence that the complete repo and mobile acceptance surface remain healthy

- [ ] **Step 1: Run the full automated suite**

Run:

```powershell
npm.cmd test
```

Expected: all test files and tests pass with zero failures.

- [ ] **Step 2: Run both production builds**

Run:

```powershell
npm.cmd run build
$env:GITHUB_PAGES='true'; npm.cmd run build -- --outDir dist-pages
```

Expected: TypeScript and Vite builds exit with code `0`.

- [ ] **Step 3: Verify the phone layout in a real browser**

Use a viewport near `390x844`, open the placed-object HUD with a multi-animation model, and verify:

```text
Model rail clears Animation with visible space.
Model rail remains horizontally scrollable.
Cards are approximately 76px wide with 48px thumbnails and smaller labels.
Animation, Rotate, Place, 1x, and Reset share the light translucent surface.
The slider and selected model retain turquoise accents.
Place, rotate, scale reset, reset, and animation selection remain operable.
```

- [ ] **Step 4: Remove generated verification output and inspect scope**

Resolve `dist-pages` inside the workspace before deleting it, then run:

```powershell
git status --short
git diff --check
git log -3 --oneline
```

Expected: only pre-existing unrelated working-tree changes remain; the feature commits contain only intended HUD/test/spec/plan changes.
