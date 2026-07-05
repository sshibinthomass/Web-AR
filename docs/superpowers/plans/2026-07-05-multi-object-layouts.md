# Multi-Object Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a login-required Layouts mode that can place multiple 3D objects, save the layout to Cloudflare R2 through the Worker, and reopen it later.

**Architecture:** Keep the existing public AR View as the single-object flow. Add layout-specific Worker routes, client helpers, a Three.js layout scene manager, and HUD controls that are only active on the new `#/layouts` flow.

**Tech Stack:** TypeScript, Vite, Three.js, Vitest, Cloudflare Worker, R2-compatible bucket storage.

## Global Constraints

- Do not break the existing public `AR View`, `Models`, `Camera`, `Upload Image`, `Upload Model`, or `Full Flow` behavior.
- All layout persistence routes require an approved user session.
- Layouts are private to the owner; admins may read/manage any layout.
- A saved object must include `model_id`, `model_label`, `model_url`, `position`, `rotation`, and `scale`.
- Use TDD: write each focused test, verify it fails, then implement.

---

### Task 1: Worker Layout Persistence

**Files:**
- Modify: `worker/src/index.ts`
- Test: `tests/worker/generateModelWorker.test.ts`

**Interfaces:**
- Produces: `GET/POST/PATCH/DELETE /generate-3d/layouts` routes returning `{ layouts }`, `{ layout }`, or `{ deleted: true, id }`.
- Consumes: existing `requireApprovedUser`, `readJsonObject`, `writeJsonObject`, `appendAuditEvent`, and `MODEL_BUCKET`.

- [ ] **Step 1: Write failing worker tests**

Add tests that create a layout, list only owned layouts, load the created layout, patch its name and objects, reject another user's access, and delete it.

- [ ] **Step 2: Run worker tests to verify failure**

Run: `npm test -- tests/worker/generateModelWorker.test.ts`
Expected: FAIL because `/generate-3d/layouts` returns unsupported route errors.

- [ ] **Step 3: Implement Worker route handlers**

Add layout types, storage keys, validation helpers, route handling, ownership checks, and audit events in `worker/src/index.ts`.

- [ ] **Step 4: Run worker tests to verify pass**

Run: `npm test -- tests/worker/generateModelWorker.test.ts`
Expected: PASS.

### Task 2: Layout Client Helpers

**Files:**
- Modify: `src/services/generatedModelClient.ts`
- Test: `tests/services/generatedModelClient.test.ts`

**Interfaces:**
- Produces: `listLayouts`, `createLayout`, `getLayout`, `updateLayout`, `deleteLayout`.
- Consumes: Worker routes from Task 1 and existing auth token handling style.

- [ ] **Step 1: Write failing client tests**

Add tests that assert method, URL, authorization header, request body, and parsed response for layout helpers.

- [ ] **Step 2: Run client tests to verify failure**

Run: `npm test -- tests/services/generatedModelClient.test.ts`
Expected: FAIL because layout helper exports do not exist.

- [ ] **Step 3: Implement client helpers**

Add layout types and helper functions following the generated-model client error handling pattern.

- [ ] **Step 4: Run client tests to verify pass**

Run: `npm test -- tests/services/generatedModelClient.test.ts`
Expected: PASS.

### Task 3: Multi-Object Scene Manager

**Files:**
- Create: `src/scene/LayoutSceneManager.ts`
- Test: `tests/scene/LayoutSceneManager.test.ts`

**Interfaces:**
- Produces: `LayoutSceneManager` with `addObject`, `selectObject`, `deleteSelected`, `clear`, `exportObjects`, `importObjects`, `placePendingAt`, `moveSelectedToFloorPoint`, `scaleSelectedBy`, `rotateSelectedBy`, `resetSelectedScale`, `setSelectedTarget`.
- Consumes: Three.js groups from `loadGLBModel` and transform data from Task 2.

- [ ] **Step 1: Write failing scene-manager tests**

Cover adding multiple objects without replacing earlier ones, selecting and deleting one object, and exporting/importing transforms.

- [ ] **Step 2: Run scene-manager tests to verify failure**

Run: `npm test -- tests/scene/LayoutSceneManager.test.ts`
Expected: FAIL because the file does not exist.

- [ ] **Step 3: Implement scene manager**

Create the manager with a root group, pending object handling, active object handling, transform methods, and export/import support.

- [ ] **Step 4: Run scene-manager tests to verify pass**

Run: `npm test -- tests/scene/LayoutSceneManager.test.ts`
Expected: PASS.

### Task 4: HUD Layout Route

**Files:**
- Modify: `src/ui/ARHud.ts`
- Modify: `src/styles.css`
- Test: `tests/ui/ARHud.test.ts`

**Interfaces:**
- Produces: a `#/layouts` route with layout list, New Layout, Save Layout, Add Object, Delete Object, and layout status controls.
- Consumes: handlers passed from `WebARApp`: `onCreateLayout`, `onOpenLayout`, `onSaveLayout`, `onDeleteLayout`, `onAddLayoutObject`, `onDeleteLayoutObject`.

- [ ] **Step 1: Write failing HUD tests**

Assert the first screen contains `Layouts`, guests are redirected to login, signed-in users see the layout list, and layout AR controls expose `Add Object` and `Save Layout`.

- [ ] **Step 2: Run HUD tests to verify failure**

Run: `npm test -- tests/ui/ARHud.test.ts`
Expected: FAIL because `Layouts` is not routed or rendered.

- [ ] **Step 3: Implement HUD route and controls**

Add the route, handler interface entries, layout list render method, AR layout controls, and CSS for compact mobile controls.

- [ ] **Step 4: Run HUD tests to verify pass**

Run: `npm test -- tests/ui/ARHud.test.ts`
Expected: PASS.

### Task 5: App Wiring

**Files:**
- Modify: `src/app/WebARApp.ts`
- Modify: `src/app/arRuntime.ts`
- Test: focused existing tests plus build

**Interfaces:**
- Consumes: Worker client helpers from Task 2, `LayoutSceneManager` from Task 3, and HUD handlers from Task 4.
- Produces: complete runtime behavior for new/open/save layout, add object, place multiple objects, select/transform/delete active object.

- [ ] **Step 1: Add focused failing app-level expectations where practical**

Use existing HUD and scene-manager tests for most coverage; add an app test only if a seam exists without brittle browser/XR mocking.

- [ ] **Step 2: Implement app wiring**

Initialize a layout manager when AR runtime starts, enter layout mode from HUD events, load selected models as pending objects during layout sessions, save exported transforms, and keep single-object behavior unchanged outside layout mode.

- [ ] **Step 3: Run focused tests**

Run: `npm test -- tests/scene/LayoutSceneManager.test.ts tests/ui/ARHud.test.ts tests/services/generatedModelClient.test.ts tests/worker/generateModelWorker.test.ts`
Expected: PASS.

- [ ] **Step 4: Run full verification**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS.
