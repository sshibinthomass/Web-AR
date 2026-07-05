# Multi-Object Layouts Design

## Goal

Add a login-required Layouts mode where a user can place multiple 3D models in one AR scene, save the arrangement, and reopen it later.

## User Experience

The first screen gains a `Layouts` option in the login-required group. Opening it shows saved layouts for the signed-in user and a `New Layout` action. A layout session opens the existing AR placement experience, but model selection adds new object instances instead of replacing the current object. The user can save the current arrangement, load a saved arrangement, rename it, and delete it.

In a layout session:

- `Add Object` opens the existing model picker.
- Selecting a model loads it as the pending object.
- `Place` creates a new placed object instance at the current floor hit.
- Tapping an existing placed object selects it for drag, pinch scale, reset scale, reset position, or delete.
- `Save Layout` persists all placed objects and their transforms.
- `Back` exits AR and returns to the home or layout list page.

The existing public `AR View` remains a simple single-object flow.

## Persistence

Reuse the Cloudflare Worker and R2 storage style already used for generated models and auth. Layout records are private to the owner by default.

Storage keys:

- `layouts/index.json` stores a compact list of layout summaries.
- `layouts/<layout-id>.json` stores the full layout.

Worker routes:

- `GET /generate-3d/layouts`
- `POST /generate-3d/layouts`
- `GET /generate-3d/layouts/:id`
- `PATCH /generate-3d/layouts/:id`
- `DELETE /generate-3d/layouts/:id`

All layout routes require an approved session. Users can only read or manage their own layouts unless they are an admin.

## Data Contract

```ts
interface LayoutObjectTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

interface LayoutObject {
  id: string;
  model_id: string;
  model_label: string;
  model_url: string;
  transform: LayoutObjectTransform;
}

interface LayoutRecord {
  id: string;
  name: string;
  owner_email: string;
  created_at: string;
  updated_at: string;
  objects: LayoutObject[];
}
```

## Frontend Architecture

Keep the existing single-object flow intact. Add a layout scene manager for multi-object sessions and let `WebARApp` switch between single placement and layout placement behavior.

New module:

- `src/scene/LayoutSceneManager.ts` owns placed layout object instances, active selection, transform export/import, deletion, and hit testing.

Existing modules:

- `src/app/WebARApp.ts` coordinates layout mode, calls the Worker client, and routes gestures to either the single-object transform controller or the layout manager.
- `src/ui/ARHud.ts` adds the Layouts route, list, status controls, save/delete actions, and Add Object entry point.
- `src/services/generatedModelClient.ts` adds typed layout API helpers.
- `worker/src/index.ts` adds persisted layout routes using the existing auth and R2 helpers.

## Error Handling

Missing auth redirects to login with a layout-specific message. Worker validation rejects empty layout names, invalid object arrays, invalid numeric transforms, and layout access by non-owners. Frontend save failures stay in the layout panel without discarding the current in-memory scene.

## Testing

Use TDD with focused tests first:

- Worker tests for layout create/list/get/update/delete and ownership checks.
- Service-client tests for request/response mapping.
- Layout scene manager tests for add/select/export/import/delete.
- HUD tests for the new Layouts route and controls.
- A full `npm test` and `npm run build` before completion.
