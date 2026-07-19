# Long-Press Object Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every placed AR model require a continuous 450 ms long press before the same held finger can drag it, with brief gold selection feedback.

**Architecture:** `GestureController` recognizes and cancels long presses without knowing about Three.js. Scene managers expose non-mutating hit tests, `WebARApp` records the touched candidate and authorizes movement only after activation, and a focused `SelectionFeedbackController` owns temporary Three.js feedback resources without changing model transforms.

**Tech Stack:** TypeScript 6, Three.js 0.185, WebXR, Vitest 4 with jsdom, Vite 8.

## Global Constraints

- Apply the gesture to standard single-object AR and Multi Object mode.
- Activate after 450 ms with a 12 px pre-activation movement tolerance.
- Keep the finger down and drag immediately after activation.
- Do not change model transforms, exports, shadows, or raycasting through selection feedback.
- Use a 250 ms gold pulse; use a static gold highlight when reduced motion is preferred.
- Preserve placement taps, pinch, rotate, reset, delete, floor locking, motion smoothing, and WebXR re-anchoring semantics.
- Do not add desktop pointer long-press, transform gizmos, haptics, or persistent selection.

---

### Task 1: Long-Press Gesture Recognition

**Files:**
- Modify: `src/interaction/GestureController.ts`
- Test: `tests/interaction/GestureController.test.ts`

**Interfaces:**
- Consumes: existing `Point2`, touch events, and gesture callbacks.
- Produces: optional handler `onLongPress?(point: Point2): void`; constructor options `{ longPressDurationMs?: number; longPressMoveTolerancePx?: number }` with production defaults 450 and 12.

- [ ] **Step 1: Write failing fake-timer tests**

Add tests that construct the controller with a 450 ms duration, dispatch one touch, advance fake timers, and assert `onLongPress({ x: 20, y: 30 })` fires exactly once. Add separate tests proving movement of 12 px, `touchend`, `touchcancel`, a second touch, and `disconnect()` cancel activation; verify a successful long press suppresses `onTap` while later `touchmove` still calls `onDrag`.

```ts
vi.useFakeTimers();
const longPresses = vi.fn();
const drags = vi.fn();
const taps = vi.fn();
const controller = new GestureController(target, {
  onLongPress: longPresses,
  onTap: taps,
  onDrag: drags,
  onPinch: () => undefined,
}, { longPressDurationMs: 450, longPressMoveTolerancePx: 12 });
controller.connect();
target.dispatchEvent(touchEvent('touchstart', [{ clientX: 20, clientY: 30 }]));
vi.advanceTimersByTime(450);
expect(longPresses).toHaveBeenCalledWith({ x: 20, y: 30 });
target.dispatchEvent(touchEvent('touchmove', [{ clientX: 24, clientY: 34 }]));
expect(drags).toHaveBeenCalled();
target.dispatchEvent(touchEvent('touchend', []));
expect(taps).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/interaction/GestureController.test.ts`

Expected: FAIL because `onLongPress` and the constructor options are not defined and no timer fires.

- [ ] **Step 3: Implement the minimal long-press state**

Add timer, activation, and cancellation fields. Start the timer only for exactly one touch. Before activation, cancel it when distance from the original point is greater than or equal to 12 px. Cancel on multi-touch, end, cancel, reset, and disconnect. Record activation so `onTouchEnd` does not emit a tap after a successful hold.

```ts
interface GestureHandlers {
  onGestureStart?(point: Point2): void;
  onLongPress?(point: Point2): void;
  onTap(point: Point2): void;
  onDrag(point: Point2, startPoint: Point2): void;
  onPinch(multiplier: number): void;
  onGestureEnd?(): void;
}

interface GestureOptions {
  longPressDurationMs?: number;
  longPressMoveTolerancePx?: number;
}

private longPressTimer: ReturnType<typeof setTimeout> | null = null;
private longPressActivated = false;

private startLongPress(point: Point2): void {
  this.cancelLongPress();
  this.longPressTimer = setTimeout(() => {
    this.longPressTimer = null;
    this.longPressActivated = true;
    this.handlers.onLongPress?.(point);
  }, this.longPressDurationMs);
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- tests/interaction/GestureController.test.ts`

Expected: all gesture tests PASS with fake timers restored after each test.

- [ ] **Step 5: Commit the gesture recognizer**

```powershell
git add src/interaction/GestureController.ts tests/interaction/GestureController.test.ts
git commit -m "feat: recognize long-press gestures"
```

### Task 2: Non-Mutating Object Hit Testing

**Files:**
- Modify: `src/scene/LayoutSceneManager.ts`
- Test: `tests/scene/LayoutSceneManager.test.ts`

**Interfaces:**
- Consumes: screen point, renderer canvas, Three.js camera, placed object groups.
- Produces: `hitTestObjectAtScreenPoint(point, canvas, camera): LayoutObject | null`, `groupForObject(objectId: string): THREE.Group | null`; keeps `selectObjectAtScreenPoint` as a compatibility wrapper that selects the hit result.

- [ ] **Step 1: Write a failing non-mutating hit-test test**

Create two placed pickable models, leave the second selected, hit-test the first at canvas center, and assert the returned ID is the first while `selectedObjectId` remains the second.

```ts
const hit = manager.hitTestObjectAtScreenPoint(
  { x: 50, y: 50 },
  createCanvas(),
  createCamera(),
);
expect(hit?.id).toBe(first.id);
expect(manager.selectedObjectId).toBe(second.id);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/scene/LayoutSceneManager.test.ts`

Expected: FAIL because `hitTestObjectAtScreenPoint` does not exist.

- [ ] **Step 3: Extract hit testing from selection**

Move the current raycast body into `hitTestObjectAtScreenPoint` and return the closest placed object without mutating state. Make the existing selector call the hit-test method and then `selectObject(hit.id)`.

```ts
selectObjectAtScreenPoint(point: Point2, canvas: HTMLCanvasElement, camera: THREE.Camera): LayoutObject | null {
  const hit = this.hitTestObjectAtScreenPoint(point, canvas, camera);
  if (!hit) return null;
  this.selectObject(hit.id);
  return hit;
}

groupForObject(objectId: string): THREE.Group | null {
  return this.objects.get(objectId)?.group ?? null;
}
```

- [ ] **Step 4: Run scene-manager tests and verify GREEN**

Run: `npm test -- tests/scene/LayoutSceneManager.test.ts`

Expected: all layout scene manager tests PASS, including the existing selecting wrapper test.

- [ ] **Step 5: Commit non-mutating picking**

```powershell
git add src/scene/LayoutSceneManager.ts tests/scene/LayoutSceneManager.test.ts
git commit -m "refactor: separate layout hit testing from selection"
```

### Task 3: Three.js Selection Feedback

**Files:**
- Create: `src/interaction/SelectionFeedbackController.ts`
- Create: `tests/interaction/SelectionFeedbackController.test.ts`
- Modify: `src/app/arRuntime.ts`

**Interfaces:**
- Consumes: selected `THREE.Group`, `THREE.Box3` bounds, reduced-motion boolean, render-loop delta.
- Produces: `show(target: THREE.Group, reducedMotion: boolean): void`, `update(deltaSeconds: number): void`, and `clear(): void`.

- [ ] **Step 1: Write failing feedback lifecycle tests**

Assert `show` attaches one child named `selection-feedback`, gives its mesh `userData.ignoreRaycast = true`, leaves the target position/rotation/scale unchanged, replaces feedback on a new target, animates/removes after 0.25 seconds, and creates a non-scaling static highlight in reduced-motion mode.

```ts
const originalScale = target.scale.clone();
controller.show(target, false);
const feedback = target.getObjectByName('selection-feedback');
expect(feedback).toBeTruthy();
feedback?.traverse((object) => expect(object.userData.ignoreRaycast).toBe(true));
expect(target.scale.toArray()).toEqual(originalScale.toArray());
controller.update(0.25);
expect(target.getObjectByName('selection-feedback')).toBeUndefined();
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `npm test -- tests/interaction/SelectionFeedbackController.test.ts`

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Implement bounded gold feedback**

Create a disposable gold `Box3Helper` or wireframe helper around model bounds, convert its world transform into target-local coordinates, mark every feedback descendant ignored by raycasting, and animate only the helper scale. Track elapsed time and dispose helper geometry/material in `clear` and at 0.25 seconds. For reduced motion, keep scale constant while retaining the same brief highlight duration.

```ts
const SELECTION_DURATION_SECONDS = 0.25;
const SELECTION_COLOR = 0xf4b942;

export class SelectionFeedbackController {
  show(target: THREE.Group, reducedMotion: boolean): void;
  update(deltaSeconds: number): void;
  clear(): void;
}
```

- [ ] **Step 4: Export through the lazy AR runtime and verify GREEN**

Add `SelectionFeedbackController` to `arRuntime`, then run:

`npm test -- tests/interaction/SelectionFeedbackController.test.ts`

Expected: all feedback tests PASS with no changed model transforms.

- [ ] **Step 5: Commit selection feedback**

```powershell
git add src/interaction/SelectionFeedbackController.ts tests/interaction/SelectionFeedbackController.test.ts src/app/arRuntime.ts
git commit -m "feat: add AR object selection feedback"
```

### Task 4: Gate Single- and Multi-Object Movement Behind Long Press

**Files:**
- Modify: `src/app/WebARApp.ts`
- Modify: `tests/app/WebARApp.test.ts`

**Interfaces:**
- Consumes: `GestureController.onLongPress`, layout non-mutating hit test, single-model raycast, feedback controller, existing motion and anchor controllers.
- Produces: gesture candidate state and long-press-authorized drag flow for both AR modes.

- [ ] **Step 1: Write failing integration unit tests**

Use a typed private-app harness to assert: gesture start records a candidate without selecting it; `handleDrag` before activation does not call `setDragTarget`; long-press activation selects the layout candidate or authorizes the single model; drag after activation calls `setDragTarget`; finishing a selection-only gesture does not queue re-anchoring; finishing an actual drag does; and selection calls feedback with the reduced-motion preference.

```ts
app.gestureCandidate = { target, layoutObjectId: 'chair-1' };
app.handleDrag({ x: 60, y: 60 }, { x: 50, y: 50 });
expect(setDragTarget).not.toHaveBeenCalled();

app.handleLongPress({ x: 50, y: 50 });
app.handleDrag({ x: 60, y: 60 }, { x: 50, y: 50 });
expect(setDragTarget).toHaveBeenCalledWith(target, floorPoint);
```

- [ ] **Step 2: Run WebARApp tests and verify RED**

Run: `npm test -- tests/app/WebARApp.test.ts`

Expected: FAIL because candidate, long-press, and feedback state are not present and dragging remains immediately authorized.

- [ ] **Step 3: Wire candidate capture and activation**

Instantiate the feedback controller with the other AR controllers. Change `onGestureStart` to call `recordGestureCandidate(point)`, add `onLongPress: point => handleLongPress(point)`, and keep `onGestureEnd` cleanup. For layout mode use `hitTestObjectAtScreenPoint`; for standard mode raycast the visible `sceneContext.modelRoot`, ignoring `ignoreRaycast` descendants.

```ts
private gestureCandidate: { target: Three.Group; layoutObjectId: string | null } | null = null;
private longPressDragTarget: Three.Group | null = null;
private activeDragTarget: Three.Group | null = null;
private gestureMovedTarget = false;
```

When layout hit testing returns a `LayoutObject`, resolve its group with `groupForObject(hit.id)` and store the group and ID as the candidate without mutating selection. On activation, validate that the candidate is still visible and attached, call `selectObject(candidate.layoutObjectId)` in layout mode, set app mode to editing, update the HUD, call `selectionFeedback.show`, and set `longPressDragTarget`.

- [ ] **Step 4: Require authorization in drag handlers**

Return immediately from placed/editing dragging unless `longPressDragTarget` exists. Project the held touch to that target's floor plane; only on the first valid movement delete its current anchor, set `activeDragTarget`, and mark `gestureMovedTarget = true`. Preserve the existing `SpatialMotionController.setDragTarget` flow.

On gesture end, call `finishDrag` and queue re-anchoring only when `gestureMovedTarget` and `activeDragTarget` are both set. Clear candidate and authorization state on every end/cancel and during AR teardown.

- [ ] **Step 5: Update render and cleanup lifecycle**

Call `selectionFeedback.update(delta)` beside `motionController.update(delta)`. Call `selectionFeedback.clear()` and clear gesture state during transient reset and full scene/session teardown so no helper or timer survives navigation.

- [ ] **Step 6: Run focused interaction and app tests and verify GREEN**

Run: `npm test -- tests/interaction/GestureController.test.ts tests/interaction/SelectionFeedbackController.test.ts tests/scene/LayoutSceneManager.test.ts tests/app/WebARApp.test.ts`

Expected: all focused tests PASS; pre-hold drag tests show zero motion calls, post-hold tests show motion and re-anchoring only after actual movement.

- [ ] **Step 7: Commit AR integration**

```powershell
git add src/app/WebARApp.ts tests/app/WebARApp.test.ts
git commit -m "feat: move placed models after long press"
```

### Task 5: Full Verification

**Files:**
- Verify only; modify the smallest relevant source/test file if a regression is found, following a new RED/GREEN cycle.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: a tested production build with no TypeScript or Vitest regressions.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all test files and tests PASS with no unhandled errors.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript checking and Vite production build both complete successfully.

- [ ] **Step 3: Inspect the final scoped diff**

Run: `git status --short` and `git diff HEAD~4 --check`

Expected: no whitespace errors; only the planned interaction, scene, runtime, app, test, and documentation files are part of the feature commits. Existing unrelated workspace changes remain untouched.
