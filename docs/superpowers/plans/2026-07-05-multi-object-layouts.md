# Session-Only Multi-Object Placement Plan

**Goal:** Keep multi-object AR placement, remove layout save/retrieve behavior, and make each multi-object session start empty.

**Architecture:** Keep generated/uploaded model persistence unchanged. Remove layout persistence from the Worker and generated-model client. Reuse the session-only Three.js scene manager for multiple object instances.

## Constraints

- Do not break public `AR View`, `Models`, `Camera`, `Upload Image`, `Upload Model`, or `Full Flow`.
- Do not add a saved layout list, save button, reopen action, or layout CRUD API.
- Preserve WebXR user-gesture requirements by preparing AR before the user taps `Start Session`.
- Use focused tests before implementation changes.

## Tasks

### Task 1: Tests

- Update HUD tests to expect `Multi Object`, the `#/multi-object` route, a `Start Session` action, no saved rows, and no `Save Layout` button.
- Update Worker tests to expect `/generate-3d/layouts` to be unsupported.
- Remove generated-model client tests for layout persistence helpers.
- Keep scene manager tests for multiple in-memory objects.

### Task 2: Frontend UI

- Rename the first-screen action from `Layouts` to `Multi Object`.
- Replace the saved layout page with a simple fresh-session page.
- Keep only `Add Object` and `Delete Object` as multi-object-specific AR controls.
- Keep session copy explicit that nothing is saved or reopened.

### Task 3: App Wiring

- Replace saved-layout handlers with `onPrepareMultiObject` and `onStartMultiObject`.
- Start each multi-object session by clearing `LayoutSceneManager`.
- Route model selection, placement, drag, scale, reset, and rotation to the layout manager only while multi-object mode is active.
- Clear session objects on return home/logout.

### Task 4: Worker And Client Cleanup

- Remove Worker layout route handlers, layout R2 keys, layout validation, layout audit events, and layout storage helpers.
- Remove `listLayouts`, `createLayout`, `getLayout`, `updateLayout`, and `deleteLayout` from `generatedModelClient`.
- Move transient layout object types into the scene layer.

### Task 5: Verification

- Run focused tests:
  `npm test -- tests/ui/ARHud.test.ts tests/services/generatedModelClient.test.ts tests/worker/generateModelWorker.test.ts tests/scene/LayoutSceneManager.test.ts`
- Run full tests:
  `npm test`
- Run production build:
  `npm run build`
- If publishing, deploy the Worker only if Worker code changed and push `main` to trigger GitHub Pages, then verify the live bundle.
