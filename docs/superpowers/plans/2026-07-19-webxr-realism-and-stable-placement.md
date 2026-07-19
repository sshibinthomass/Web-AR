# WebXR Realism and Stable Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the immersive floor grid and make WebXR placement, dragging, anchoring, lighting, and contact with the floor feel stable and grounded on Android Chrome.

**Architecture:** Keep `WebARApp` as the orchestrator, but move deterministic pose filtering, motion easing, anchor lifecycle, and estimated-light lifecycle into focused classes. The render loop passes one delta value through those classes, while every optional WebXR capability has a no-error fallback.

**Tech Stack:** TypeScript 6, Three.js 0.185, WebXR Hit Test/Anchors/Lighting Estimation APIs, Vitest 4 with jsdom, Vite 8.

## Global Constraints

- Remove every immersive square-grid visualization; do not change the turquoise ring's geometry, color, opacity, or size.
- Keep Android Chrome and Samsung Galaxy S25 Ultra as the physical-device target.
- Do not require anchors, plane detection, or light estimation; unsupported features must retain working placement.
- Preserve single-object and multi-object placement, selection, reset, rotation, scale, animation, and floor locking.
- Honor `prefers-reduced-motion` by completing settle animations immediately.
- Do not modify the existing unrelated worker changes in `worker/src/index.ts` or `tests/worker/generateModelWorker.test.ts`.

## File Structure

- `src/scene/createScene.ts`: renderer, camera, fixed fallback lights, unchanged reticle, and single-object shadow receiver.
- `src/scene/createContactShadow.ts`: reusable contact-shadow factory for single and layout objects.
- `src/xr/PoseStabilizer.ts`: deterministic frame-rate-independent pose filtering and readiness.
- `src/xr/HitTestManager.ts`: WebXR hit-source lifecycle and conversion of raw hits into stabilized poses.
- `src/interaction/SpatialMotionController.ts`: placement settle and damped drag targets for arbitrary object groups.
- `src/xr/AnchorManager.ts`: one optional anchor per object group, pose following, replacement, and cleanup.
- `src/xr/EstimatedLightingController.ts`: Three.js estimated-light events and fixed-light fallback.
- `src/scene/LayoutSceneManager.ts`: layout-object shadow ownership and stable group access.
- `src/app/arRuntime.ts`: exports the new runtime classes and removes plane-grid tracking.
- `src/app/WebARApp.ts`: wires stability, motion, anchors, lighting, and cleanup into existing flows.

---

### Task 1: Remove the Grid and Add Reusable Contact Shadows

**Files:**
- Create: `src/scene/createContactShadow.ts`
- Create: `tests/scene/createContactShadow.test.ts`
- Modify: `src/scene/createScene.ts`
- Modify: `src/scene/LayoutSceneManager.ts`
- Modify: `tests/scene/LayoutSceneManager.test.ts`
- Delete: `src/xr/PlaneTrackingManager.ts`
- Modify: `src/app/arRuntime.ts`

**Interfaces:**
- Produces: `createContactShadow(): THREE.Mesh<THREE.CircleGeometry, THREE.ShadowMaterial>`.
- Produces: `SceneContext.contactShadow` and `LayoutSceneManager.selectedGroup()` with a shadow child named `contact-shadow`.
- Removes: `SceneContext.floorGrid` and `ARRuntime.PlaneTrackingManager`.

- [ ] **Step 1: Write failing shadow and layout tests**

```ts
// tests/scene/createContactShadow.test.ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createContactShadow } from '../../src/scene/createContactShadow';

describe('createContactShadow', () => {
  it('creates a hidden non-interactive transparent shadow receiver', () => {
    const shadow = createContactShadow();
    expect(shadow.name).toBe('contact-shadow');
    expect(shadow.visible).toBe(false);
    expect(shadow.receiveShadow).toBe(true);
    expect(shadow.material).toBeInstanceOf(THREE.ShadowMaterial);
    expect(shadow.material.opacity).toBeCloseTo(0.22);
    expect(shadow.userData.ignoreRaycast).toBe(true);
  });
});
```

Add to `tests/scene/LayoutSceneManager.test.ts`:

```ts
it('adds a hidden contact shadow to every layout object and reveals it on placement', () => {
  const root = new THREE.Group();
  const manager = new LayoutSceneManager(root);
  manager.addObject({ modelId: 'chair', modelLabel: 'Chair', modelUrl: '/chair.glb', model: createModel() });
  const shadow = manager.selectedGroup()?.getObjectByName('contact-shadow');
  expect(shadow?.visible).toBe(false);
  manager.placePendingAt(new THREE.Matrix4().makeTranslation(1, 0, -1));
  expect(shadow?.visible).toBe(true);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/scene/createContactShadow.test.ts tests/scene/LayoutSceneManager.test.ts`

Expected: FAIL because `createContactShadow.ts` is missing and layout objects do not contain the shadow.

- [ ] **Step 3: Implement the shadow factory and remove grid construction**

```ts
// src/scene/createContactShadow.ts
import * as THREE from 'three';

export function createContactShadow(): THREE.Mesh<THREE.CircleGeometry, THREE.ShadowMaterial> {
  const geometry = new THREE.CircleGeometry(0.34, 48).rotateX(-Math.PI / 2);
  const material = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22, transparent: true });
  material.depthWrite = false;
  const shadow = new THREE.Mesh(geometry, material);
  shadow.name = 'contact-shadow';
  shadow.position.y = 0.002;
  shadow.receiveShadow = true;
  shadow.visible = false;
  shadow.userData.ignoreRaycast = true;
  return shadow;
}
```

In `createScene.ts`, delete the `GridHelper` block and `floorGrid` field, enable `renderer.shadowMap`, set the directional light to cast a restrained shadow, create `contactShadow`, add it to `modelRoot`, and return it. Do not edit the existing `RingGeometry` or reticle material values. In `LayoutSceneManager.addObject()`, create and add a contact shadow before the model; reveal it in `placePendingAt`, `placeSelectedAt`, and imported placed objects. Exclude `userData.ignoreRaycast` descendants when selecting an object.

Delete `PlaneTrackingManager.ts`, its runtime export, its `WebARApp` field, construction, per-frame update, `hide()` calls, and session-end `floorGrid` access.

- [ ] **Step 4: Run focused tests and the type/build gate**

Run: `npm test -- tests/scene/createContactShadow.test.ts tests/scene/LayoutSceneManager.test.ts && npm run build`

Expected: both test files PASS and the build exits 0 with no `floorGrid` or `PlaneTrackingManager` reference.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- src/scene/createContactShadow.ts src/scene/createScene.ts src/scene/LayoutSceneManager.ts src/xr/PlaneTrackingManager.ts src/app/arRuntime.ts src/app/WebARApp.ts tests/scene/createContactShadow.test.ts tests/scene/LayoutSceneManager.test.ts
git commit -m "fix: remove immersive floor grid"
```

---

### Task 2: Stabilize Hit-Test Poses and Gate Placement

**Files:**
- Create: `src/xr/PoseStabilizer.ts`
- Create: `tests/xr/PoseStabilizer.test.ts`
- Modify: `src/xr/HitTestManager.ts`
- Create: `tests/xr/HitTestManager.test.ts`
- Modify: `src/app/arRuntime.ts`
- Modify: `src/app/WebARApp.ts`
- Modify: `tests/app/WebARApp.test.ts`

**Interfaces:**
- Produces: `PoseStabilizer.update(raw: THREE.Matrix4, deltaSeconds: number): THREE.Matrix4 | null`.
- Produces: `HitTestManager.isStable: boolean`, `latestPoseMatrix`, `latestPoint`, and `latestHitResult`.
- Changes: `HitTestManager.update(frame, session, referenceSpace, deltaSeconds): boolean` returns stable readiness, not raw-hit presence.

- [ ] **Step 1: Write the failing stabilizer tests**

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PoseStabilizer } from '../../src/xr/PoseStabilizer';

const pose = (x: number) => new THREE.Matrix4().makeTranslation(x, 0, -1);

describe('PoseStabilizer', () => {
  it('requires eight nearby samples before returning a placeable pose', () => {
    const stabilizer = new PoseStabilizer();
    for (let index = 0; index < 7; index += 1) expect(stabilizer.update(pose(index * 0.001), 1 / 60)).toBeNull();
    expect(stabilizer.update(pose(0.007), 1 / 60)).toBeInstanceOf(THREE.Matrix4);
    expect(stabilizer.isStable).toBe(true);
  });

  it('rejects a one-frame jump larger than 35 centimeters', () => {
    const stabilizer = new PoseStabilizer();
    for (let index = 0; index < 8; index += 1) stabilizer.update(pose(0), 1 / 60);
    expect(stabilizer.update(pose(0.5), 1 / 60)).toBeNull();
    expect(stabilizer.isStable).toBe(false);
  });

  it('clears readiness and samples on reset', () => {
    const stabilizer = new PoseStabilizer();
    for (let index = 0; index < 8; index += 1) stabilizer.update(pose(0), 1 / 60);
    stabilizer.reset();
    expect(stabilizer.isStable).toBe(false);
    expect(stabilizer.update(pose(0), 1 / 60)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the stabilizer test and verify RED**

Run: `npm test -- tests/xr/PoseStabilizer.test.ts`

Expected: FAIL because `PoseStabilizer` does not exist.

- [ ] **Step 3: Implement the deterministic stabilizer**

Implement `PoseStabilizer` with constants `MIN_STABLE_FRAMES = 8`, `POSITION_TOLERANCE_METERS = 0.025`, `MAX_JUMP_METERS = 0.35`, and `DAMPING_LAMBDA = 18`. Decompose each matrix; reset and return `null` for jumps above `MAX_JUMP_METERS`; increment stability only when consecutive raw positions are within tolerance; use `alpha = 1 - Math.exp(-DAMPING_LAMBDA * Math.max(0, deltaSeconds))`, `Vector3.lerp`, and `Quaternion.slerp`; compose the smoothed position, quaternion, and unit scale only after eight stable frames.

- [ ] **Step 4: Write failing HitTestManager and app readiness tests**

The manager test must feed eight real-looking mocked `XRHitTestResult` poses, assert the reticle stays hidden for frames 1-7, becomes visible on frame 8, stores `latestHitResult`, and hides/reset readiness after a no-hit frame. Add an app test asserting `placeAtLatestHit()` does nothing while `hitTestManager.isStable` is false.

- [ ] **Step 5: Run the new tests and verify RED**

Run: `npm test -- tests/xr/PoseStabilizer.test.ts tests/xr/HitTestManager.test.ts tests/app/WebARApp.test.ts`

Expected: stabilizer tests PASS; manager/app tests FAIL because the new interface is not wired.

- [ ] **Step 6: Wire stabilized poses into HitTestManager and WebARApp**

Pass render-loop `delta` into `HitTestManager.update`. Store the first result as `latestHitResult`, send its matrix to `PoseStabilizer`, and only update/show the ring when a stable matrix exists. On missing hit or pose, call a `loseTracking()` helper that hides the ring and resets readiness without moving placed objects. Change scanning-to-ready and `placeAtLatestHit()` to require `isStable && latestPoseMatrix`.

- [ ] **Step 7: Run focused tests and build, then commit**

Run: `npm test -- tests/xr/PoseStabilizer.test.ts tests/xr/HitTestManager.test.ts tests/app/WebARApp.test.ts && npm run build`

Expected: PASS and build exit 0.

```powershell
git add -- src/xr/PoseStabilizer.ts src/xr/HitTestManager.ts src/app/arRuntime.ts src/app/WebARApp.ts tests/xr/PoseStabilizer.test.ts tests/xr/HitTestManager.test.ts tests/app/WebARApp.test.ts
git commit -m "feat: stabilize WebXR placement targets"
```

---

### Task 3: Add Placement Settle and Damped Drag Motion

**Files:**
- Create: `src/interaction/SpatialMotionController.ts`
- Create: `tests/interaction/SpatialMotionController.test.ts`
- Modify: `src/app/arRuntime.ts`
- Modify: `src/app/WebARApp.ts`
- Modify: `src/scene/LayoutSceneManager.ts`

**Interfaces:**
- Produces: `startPlacement(target, reducedMotion)`, `setDragTarget(target, point)`, `finishDrag(target)`, `update(deltaSeconds)`, `cancel(target?)`.
- Consumes: arbitrary `THREE.Group` targets from `modelRoot` or `LayoutSceneManager.selectedGroup()`.

- [ ] **Step 1: Write failing motion tests**

Test that `startPlacement()` begins at `finalY + 0.04`, scale `finalScale * 0.96`, and material opacity `0`; after updates totaling at least `0.22` seconds it reaches the exact final pose/scale/original opacity. Test that reduced motion completes immediately. Test that `setDragTarget()` preserves original Y, approaches X/Z without overshoot, and reaches the exact target after `finishDrag()` and sufficient updates.

- [ ] **Step 2: Run the motion test and verify RED**

Run: `npm test -- tests/interaction/SpatialMotionController.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement minimal motion state**

Use a `Map<THREE.Group, MotionState>`. Placement duration is `0.22` seconds with cubic-out easing `1 - (1 - t) ** 3`. Snapshot every mesh material's original `transparent` and `opacity`, restore both at completion/cancel, and never include `contact-shadow` in fading. Drag uses frame-rate-independent damping with lambda `20`; `finishDrag()` marks the target for exact convergence once remaining X/Z distance is below `0.001` meters.

- [ ] **Step 4: Wire placement, drag, reduced motion, and render updates**

Instantiate one controller in `ensureARRuntime`. After single or layout placement, reveal the relevant contact shadow and call `startPlacement`. In `handleDrag`, call `setDragTarget` instead of directly mutating the target group. Replace the gesture-end handler with a method that calls `finishDrag` for the active target before clearing gesture state. Call `motionController.update(delta)` exactly once per render frame. Cancel target motion when switching/resetting/deleting objects and cancel all motion on session end.

- [ ] **Step 5: Run motion, interaction, layout, and app tests**

Run: `npm test -- tests/interaction/SpatialMotionController.test.ts tests/interaction/ObjectTransformController.test.ts tests/scene/LayoutSceneManager.test.ts tests/app/WebARApp.test.ts && npm run build`

Expected: PASS and build exit 0.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- src/interaction/SpatialMotionController.ts src/app/arRuntime.ts src/app/WebARApp.ts src/scene/LayoutSceneManager.ts tests/interaction/SpatialMotionController.test.ts
git commit -m "feat: add grounded placement motion"
```

---

### Task 4: Track Every Placed Object with Optional Anchors

**Files:**
- Modify: `src/xr/AnchorManager.ts`
- Create: `tests/xr/AnchorManager.test.ts`
- Modify: `src/app/arRuntime.ts`
- Modify: `src/app/WebARApp.ts`
- Modify: `src/scene/LayoutSceneManager.ts`

**Interfaces:**
- Produces: `createFor(target, hitResult): Promise<XRAnchor | null>`, `update(frame, referenceSpace)`, `deleteFor(target)`, and `clear()`.
- Consumes: `HitTestManager.latestHitResult` and the placed single/layout object group.

- [ ] **Step 1: Write failing anchor lifecycle tests**

Test one anchor per target with two `THREE.Group` instances. Mock `hitResult.createAnchor()` success, then `frame.getPose(anchor.anchorSpace, referenceSpace)` and assert each group's position/quaternion update. Assert replacing an anchor calls the old anchor's `delete`, unsupported `createAnchor` returns `null`, rejected creation does not throw, `deleteFor` affects only one target, and `clear` deletes all anchors.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/xr/AnchorManager.test.ts`

Expected: FAIL because the current manager owns only one global anchor and has no per-target methods.

- [ ] **Step 3: Implement the map-based manager**

Store `Map<THREE.Object3D, XRAnchor>`. `createFor` must delete an existing target anchor before awaiting `hitResult.createAnchor?.()`, catch failures, and ignore a late result if a newer request for that target has started. `update` must call `frame.getPose(anchor.anchorSpace, referenceSpace)`, decompose into the target, and preserve target scale. `deleteFor` and `clear` must call `XRAnchor.delete()` exactly once.

- [ ] **Step 4: Integrate placement, dragging, deletion, and session cleanup**

Instantiate `AnchorManager` with the AR runtime. After placement settle begins, call `createFor(target, latestHitResult)` without blocking placement. At drag start call `deleteFor(target)`; after drag release and a stable current hit call `createFor` again. Update anchors before motion during each XR frame. Delete layout anchors when deleting/clearing objects; add a `LayoutSceneManager.groups(): THREE.Group[]` accessor for cleanup. Call `clear()` on session end and model replacement.

- [ ] **Step 5: Run anchor, layout, app tests and build**

Run: `npm test -- tests/xr/AnchorManager.test.ts tests/scene/LayoutSceneManager.test.ts tests/app/WebARApp.test.ts && npm run build`

Expected: PASS and build exit 0.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- src/xr/AnchorManager.ts src/app/arRuntime.ts src/app/WebARApp.ts src/scene/LayoutSceneManager.ts tests/xr/AnchorManager.test.ts tests/scene/LayoutSceneManager.test.ts tests/app/WebARApp.test.ts
git commit -m "feat: anchor placed WebXR objects"
```

---

### Task 5: Apply Estimated Lighting with Fixed-Light Fallback

**Files:**
- Create: `src/xr/EstimatedLightingController.ts`
- Create: `tests/xr/EstimatedLightingController.test.ts`
- Modify: `src/scene/createScene.ts`
- Modify: `src/app/arRuntime.ts`
- Modify: `src/app/WebARApp.ts`

**Interfaces:**
- Produces: `EstimatedLightingController.start()`, `stop()`, and `dispose()`.
- Consumes: scene, `XREstimatedLight`, fallback hemisphere light, and fallback directional light.
- Adds to `SceneContext`: `fallbackLights: [THREE.HemisphereLight, THREE.DirectionalLight]`.

- [ ] **Step 1: Write failing controller tests**

Create a fake `XREstimatedLight` as an `EventDispatcher` with `environment`, `dispose`, and `visible`. Assert `estimationstart` hides both fallback lights and assigns `scene.environment`; `estimationend` reveals fallback lights and clears only the environment owned by the controller; `dispose` removes listeners, restores fallbacks, and calls the light's `dispose` once.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/xr/EstimatedLightingController.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement and integrate estimated lighting**

Import `XREstimatedLight` from `three/addons/webxr/XREstimatedLight.js` in the AR runtime. The controller adds it to the scene but leaves fallback lights enabled until `estimationstart`. On start, use the estimated environment and hide fallbacks; on end/stop/error, clear the owned environment and show fallbacks. Construct the controller after scene creation and dispose it when the scene/app is disposed. Do not make light estimation required in `XRSessionManager`.

- [ ] **Step 4: Enable model shadow casting**

In `loadModel.ts`, set every mesh `castShadow = true` and keep its current material behavior. Add assertions to `tests/scene/loadModel.test.ts` that loaded meshes cast shadows. Ensure the fixed directional light and estimated directional light can cast shadows while contact receivers remain the only new shadow-only geometry.

- [ ] **Step 5: Run focused and full automated verification**

Run: `npm test -- tests/xr/EstimatedLightingController.test.ts tests/scene/loadModel.test.ts && npm test && npm run build`

Expected: all tests PASS and the production build exits 0.

- [ ] **Step 6: Commit Task 5**

```powershell
git add -- src/xr/EstimatedLightingController.ts src/scene/createScene.ts src/scene/loadModel.ts src/app/arRuntime.ts src/app/WebARApp.ts tests/xr/EstimatedLightingController.test.ts tests/scene/loadModel.test.ts
git commit -m "feat: match WebXR environmental lighting"
```

---

### Task 6: Regression and Physical-Device Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-19-webxr-realism-and-stable-placement-design.md` only if verified browser behavior differs from the approved assumptions.

**Interfaces:**
- Consumes: the complete AR runtime produced by Tasks 1-5.
- Produces: repeatable desktop verification output and a physical-device checklist.

- [ ] **Step 1: Run the complete automated verification from a clean command invocation**

Run: `npm test`

Expected: Vitest exits 0 with zero failed test files and zero failed tests.

Run: `npm run build`

Expected: TypeScript and Vite exit 0 and create `dist/`.

- [ ] **Step 2: Search for forbidden grid and stale manager references**

Run: `rg -n "GridHelper|floorGrid|PlaneTrackingManager" src tests`

Expected: no matches. The turquoise `RingGeometry(0.09, 0.105, 40)` and color `0x5eead4` remain in `createScene.ts`.

- [ ] **Step 3: Verify on the Samsung Galaxy S25 Ultra**

Start the app with `npm run dev -- --host 127.0.0.1 --port 5173`, run `adb reverse tcp:5173 tcp:5173`, and open `http://localhost:5173` in current Android Chrome. Confirm all of the following in one well-lit textured room and one dim room:

- No square grid appears during scanning, placement, dragging, or editing.
- The unchanged turquoise ring appears after stable scanning.
- Place remains unavailable until the ring is stable.
- Placement settles without a hard snap, and reduced-motion mode completes immediately.
- Dragging follows the finger smoothly, remains floor-locked, and does not overshoot on release.
- A placed object stays attached while walking around it.
- Single and multi-object placement both retain shadows and independent anchoring.
- Lighting changes with the room when supported; fallback lighting remains usable when estimation is unavailable.
- Ending and restarting AR leaves no stale ring, anchor, shadow, or lighting state.

- [ ] **Step 4: Update README behavior notes**

Document that placement waits briefly for a stable turquoise ring, anchors and estimated lighting are optional enhancements, and textured well-lit surfaces produce the best tracking. Do not claim native-only depth occlusion or semantic meshing.

- [ ] **Step 5: Re-run verification after documentation and commit**

Run: `npm test && npm run build && git diff --check`

Expected: tests/build exit 0 and `git diff --check` prints nothing.

```powershell
git add -- README.md
git commit -m "docs: explain stable WebXR placement"
```

