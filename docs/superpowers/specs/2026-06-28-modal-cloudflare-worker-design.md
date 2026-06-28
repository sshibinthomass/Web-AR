# Modal Cloudflare Worker Design

## Goal

Add an image-to-3D generation flow to the WebXR app without exposing Modal or Cloudflare write credentials in browser JavaScript.

## Approved Flow

The browser captures a still image from the device camera and posts it to a Cloudflare Worker. The Worker adds the Modal credentials from Worker secrets, calls the Modal image-to-3D REST endpoint, receives GLB bytes, saves those bytes into a Cloudflare R2 bucket, and returns a public GLB URL. The WebXR app then loads that generated GLB with the existing GLB loader and places it using the current AR floor-placement controls.

## Architecture

- Browser app: owns camera permission, preview, capture, request status, and AR model loading.
- Worker API: owns request validation, Modal authentication headers, Modal request body shape, R2 persistence, and CORS responses.
- R2 bucket: stores generated `.glb` files under `models/generated/`.
- Public asset origin: optional override for generated GLB URLs. When unset, the Worker serves generated R2 objects from its own origin.

## Runtime Configuration

Browser:

- `VITE_GENERATE_MODEL_API_URL`: deployed Worker endpoint, for example `https://web-ar-generate-model.<account>.workers.dev/generate-3d`.

Worker:

- `MODAL_KEY`: Worker secret.
- `MODAL_SECRET`: Worker secret.
- `MODAL_IMAGE_TO_3D_URL`: Worker variable for the Modal endpoint.
- `PUBLIC_MODEL_ORIGIN`: optional Worker variable for a public origin that serves R2 objects. Leave blank to use the Worker origin.
- `MODEL_BUCKET`: R2 bucket binding.

## Request Contract

`POST /generate-3d`

Request JSON:

```json
{
  "image_base64": "base64-encoded-image",
  "image_mime_type": "image/jpeg"
}
```

Response JSON:

```json
{
  "model_url": "https://example.com/models/generated/capture-20260628-120000.glb",
  "object_key": "models/generated/capture-20260628-120000.glb",
  "bytes": 123456
}
```

`GET /models/generated/:filename.glb`

The Worker reads the object from R2 and returns it as `model/gltf-binary`. This makes generated models usable before a dedicated R2 public/custom domain is configured.

## Error Handling

- Invalid method returns `405`.
- Invalid JSON or missing `image_base64` returns `400`.
- Missing Worker secrets or variables returns `500`.
- Modal failure returns `502` with a short message.
- R2 upload failure returns `500`.

## UI Behavior

The app adds a camera capture panel above the existing AR controls. The user can start the camera, capture an image, generate a 3D model, and load the generated model into the existing AR scene. Existing Cloudflare model selection remains available.

## Testing

Unit tests cover the Worker request contract, Modal header/body forwarding, R2 upload and serving behavior, capture encoding helpers, browser API client behavior, and HUD control callbacks. Full end-to-end Modal and Android WebXR verification remain manual because they depend on real credentials, Cloudflare deployment, Modal runtime, and phone AR hardware.
