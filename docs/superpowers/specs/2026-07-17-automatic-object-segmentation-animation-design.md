# Automatic Object Segmentation Animation Design

**Date:** 2026-07-17

## 1. Goal

After a user captures a photo in Photo to AR or AI Photo to AR, WebXRify automatically identifies the primary object and plays a short reconstruction animation only over that object. The background remains visually stable. The interaction requires no tap, manual outline, or object-name input.

The first release uses segmentation only to drive the transition animation. It does not change the image sent to the existing 3D-generation pipeline.

## 2. Success Criteria

- Segmentation starts automatically after a successful camera capture.
- One primary foreground object is selected without user input.
- Scan, edge glow, grid, and particle effects are clipped to the returned object mask.
- The effect never expands to the full photograph when segmentation fails.
- The captured-image preview and existing Generate action remain available after the transition.
- Camera capture, model generation, and route behavior remain unchanged outside the added preprocessing state.
- The experience works on supported mobile browsers without requiring client-side machine-learning execution.

## 3. Scope

### Included

- An authenticated Cloudflare Worker endpoint for segmentation.
- A Modal GPU endpoint that produces an automatic foreground mask.
- A typed browser client for requesting segmentation.
- A canvas-based, mask-clipped reconstruction animation.
- Loading, success, low-confidence, error, cancellation, and reduced-motion behavior.
- Automated tests for the client contract, Worker route, UI state transitions, mask selection rules, and cleanup.

### Excluded

- User-assisted tapping, outlining, or correction.
- Multi-object selection.
- Sending the segmented cutout to the 3D model generator.
- Persisting captured photos or segmentation masks in R2.
- Real geometric wireframes derived from the final GLB.
- Changes to the Modal 3D-generation jobs.

## 4. User Experience

### 4.1 Capture and detection

1. The user captures a photo through Photo to AR or AI Photo to AR.
2. The camera frame freezes and becomes the captured-image preview.
3. The preview enters a non-blocking `segmenting` state with the message “Finding the main object…”.
4. The browser sends the captured image to the Worker segmentation endpoint.
5. While the request is pending, the captured photo remains visible without a full-frame reconstruction effect.

### 4.2 Object reconstruction animation

When the response is valid and its confidence meets the initial `0.65` threshold, the preview plays a short sequence:

1. The area outside the mask dims slightly.
2. A scan band moves through the object's normalized bounds.
3. A luminous edge follows the mask boundary.
4. A restrained grid and small particles appear only inside or immediately along the mask.
5. The layers fade away, returning to the ordinary captured-image preview.

The sequence lasts 2.5 seconds. It is decorative and must not delay access to Generate once segmentation has completed. The status message changes to the normal captured-image-ready message when the sequence starts.

### 4.3 Failure and accessibility behavior

- If the Worker returns low confidence, no usable mask, an unsupported response, or an error, the animation is skipped and the normal captured-image preview is shown.
- The app must not substitute a whole-frame mask.
- Failure is recoverable and does not discard the captured image or disable Generate.
- If `prefers-reduced-motion: reduce` is active, show a brief static object outline instead of moving scan, grid, or particle effects.
- The animation canvas is decorative and hidden from assistive technology. Status changes continue through the existing polite live region.
- Navigating away, retaking the photo, or destroying the app cancels or invalidates the pending request and removes animation resources.

## 5. Architecture

### 5.1 Browser

Add a segmentation client beside `generatedModelClient.ts`. It accepts the Worker API base URL, image data, MIME type, auth token, optional abort signal, and injectable `fetch` implementation. It returns a typed mask result.

Add a focused reconstruction-overlay component owned by the camera preview. It receives:

- the captured image element;
- a decoded mask image;
- normalized object bounds;
- reduced-motion preference;
- a completion callback.

The overlay owns its canvas, animation frame, decoded image resources, and cleanup. `ARHud` controls the visible state and status copy; `WebARApp` coordinates capture, request cancellation, and result delivery.

### 5.2 Cloudflare Worker

Add `POST /segment-image` to the existing Worker. The route uses the same authentication and CORS rules as the current image-generation routes. It validates MIME type and encoded-image size before forwarding the image to Modal.

The Worker forwards only the data needed for the request and returns the validated Modal result. The route does not write the source image or mask to R2. Modal errors and timeouts become stable JSON error responses without exposing credentials or upstream internals.

Add `MODAL_OBJECT_SEGMENTATION_URL` as a Worker environment variable. Modal credentials continue to use the existing `Modal-Key` and `Modal-Secret` headers. The browser uses an initial confidence threshold of `0.65`; changing it requires an application release so client behavior remains deterministic and testable.

### 5.3 Modal segmentation service

Deploy a dedicated Modal function in `D:\Github-Projects\Modal-Apps\llm-hosting\object-segmentation-birefnet-lite.py`. It follows the hosting, cache-volume, proxy-authentication, T4 GPU, local-entrypoint, and warm-container conventions already used by `rmbg-2-0.py` in that repository.

The service uses the official `ZhengPeng7/BiRefNet_lite` checkpoint. This is the 44.4-million-parameter, Swin-T-backed BiRefNet variant released under the MIT license. The production image pins the exact Hugging Face model revision, loads safetensors at container startup, runs inference in FP16 on a Modal T4, and uses a `1024 x 1024` inference tensor. The full-size BiRefNet and 2K lite checkpoint are excluded because this transition favors response time and container size over high-resolution matting detail.

The container preloads the model, decodes the supplied image, applies EXIF orientation, converts it to RGB, and prepares the documented `1024 x 1024` normalized input. It then:

1. produces foreground probability data;
2. thresholds the probability map;
3. identifies connected components;
4. removes components below the minimum relative area;
5. ranks remaining components using confidence, relative area, and distance from the image center;
6. keeps exactly one primary component;
7. fills small holes and lightly feathers the boundary;
8. encodes the final single-channel mask as PNG;
9. calculates normalized object bounds and aggregate confidence.

The service handles one image per request and does not persist inputs or outputs.

The Modal app is named `object-segmentation-birefnet-lite`. It uses the existing `hf-hub-cache` volume, `huggingface-secret`, `requires_proxy_auth=True`, `MIN_CONTAINERS = 0`, and `SCALEDOWN_WINDOW = 120` defaults. The first implementation benchmarks cold start and warm inference on T4; these container settings change only if measured user-visible latency requires a warm instance.

## 6. API Contract

### Request

`POST /segment-image`

```json
{
  "image_base64": "<base64 without a data URL prefix>",
  "image_mime_type": "image/jpeg"
}
```

Allowed MIME types match camera and upload image support: JPEG, PNG, and WebP. Authentication is supplied through the existing bearer-token mechanism.

### Successful detection response

```json
{
  "detected": true,
  "mask_base64": "<base64 PNG>",
  "mask_mime_type": "image/png",
  "bounds": {
    "x": 0.18,
    "y": 0.12,
    "width": 0.64,
    "height": 0.73
  },
  "confidence": 0.94
}
```

Bounds are normalized to the EXIF-corrected source image, use a top-left origin, and must remain within `[0, 1]`. The mask dimensions must match the corrected source-image aspect ratio; the frontend scales the mask to the rendered preview.

### No-object response

If the service cannot produce a suitable primary component, the request still succeeds but explicitly reports that no mask was detected:

```json
{
  "detected": false,
  "confidence": 0.31
}
```

Successful detection responses include `"detected": true`. The Worker never returns mask fields when `detected` is false. The browser also treats a detected response below the `0.65` client threshold as a no-object result.

### Error response

```json
{
  "error": "Object segmentation failed."
}
```

The Worker uses existing JSON error conventions. Validation errors return `400`, authentication errors retain the existing auth status, unsupported methods return `405`, upstream unavailability returns `502`, and request timeout returns `504`.

## 7. State and Data Flow

The capture flow gains four internal presentation states:

- `idle`: live camera or no captured image;
- `segmenting`: captured image visible and request pending;
- `animating`: valid mask received and overlay playing;
- `ready`: ordinary captured preview with generation available.

`captureImage()` still creates and stores the original `CapturedImage`. It then displays that preview, invalidates any older segmentation request, and starts segmentation for the new capture. A monotonically increasing capture token prevents stale responses from affecting a newer capture even if cancellation races.

The segmentation result is ephemeral. It is retained only until the animation completes or the capture is cleared. The original `CapturedImage` continues to be used by Generate, Full Flow, or Dynamic Flow exactly as before.

## 8. Rendering Design

The overlay uses one canvas positioned over the captured-image preview. Canvas dimensions follow the rendered preview and device pixel ratio within a capped resolution. The renderer maps the mask through the same `object-fit: cover` crop used by the image so the effect stays aligned at different viewport sizes.

Each frame composites effects into an offscreen layer, applies the decoded mask with `destination-in`, then draws the clipped result over the photo. A mask-derived edge layer provides the outline. Sparse particles are seeded once from boundary samples so their positions remain stable instead of flickering.

The renderer must pause or cancel when hidden, removed, superseded, or complete. It must release animation frames, event listeners, canvas references, and temporary object URLs during cleanup.

## 9. Performance and Privacy

- Compress or resize the segmentation request independently of the original generation image, targeting a maximum long edge suitable for mask inference.
- Enforce request-size limits in both the client and Worker.
- Preload pinned `ZhengPeng7/BiRefNet_lite` weights in the Modal container and cache them in the existing `hf-hub-cache` volume.
- Start with the repository convention of zero minimum containers and a 120-second scaledown window; configure warm capacity only after measuring real traffic and cold-start cost.
- Cap canvas backing resolution to avoid excessive memory use on high-density mobile displays.
- Do not log image payloads, masks, or full authorization headers.
- Do not store the source photo or returned mask in R2 for this feature.
- Record only non-sensitive operational metrics such as duration, response status, confidence bucket, and fallback count.

## 10. Testing

### Browser client

- Builds the correct `/segment-image` URL and authenticated request.
- Validates mask MIME type, base64 content, bounds, and confidence.
- Converts non-success responses into stable errors.
- Supports cancellation.

### Worker

- Requires authentication and accepted image MIME types.
- Rejects empty and oversized images.
- Forwards the correct Modal headers and request body.
- Validates normalized bounds, confidence, and PNG mask fields.
- Maps timeout and upstream failures correctly.
- Does not write segmentation requests or results to R2.

### UI and orchestration

- Capture starts segmentation automatically on the two Photo-to-AR routes.
- A successful result transitions `segmenting -> animating -> ready`.
- Low confidence and errors transition directly to `ready` without a full-frame effect.
- Generate uses the original captured image.
- Retake and route exit invalidate stale responses and clean up the renderer.
- The mask remains aligned with a cover-cropped preview on mobile and desktop aspect ratios.
- Reduced motion replaces the moving sequence with a static outline.

### Modal service

- Unit tests cover component ranking, minimum-area removal, bounds, and mask encoding.
- A local entrypoint accepts an image path and writes both the mask and JSON metadata for manual inspection.
- Deployment verification exercises the proxy-authenticated endpoint on a Modal T4 and records cold-start and warm-inference duration.
- A fixed evaluation set covers centered products, off-center products, furniture, vehicles, multiple visible objects, clutter, low contrast, and no-object photos.
- Release acceptance requires that no-object and low-confidence cases return the explicit no-object response rather than a full-frame mask.

## 11. Rollout

Ship behind a frontend feature flag and a configured `MODAL_OBJECT_SEGMENTATION_URL`. If the flag or endpoint is absent, capture proceeds directly to the existing ready preview. Enable first in development, then production for a limited percentage of sessions while measuring latency, segmentation fallback rate, animation completion, and generation conversion. The feature can be disabled without affecting capture or 3D generation.
