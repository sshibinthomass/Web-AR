# GPT Extract To Async 3D Design

## Goal

Add an image-to-3D flow where the Web AR app captures an image, optionally accepts a target object name, uses OpenAI image editing from the app backend to extract a clean object image, sends that extracted image to the Trellis 3D Modal endpoint, stores the GLB in Cloudflare R2, and then exposes the generated model through the existing AR dropdown and Full Flow placement path.

## Key Decision

OpenAI image extraction must not run inside Modal. Modal should only receive the extracted image and run Trellis 3D generation.

OpenAI also must not run directly in the browser, because that would expose `OPENAI_API_KEY`. The OpenAI call belongs in the Cloudflare Worker, which is the Web AR app backend and can keep the secret server-side.

## User Flow

The home screen keeps the existing buttons: Camera, AR View, and Full Flow.

Camera page:

1. User opens Camera.
2. Camera starts fullscreen.
3. User captures an image.
4. Camera stops and the still image is shown.
5. The app shows an optional target object text input, such as `laptop`.
6. User may leave the target object empty to extract the main object.
7. User clicks Generate 3D.
8. Worker starts an async generation job.
9. The page reports that generation is running in the background.
10. When complete, the generated model appears in the AR View dropdown.

Full Flow page:

1. User opens Full Flow.
2. Camera starts fullscreen.
3. User captures an image.
4. Camera stops and the still image is shown.
5. The app shows an optional target object text input, such as `laptop`.
6. User may leave the target object empty to extract the main object.
7. User clicks Generate and Place.
8. Worker starts the async extraction and 3D generation job.
9. The browser polls the Worker status endpoint and keeps showing loading until the GLB is ready or an error occurs.
10. When complete, the app loads the generated GLB and shows: `You can place the object now.`
11. User starts AR and places the generated model.

AR View page:

1. User opens AR View.
2. The generated models list is fetched from the Worker.
3. Any completed generated model appears in the dropdown along with built-in models.
4. User selects a generated model and places it normally.

## Prompt Behavior

The Worker will use the same prompt shape as `D:\Github-Projects\Modal-Apps\llm-inference-typescript\src\inf-gpt-image.ts`.

When the target object is provided, for example `laptop`, the prompt is:

```text
Extract the laptop from the image. Place the laptop in a frontal-side position suitable for 3D generation, and make the background solid pure white. The final output must contain only a single laptop, in high quality (HQ), extremely sharp, with clear details and studio lighting, optimized for 3D reconstruction.
```

When the target object is empty, the prompt is:

```text
Extract the main, most prominent object from the image. Place it in a frontal-side position suitable for 3D generation, and make the background solid pure white. The final output must contain only a single object, in high quality (HQ), extremely sharp, with clear details and studio lighting, optimized for 3D reconstruction.
```

The optional target object is trimmed. Empty or whitespace-only text uses the main-object prompt.

## Architecture

Browser responsibilities:

- Capture the image.
- After capture, show the still image and collect optional target object text.
- Send `image_base64`, `image_mime_type`, and optional `target_object` to the Worker.
- For Camera, start the job and refresh the generated model dropdown later.
- For Full Flow, poll the job until complete, load the returned GLB, and allow placement.

Cloudflare Worker responsibilities:

- Store `OPENAI_API_KEY`, `MODAL_KEY`, and `MODAL_SECRET` as secrets.
- Accept `POST /generate-3d` with image data and optional target object.
- Convert the image to a PNG suitable for OpenAI image editing when needed.
- Call OpenAI image edit with the prompt behavior above.
- Extract the returned image as base64.
- Start the async Trellis Modal job using the extracted image, not the original capture.
- Persist job metadata in R2.
- Poll Modal result endpoints during scheduled cron or explicit job-status requests.
- Store the completed GLB in R2.
- Maintain `models/generated/index.json` for the dropdown.

Modal responsibilities:

- Provide async `start-api` and `result-api` endpoints for `trellis-2-4b-fast`.
- Accept only Trellis generation inputs: `image_base64`, `seed`, `pipeline_type`, `decimation_target`, `texture_size`, `remesh`, `webp`, and `use_bf16`.
- Return a GLB when the async result is complete.
- Do no OpenAI image extraction and require no OpenAI API key.

## Worker Request And Response Contract

`POST /generate-3d` request:

```json
{
  "image_base64": "base64 jpeg or png",
  "image_mime_type": "image/jpeg",
  "target_object": "laptop"
}
```

`target_object` is optional.

Running response:

```json
{
  "job_id": "fc-123",
  "label": "laptop - 2026-06-29 15:30:00 UTC",
  "status": "running",
  "status_url": "https://worker.example/generate-3d/jobs/fc-123"
}
```

When no target object is provided, labels use:

```text
Main object - 2026-06-29 15:30:00 UTC
```

Completed job response:

```json
{
  "id": "fc-123",
  "label": "laptop - 2026-06-29 15:30:00 UTC",
  "status": "completed",
  "model_url": "https://web-ar-generate-model.sshibinthomass.workers.dev/models/generated/capture-20260629-153000-fc-123.glb",
  "object_key": "models/generated/capture-20260629-153000-fc-123.glb",
  "bytes": 123456
}
```

## Configuration

Worker secrets:

- `OPENAI_API_KEY`
- `MODAL_KEY`
- `MODAL_SECRET`

Worker vars:

- `MODAL_IMAGE_TO_3D_URL`
- `MODAL_IMAGE_TO_3D_START_URL`
- `MODAL_IMAGE_TO_3D_RESULT_URL`
- `PUBLIC_MODEL_ORIGIN`

The Modal URLs should point to the async `trellis-2-4b-fast` endpoints, not `openai-to-3d-fast`.

## Error Handling

If OpenAI extraction fails, the Worker job is marked `failed` with an error beginning `OpenAI image extraction failed`.

If Modal job start fails, the Worker job is marked `failed` with an error beginning `Modal job start failed`.

If Modal result polling fails, the Worker job is marked `failed` with an error beginning `Modal job result failed`.

If a job is still running, job status returns HTTP `202` with:

```json
{
  "status": "running"
}
```

Full Flow keeps loading while the status is HTTP `202`. It shows the error message when the final status is failed.

## Testing

Worker tests:

- `POST /generate-3d` forwards optional `target_object` into OpenAI prompt construction.
- Empty target object uses the main-object prompt.
- OpenAI output image base64 is sent to Trellis Modal, not the original capture.
- Started jobs store target-aware labels.
- Completed jobs are written to R2 and included in `/generate-3d/models`.
- Failed OpenAI and failed Modal paths mark jobs failed.

Browser client tests:

- `startGeneratedModelJob` and `generateModelFromImage` include optional `target_object`.
- Full Flow polling still loads the returned GLB.

HUD tests:

- Camera and Full Flow pages render the optional target object input after capture.
- The input can be empty.
- Generation handlers receive the trimmed target object.

Modal tests:

- `trellis-2-4b-fast` exposes async `start-api` and `result-api` endpoint files or route handlers.
- Async Trellis endpoints accept `image_base64` and return GLB bytes through result polling.

## Deployment And Verification

1. Deploy the updated Trellis async Modal app.
2. Set Worker `OPENAI_API_KEY` as a Cloudflare secret.
3. Set Worker Modal URLs to the async Trellis endpoints.
4. Deploy the Worker.
5. Build and test the Web AR app.
6. Publish the branch through GitHub after local tests pass.
7. Verify a real captured image with and without target text.
8. Verify the GLB starts with `glTF`.
9. Verify the generated model appears in the dropdown.
10. Verify Full Flow loads the generated model and allows AR placement.
