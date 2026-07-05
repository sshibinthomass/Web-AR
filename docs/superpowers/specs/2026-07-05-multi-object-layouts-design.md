# Session-Only Multi-Object Placement Design

## Goal

Add a login-required `Multi Object` mode where a user can place multiple 3D models in one AR session. The scene starts empty every time and is discarded when the user leaves the flow.

## User Experience

The first screen has a `Multi Object` option in the login-required group. Guests are redirected to login with a multi-object specific message. Signed-in users land on a small session page with one `Start Session` action. This extra tap keeps WebXR startup tied to a real user gesture after the AR runtime is prepared.

In a multi-object session:

- `Start Session` opens the AR placement surface.
- Selecting a model loads it as the pending object.
- `Place` creates a new placed object instance at the current floor hit.
- `Add Object` tells the user to choose another model from the rail.
- `Delete Object` removes the selected placed object.
- Drag, pinch, reset scale, reset position, and rotate apply to the selected object.
- `Back` exits AR and clears the in-memory scene.

There is no layout save, layout list, reopen action, rename action, delete-layout action, or Worker layout storage.

## Frontend Architecture

Keep the existing public `AR View` as the single-object flow. Use the existing AR runtime and a session-only scene manager for `Multi Object`.

Modules:

- `src/scene/LayoutSceneManager.ts` owns in-memory placed object instances, active selection, transform export/import for session state, deletion, and hit testing.
- `src/scene/layoutTypes.ts` defines transient object transform types used by the scene manager.
- `src/ui/ARHud.ts` adds the `#/multi-object` route, session start page, and AR-only `Add Object` / `Delete Object` controls.
- `src/app/WebARApp.ts` switches gestures and placement between the single-object controller and the layout scene manager when multi-object mode is active.

## Worker And Client Scope

The Worker continues to persist generated and uploaded models. It does not expose layout persistence routes.

Unsupported examples:

- `GET /generate-3d/layouts`
- `POST /generate-3d/layouts`
- `GET /generate-3d/layouts/:id`
- `PATCH /generate-3d/layouts/:id`
- `DELETE /generate-3d/layouts/:id`

`src/services/generatedModelClient.ts` keeps generated-model, upload, admin-job, and thumbnail helpers only.

## Error Handling

Missing auth redirects to login. Model load failures stay in the multi-object status area. Deleting with no selected object shows a non-destructive prompt. Leaving the route clears session objects through the existing home/return flow.

## Testing

Focused tests cover:

- Worker no longer exposing saved layout persistence routes.
- Generated-model client no longer including layout persistence helpers.
- `LayoutSceneManager` adding, selecting, deleting, and transforming multiple objects in memory.
- HUD `Multi Object` routing, auth redirect, session start, and AR controls without `Save Layout`.
- Full `npm test` and `npm run build` before completion.
