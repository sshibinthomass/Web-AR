# Android WebXR GLB Floor Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only mobile WebXR app that runs from this computer and lets a Samsung Galaxy S25 Ultra load a `.glb`, detect the floor, place the model, then move, rotate, and scale it on the detected floor.

**Architecture:** Use a Vite TypeScript app with Three.js as the rendering layer and browser WebXR as the AR runtime. The phone connects to the dev server through USB port forwarding so Chrome on Android opens `http://localhost:5173` while the app is actually running on this computer. Floor interaction uses WebXR hit testing first, optional plane detection when available, and a gesture controller for object transforms.

**Tech Stack:** TypeScript, Vite, Three.js, WebXR Device API, WebXR Hit Test API, optional WebXR Plane Detection API, optional WebXR Anchors API, GLTFLoader, Chrome for Android, Android Platform Tools `adb`.

## Global Constraints

- Target device: Samsung Galaxy S25 Ultra running Android with Chrome.
- Hosting: no cloud hosting; app runs locally on this computer.
- Mobile test URL: use USB debugging plus `adb reverse tcp:5173 tcp:5173`, then open `http://localhost:5173` on the phone.
- AR runtime: use browser WebXR, not native ARCore SDK.
- Model format: load `.glb` from the local app's `public/models/` directory.
- Floor behavior: use hit testing as the reliable baseline; use plane detection only as an enhancement because browser support can vary.
- Object controls: support tap-to-place, drag-to-move on floor, pinch-to-scale, twist-to-rotate, and reset controls.
- Performance: optimize for mobile WebGL; keep model assets compressed and texture sizes reasonable.
- Verification: final acceptance requires testing on the physical S25 Ultra, because desktop browser automation cannot enter a real mobile AR session.

---

## Local Testing Strategy

Use USB forwarding instead of cloud hosting or LAN HTTPS.

1. Install Android Platform Tools on this computer.
2. Enable Developer Options and USB debugging on the S25 Ultra.
3. Connect the phone with USB.
4. Run the Vite dev server on this computer:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

5. Forward the phone's localhost port to the computer:

```powershell
adb devices
adb reverse tcp:5173 tcp:5173
```

6. On the S25 Ultra, open Chrome and visit:

```text
http://localhost:5173
```

This keeps the app local while satisfying the practical WebXR development workflow. Avoid `http://192.168.x.x:5173` for AR testing unless a trusted HTTPS certificate is configured, because WebXR requires a secure context.

## File Structure

- Create: `package.json`
  - Defines dependencies, scripts, and browser build commands.
- Create: `tsconfig.json`
  - Enables strict TypeScript with DOM/WebXR-compatible types.
- Create: `vite.config.ts`
  - Configures Vite for local development.
- Create: `index.html`
  - Hosts the AR app root and overlay UI.
- Create: `public/models/object.glb`
  - Placeholder path for the user's test model.
- Create: `src/main.ts`
  - App entry point.
- Create: `src/app/WebARApp.ts`
  - Owns app lifecycle, connects scene, XR, model loading, UI, and interactions.
- Create: `src/scene/createScene.ts`
  - Creates renderer, scene, camera, lights, reticle, and model root group.
- Create: `src/scene/loadModel.ts`
  - Loads `.glb` files with `GLTFLoader`, normalizes model scale, and returns a `THREE.Group`.
- Create: `src/xr/XRSupport.ts`
  - Checks `navigator.xr`, `immersive-ar`, and feature availability.
- Create: `src/xr/XRSessionManager.ts`
  - Creates the AR button and manages session start/end events.
- Create: `src/xr/HitTestManager.ts`
  - Requests hit-test source and updates the floor reticle each XR frame.
- Create: `src/xr/PlaneTrackingManager.ts`
  - Reads detected planes when available and tracks the likely floor.
- Create: `src/xr/AnchorManager.ts`
  - Creates and updates anchors when supported; falls back to Three.js world transforms.
- Create: `src/interaction/GestureController.ts`
  - Converts touch input into drag, pinch, and twist events.
- Create: `src/interaction/ObjectTransformController.ts`
  - Applies move, rotate, scale, and reset transforms to the placed model.
- Create: `src/ui/ARHud.ts`
  - Shows compatibility, scanning, place, edit, and reset controls.
- Create: `src/state/AppState.ts`
  - Stores app mode and selected object state.
- Create: `src/utils/math.ts`
  - Provides transform, angle, clamp, and floor-plane helpers.
- Create: `src/styles.css`
  - Fullscreen canvas and mobile overlay styling.
- Create: `tests/interaction/GestureController.test.ts`
  - Unit tests for gesture math.
- Create: `tests/interaction/ObjectTransformController.test.ts`
  - Unit tests for transform clamping and floor-locked movement.
- Create: `README.md`
  - Documents setup, local phone testing, troubleshooting, and model requirements.

---

### Task 1: Project Scaffold and Local Android Test Commands

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `README.md`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm run test`
- Produces: app root element with id `app`

- [ ] **Step 1: Initialize dependencies**

Run:

```powershell
npm init -y
npm install three
npm install -D typescript vite vitest @types/three
```

Expected: `package.json` exists and `node_modules` is installed.

- [ ] **Step 2: Configure scripts**

Set `package.json` scripts to:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "three": "^0.166.0"
  },
  "devDependencies": {
    "@types/three": "^0.166.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Add README local testing section**

Document these commands:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
adb devices
adb reverse tcp:5173 tcp:5173
```

Document this mobile URL:

```text
http://localhost:5173
```

- [ ] **Step 4: Verify shell app**

Run:

```powershell
npm run build
```

Expected: build succeeds and `dist/` is created.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src README.md
git commit -m "chore: scaffold local WebXR app"
```

---

### Task 2: Three.js Scene and GLB Loader

**Files:**
- Create: `public/models/object.glb`
- Create: `src/scene/createScene.ts`
- Create: `src/scene/loadModel.ts`
- Modify: `src/app/WebARApp.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `createScene(container: HTMLElement): SceneContext`
- Produces: `loadGLBModel(url: string): Promise<THREE.Group>`
- Consumes: root element `#app`

- [ ] **Step 1: Define scene context**

Create `SceneContext`:

```ts
export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  reticle: THREE.Mesh;
  modelRoot: THREE.Group;
  dispose(): void;
}
```

- [ ] **Step 2: Create renderer**

Use:

```ts
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.xr.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);
```

- [ ] **Step 3: Create reticle**

Use a thin ring mesh rotated flat on the floor:

```ts
const geometry = new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
const reticle = new THREE.Mesh(geometry, material);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);
```

- [ ] **Step 4: Load `.glb`**

Use `GLTFLoader`:

```ts
const loader = new GLTFLoader();
const gltf = await loader.loadAsync(url);
const group = new THREE.Group();
group.add(gltf.scene);
group.visible = false;
return group;
```

- [ ] **Step 5: Verify model load**

Run:

```powershell
npm run build
```

Expected: TypeScript resolves `three/addons/loaders/GLTFLoader.js`.

- [ ] **Step 6: Commit**

```powershell
git add public src
git commit -m "feat: add three scene and glb loading"
```

---

### Task 3: WebXR Capability and Session Management

**Files:**
- Create: `src/xr/XRSupport.ts`
- Create: `src/xr/XRSessionManager.ts`
- Modify: `src/app/WebARApp.ts`
- Modify: `src/ui/ARHud.ts`

**Interfaces:**
- Produces: `checkXRSupport(): Promise<XRSupportStatus>`
- Produces: `createARSessionButton(renderer: THREE.WebGLRenderer, overlayRoot: HTMLElement): HTMLElement`

- [ ] **Step 1: Add support check**

Implement:

```ts
export interface XRSupportStatus {
  hasNavigatorXR: boolean;
  supportsImmersiveAR: boolean;
}

export async function checkXRSupport(): Promise<XRSupportStatus> {
  const xr = navigator.xr;
  const supportsImmersiveAR = xr ? await xr.isSessionSupported('immersive-ar') : false;
  return {
    hasNavigatorXR: Boolean(xr),
    supportsImmersiveAR,
  };
}
```

- [ ] **Step 2: Create AR button with Android-friendly features**

Use:

```ts
ARButton.createButton(renderer, {
  requiredFeatures: ['hit-test'],
  optionalFeatures: ['dom-overlay', 'anchors', 'plane-detection', 'light-estimation'],
  domOverlay: { root: overlayRoot },
});
```

- [ ] **Step 3: Show unsupported state**

If `supportsImmersiveAR` is false, render: "Open this on Android Chrome with WebXR support. For local testing use USB debugging and http://localhost:5173 on the phone."

- [ ] **Step 4: Verify on desktop**

Run:

```powershell
npm run build
```

Expected: build succeeds. Desktop may show unsupported AR, which is acceptable.

- [ ] **Step 5: Verify on S25 Ultra**

Run:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
adb reverse tcp:5173 tcp:5173
```

Open on phone:

```text
http://localhost:5173
```

Expected: Android Chrome shows the AR entry button.

- [ ] **Step 6: Commit**

```powershell
git add src
git commit -m "feat: add WebXR session entry"
```

---

### Task 4: Floor Hit Testing and Reticle

**Files:**
- Create: `src/xr/HitTestManager.ts`
- Modify: `src/app/WebARApp.ts`
- Modify: `src/state/AppState.ts`

**Interfaces:**
- Produces: `HitTestManager.update(frame: XRFrame): boolean`
- Produces: `HitTestManager.latestPoseMatrix: THREE.Matrix4 | null`
- Consumes: renderer XR session and reference space

- [ ] **Step 1: Request hit-test source**

On AR session start:

```ts
const viewerSpace = await session.requestReferenceSpace('viewer');
const hitTestSource = await session.requestHitTestSource?.({ space: viewerSpace });
```

- [ ] **Step 2: Update reticle each XR frame**

Use:

```ts
const hitTestResults = frame.getHitTestResults(hitTestSource);
if (hitTestResults.length > 0) {
  const pose = hitTestResults[0].getPose(referenceSpace);
  if (pose) {
    reticle.visible = true;
    reticle.matrix.fromArray(pose.transform.matrix);
    latestPoseMatrix.copy(reticle.matrix);
  }
}
```

- [ ] **Step 3: Track scanning state**

Set app mode to `readyToPlace` only after a stable hit result has been observed for at least 10 consecutive frames.

- [ ] **Step 4: Verify on S25 Ultra**

Expected: while in AR, moving the phone over the floor displays a stable green reticle on the floor.

- [ ] **Step 5: Commit**

```powershell
git add src/xr src/state src/app
git commit -m "feat: add floor hit testing"
```

---

### Task 5: Place Model on Floor

**Files:**
- Modify: `src/app/WebARApp.ts`
- Create: `src/xr/AnchorManager.ts`
- Modify: `src/state/AppState.ts`

**Interfaces:**
- Produces: `placeModelAt(matrix: THREE.Matrix4): void`
- Produces: `AnchorManager.createAnchor(frame: XRFrame, pose: XRPose): Promise<XRAnchor | null>`

- [ ] **Step 1: Add app modes**

Use:

```ts
export type AppMode = 'unsupported' | 'loading' | 'scanning' | 'readyToPlace' | 'placed' | 'editing';
```

- [ ] **Step 2: Place on tap**

On controller `select` or screen tap:

```ts
modelRoot.matrix.copy(latestPoseMatrix);
modelRoot.matrix.decompose(modelRoot.position, modelRoot.quaternion, modelRoot.scale);
modelRoot.visible = true;
appState.mode = 'placed';
```

- [ ] **Step 3: Keep model floor-aligned**

After placement, preserve the floor Y coordinate:

```ts
const floorY = modelRoot.position.y;
```

- [ ] **Step 4: Verify on S25 Ultra**

Expected: tap places the `.glb` on the reticle and the object remains visually attached to the floor as the user moves around.

- [ ] **Step 5: Commit**

```powershell
git add src
git commit -m "feat: place glb on detected floor"
```

---

### Task 6: Move, Rotate, and Scale the Placed Object

**Files:**
- Create: `src/interaction/GestureController.ts`
- Create: `src/interaction/ObjectTransformController.ts`
- Create: `src/utils/math.ts`
- Create: `tests/interaction/GestureController.test.ts`
- Create: `tests/interaction/ObjectTransformController.test.ts`
- Modify: `src/app/WebARApp.ts`

**Interfaces:**
- Produces: `GestureController` events: `drag`, `pinch`, `twist`, `tap`
- Produces: `ObjectTransformController.moveToFloorPoint(point: THREE.Vector3): void`
- Produces: `ObjectTransformController.rotateBy(deltaRadians: number): void`
- Produces: `ObjectTransformController.scaleBy(multiplier: number): void`
- Consumes: placed `modelRoot`

- [ ] **Step 1: Test scale clamp**

Create test:

```ts
expect(clampScale(0.01)).toBe(0.1);
expect(clampScale(10)).toBe(5);
expect(clampScale(1.5)).toBe(1.5);
```

- [ ] **Step 2: Implement scale clamp**

```ts
export function clampScale(value: number): number {
  return Math.min(5, Math.max(0.1, value));
}
```

- [ ] **Step 3: Test twist angle**

Create test:

```ts
expect(getAngleBetweenTouches({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
```

- [ ] **Step 4: Implement gesture math**

```ts
export function getAngleBetweenTouches(a: Point2, b: Point2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}
```

- [ ] **Step 5: Apply floor-locked move**

On one-finger drag, use the current hit-test matrix, decompose position, and update only `x` and `z`:

```ts
modelRoot.position.x = hitPoint.x;
modelRoot.position.z = hitPoint.z;
modelRoot.position.y = floorY;
```

- [ ] **Step 6: Apply pinch scale**

```ts
const nextScale = clampScale(modelRoot.scale.x * pinchMultiplier);
modelRoot.scale.setScalar(nextScale);
```

- [ ] **Step 7: Apply twist rotation**

```ts
modelRoot.rotation.y += deltaRadians;
```

- [ ] **Step 8: Verify tests**

Run:

```powershell
npm run test
```

Expected: all gesture and transform tests pass.

- [ ] **Step 9: Verify on S25 Ultra**

Expected:
- One-finger drag moves the model across the floor.
- Two-finger pinch scales the model.
- Two-finger twist rotates the model around the vertical axis.
- The model does not float above or sink below the floor during movement.

- [ ] **Step 10: Commit**

```powershell
git add src tests
git commit -m "feat: add mobile object transforms"
```

---

### Task 7: Optional Plane Detection Floor Visualization

**Files:**
- Create: `src/xr/PlaneTrackingManager.ts`
- Modify: `src/scene/createScene.ts`
- Modify: `src/app/WebARApp.ts`

**Interfaces:**
- Produces: `PlaneTrackingManager.update(frame: XRFrame): FloorPlane | null`
- Consumes: optional `plane-detection` feature

- [ ] **Step 1: Detect plane support defensively**

Check whether `frame.detectedPlanes` exists before reading planes.

- [ ] **Step 2: Identify likely floor**

Prefer planes whose pose normal points upward and whose Y position is near the latest hit-test floor Y.

- [ ] **Step 3: Visualize scanned floor**

Render a subtle transparent grid or polygon outline over the detected floor plane. Hide it once the object is placed unless the user enables edit mode.

- [ ] **Step 4: Verify fallback**

Expected: if plane detection is absent, hit testing still works and no error is thrown.

- [ ] **Step 5: Commit**

```powershell
git add src/xr src/scene src/app
git commit -m "feat: add optional floor plane visualization"
```

---

### Task 8: Mobile HUD and Reset Controls

**Files:**
- Create: `src/ui/ARHud.ts`
- Modify: `src/styles.css`
- Modify: `src/app/WebARApp.ts`

**Interfaces:**
- Produces: buttons for `Place`, `Edit`, `Reset`, `Rotate Left`, `Rotate Right`, `Scale Reset`
- Consumes: `AppState` and `ObjectTransformController`

- [ ] **Step 1: Add compact overlay**

Use bottom-aligned controls that avoid blocking the reticle and object.

- [ ] **Step 2: Add reset transform**

Reset rotation to `0` and scale to `1` while preserving floor position.

- [ ] **Step 3: Add rotate buttons**

Apply:

```ts
rotateBy(THREE.MathUtils.degToRad(15));
rotateBy(THREE.MathUtils.degToRad(-15));
```

- [ ] **Step 4: Verify on S25 Ultra**

Expected: buttons are tappable in AR, do not overlap badly, and do not prevent camera interaction.

- [ ] **Step 5: Commit**

```powershell
git add src/ui src/styles.css src/app
git commit -m "feat: add AR transform controls"
```

---

### Task 9: Final Local Device Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified local test workflow.

- [ ] **Step 1: Start app locally**

Run:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

- [ ] **Step 2: Forward port to phone**

Run:

```powershell
adb devices
adb reverse tcp:5173 tcp:5173
```

- [ ] **Step 3: Open app on S25 Ultra**

Open:

```text
http://localhost:5173
```

- [ ] **Step 4: Acceptance checklist**

Confirm:
- AR button appears on S25 Ultra Chrome.
- AR session starts.
- Camera permission is requested.
- Floor reticle appears after scanning the floor.
- `.glb` loads and places on tap.
- One-finger drag moves the object on the floor.
- Pinch scales the object.
- Twist rotates the object.
- Reset controls work.
- Object remains stable enough for normal mobile AR testing.

- [ ] **Step 5: Document limitations**

Add to README:

```text
This app targets Android Chrome WebXR. It is local-only and tested through USB port forwarding. Full semantic floor meshing is not guaranteed by browser WebXR; the app uses hit testing as the reliable floor-placement baseline and plane detection when available.
```

- [ ] **Step 6: Commit**

```powershell
git add README.md
git commit -m "docs: add local Android WebXR verification"
```

---

## Notes for the Samsung Galaxy S25 Ultra

- Use Chrome on Android, not Samsung Internet, for first verification.
- Keep Google Play Services for AR updated.
- Test in a textured, well-lit room; blank glossy floors can reduce tracking quality.
- Move the phone slowly for the first few seconds so ARCore/WebXR can establish tracking.
- If `http://localhost:5173` does not load on the phone, re-run `adb devices` and accept the USB debugging prompt.
- If the AR button does not appear, check Chrome permissions, AR services, and whether `navigator.xr.isSessionSupported('immersive-ar')` returns true in remote debugging.

## Self-Review

- Spec coverage: local-only mobile testing, Android S25 Ultra target, `.glb` rendering, floor detection, placement, move, rotate, scale, and physical-device verification are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: app state, gesture, hit-test, and transform interfaces are named consistently across tasks.
