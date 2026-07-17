# Automatic Object Segmentation Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically segment the primary object after Photo-to-AR capture and play a 2.5-second mask-clipped reconstruction animation without changing the image used for 3D generation.

**Architecture:** A new lightweight BiRefNet Modal app returns a validated mask result through an authenticated Cloudflare Worker proxy. The browser prepares a 1024-pixel segmentation copy, requests the mask, and hands it to a focused canvas renderer owned by the capture HUD; `WebARApp` coordinates route eligibility, cancellation, and stale-response protection.

**Tech Stack:** Python 3.11, Modal, PyTorch, Transformers, BiRefNet_lite, Pillow, NumPy, SciPy; Cloudflare Workers TypeScript; Vite, Vitest, jsdom, Canvas 2D, CSS.

## Global Constraints

- Run segmentation automatically only after camera capture on `full-flow` and `dynamic`; do not add it to plain Camera or Image Upload.
- Use pinned model `ZhengPeng7/BiRefNet_lite` revision `7838f1c3472f827cd8ce13ab5ccc2ce48077360f` at `1024 x 1024`, FP16, on Modal T4.
- Create the Modal service at `D:\Github-Projects\Modal-Apps\llm-hosting\object-segmentation-birefnet-lite.py` with app name `object-segmentation-birefnet-lite`.
- Follow the existing `hf-hub-cache`, `huggingface-secret`, proxy-auth, `MIN_CONTAINERS = 0`, and `SCALEDOWN_WINDOW = 120` conventions.
- Keep the original `CapturedImage` as the input to all 3D-generation paths.
- Never persist segmentation inputs or masks in R2.
- Never substitute a whole-frame animation when detection is absent, invalid, below confidence `0.65`, or unavailable.
- Keep Generate usable while segmentation and the decorative animation run.
- Respect `prefers-reduced-motion: reduce` with a static outline and no moving scan, grid, or particles.
- Preserve unrelated dirty changes in both repositories; stage or commit only feature-owned files/hunks.
- Do not deploy Modal or the Worker as part of local implementation; deployment changes external state and is a separate explicit action.

---

### Task 1: Lightweight Modal segmentation service

**Files:**
- Create: `D:\Github-Projects\Modal-Apps\llm-hosting\object-segmentation-birefnet-lite.py`
- Create: `D:\Github-Projects\Modal-Apps\tests\test_object_segmentation_birefnet_lite_files.py`

**Interfaces:**
- Consumes: `{ image_base64: string, image_mime_type: "image/jpeg" | "image/png" | "image/webp" }` through a proxy-authenticated POST endpoint.
- Produces: `{"detected": false, "confidence": number}` or `{"detected": true, "mask_base64": string, "mask_mime_type": "image/png", "bounds": {"x": number, "y": number, "width": number, "height": number}, "confidence": number}`.

- [ ] **Step 1: Write static contract and pure mask-selection tests**

Create `tests/test_object_segmentation_birefnet_lite.py`. Parse the hosting file with `ast`, execute only pure constants/functions, and assert the deployment contract plus component selection:

```python
import ast
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
HOST_FILE = ROOT / "llm-hosting" / "object-segmentation-birefnet-lite.py"


def source() -> str:
    return HOST_FILE.read_text(encoding="utf-8")


def load_pure_namespace() -> dict:
    tree = ast.parse(source(), filename=str(HOST_FILE))
    from scipy import ndimage
    namespace = {"np": np, "ndimage": ndimage}
    names = {
        "MIN_COMPONENT_AREA_RATIO",
        "MAX_COMPONENT_AREA_RATIO",
        "MASK_THRESHOLD",
        "select_primary_component",
        "normalized_bounds",
        "segmentation_confidence",
    }
    for node in tree.body:
        node_names = {
            target.id for target in getattr(node, "targets", []) if isinstance(target, ast.Name)
        }
        if isinstance(node, ast.FunctionDef) and node.name in names or node_names & names:
            exec(compile(ast.Module([node], []), str(HOST_FILE), "exec"), namespace)
    return namespace


class ObjectSegmentationBiRefNetLiteTest(unittest.TestCase):
    def test_modal_contract_is_small_pinned_and_authenticated(self):
        text = source()
        self.assertIn('modal.App("object-segmentation-birefnet-lite")', text)
        self.assertIn('MODEL_NAME = "ZhengPeng7/BiRefNet_lite"', text)
        self.assertIn('MODEL_REVISION = "7838f1c3472f827cd8ce13ab5ccc2ce48077360f"', text)
        self.assertIn('GPU = "T4"', text)
        self.assertIn("model.half()", text)
        self.assertIn('requires_proxy_auth=True', text)
        self.assertIn('Volume.from_name("hf-hub-cache"', text)
        self.assertIn("MIN_CONTAINERS = 0", text)
        self.assertIn("SCALEDOWN_WINDOW = 120", text)

    def test_primary_component_prefers_centered_large_object(self):
        ns = load_pure_namespace()
        probabilities = np.zeros((100, 100), dtype=np.float32)
        probabilities[10:40, 2:22] = 0.92
        probabilities[25:80, 30:80] = 0.84
        component = ns["select_primary_component"](probabilities)
        self.assertEqual(component[50, 50], 1)
        self.assertEqual(component[20, 10], 0)

    def test_near_full_frame_and_tiny_masks_are_rejected(self):
        ns = load_pure_namespace()
        tiny = np.zeros((100, 100), dtype=np.float32)
        tiny[49:51, 49:51] = 0.99
        full = np.ones((100, 100), dtype=np.float32)
        self.assertIsNone(ns["select_primary_component"](tiny))
        self.assertIsNone(ns["select_primary_component"](full))

    def test_bounds_are_normalized(self):
        ns = load_pure_namespace()
        mask = np.zeros((100, 200), dtype=np.uint8)
        mask[20:80, 50:150] = 1
        self.assertEqual(ns["normalized_bounds"](mask), {
            "x": 0.25, "y": 0.2, "width": 0.5, "height": 0.6,
        })
```

- [ ] **Step 2: Run the focused test and confirm the missing-file failure**

Run from `D:\Github-Projects\Modal-Apps`:

```powershell
uv run --frozen --with pytest --with scipy pytest tests/test_object_segmentation_birefnet_lite_files.py -q
```

Expected: FAIL because `llm-hosting/object-segmentation-birefnet-lite.py` does not exist.

- [ ] **Step 3: Implement the Modal app and pure post-processing**

Create the host file with these exact public constants and helpers:

```python
APP_NAME = "object-segmentation-birefnet-lite"
GPU = "T4"
MODEL_NAME = "ZhengPeng7/BiRefNet_lite"
MODEL_REVISION = "7838f1c3472f827cd8ce13ab5ccc2ce48077360f"
INPUT_SIZE = 1024
MASK_THRESHOLD = 0.5
MIN_COMPONENT_AREA_RATIO = 0.01
MAX_COMPONENT_AREA_RATIO = 0.92
MIN_CONTAINERS = 0
SCALEDOWN_WINDOW = 120
CACHE_DIR = "/cache"

class SegmentationRequest(BaseModel):
    image_base64: str
    image_mime_type: Literal["image/jpeg", "image/png", "image/webp"]

def select_primary_component(probabilities: np.ndarray) -> np.ndarray | None:
    binary = (probabilities >= MASK_THRESHOLD).astype(np.uint8)
    labels, count = ndimage.label(binary, structure=np.ones((3, 3), dtype=np.uint8))
    height, width = binary.shape
    image_area = float(height * width)
    center = np.array([width / 2.0, height / 2.0], dtype=np.float32)
    max_distance = float(np.linalg.norm(center)) or 1.0
    best_label = None
    best_score = -1.0
    for label in range(1, count + 1):
        component = labels == label
        area = float(component.sum())
        area_ratio = area / image_area
        if not MIN_COMPONENT_AREA_RATIO <= area_ratio <= MAX_COMPONENT_AREA_RATIO:
            continue
        mean_probability = float(probabilities[component].mean())
        centroid_yx = np.array(ndimage.center_of_mass(component), dtype=np.float32)
        centroid = np.array([centroid_yx[1], centroid_yx[0]], dtype=np.float32)
        center_distance = float(np.linalg.norm(centroid - center))
        center_score = 1.0 - min(1.0, center_distance / max_distance)
        score = mean_probability * 0.55 + area_ratio * 0.25 + center_score * 0.20
        if score > best_score:
            best_label, best_score = label, score
    return None if best_label is None else (labels == best_label).astype(np.uint8)

def normalized_bounds(mask: np.ndarray) -> dict[str, float]:
    ys, xs = np.nonzero(mask)
    height, width = mask.shape
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    return {
        "x": x0 / width,
        "y": y0 / height,
        "width": (x1 - x0) / width,
        "height": (y1 - y0) / height,
    }

def segmentation_confidence(probabilities: np.ndarray, mask: np.ndarray) -> float:
    foreground = float(probabilities[mask.astype(bool)].mean())
    background_values = probabilities[~mask.astype(bool)]
    background = float(background_values.mean()) if background_values.size else 1.0
    contrast = max(0.0, foreground - background)
    return float(np.clip(foreground * 0.75 + contrast * 0.25, 0.0, 1.0))
```

Use `scipy.ndimage.label` with 8-connectivity after thresholding and morphological open/close, then rank each eligible component as:

```python
score = mean_probability * 0.55 + area_ratio * 0.25 + center_score * 0.20
```

Reject area ratios outside `[0.01, 0.92]`. Compute confidence as the selected component’s mean foreground probability adjusted by foreground/background contrast and clamp to `[0, 1]`. Feather only the encoded mask with a small Gaussian blur; calculate bounds from the hard component.

Keep runtime dependencies inside the Modal image and do not modify the already-dirty root `pyproject.toml` or `uv.lock`. Use a Python 3.11 image with compatible pins:

```python
runtime_image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "torch==2.5.1",
    "torchvision==0.20.1",
    "transformers==4.57.3",
    "huggingface-hub==0.36.0",
    "accelerate==1.12.0",
    "safetensors==0.6.2",
    "timm==1.0.22",
    "kornia==0.8.1",
    "einops==0.8.1",
    "numpy==1.26.4",
    "scipy==1.14.1",
    "pillow==12.2.0",
    "fastapi[standard]==0.139.0",
    "pydantic==2.13.4",
)
```

Define a `@app.cls` T4 model using the existing cache volume and secret. In `@modal.enter`, load with both `revision=MODEL_REVISION` and `code_revision=MODEL_REVISION`, `trust_remote_code=True`, `use_safetensors=True`, and `cache_dir=CACHE_DIR`; then call `eval().requires_grad_(False).half().to("cuda")`. Inference uses `torch.inference_mode()`, the official ImageNet normalization, and the last sigmoid prediction. The endpoint decodes with strict base64 validation, applies `ImageOps.exif_transpose`, limits accepted decoded input to 5 MiB, and returns `JSONResponse` with the union above. The encoded `L`-mode mask is resized to the EXIF-corrected source dimensions. No image or mask is written to disk or a remote volume.

Add a local entrypoint:

```python
@app.local_entrypoint()
def main(image_path: str, mask_path: str = "object-mask.png", metadata_path: str = "object-mask.json"):
    # run the remote method, save decoded mask only when detected, and save metadata JSON
```

- [ ] **Step 4: Run Modal service tests and syntax validation**

```powershell
uv run --frozen --with pytest --with scipy pytest tests/test_object_segmentation_birefnet_lite_files.py -q
uv run --frozen python -m py_compile llm-hosting/object-segmentation-birefnet-lite.py
```

Expected: all tests PASS and compilation exits 0 without downloading model weights.

- [ ] **Step 5: Record the feature-owned Modal files**

Do not stage the repository’s pre-existing modified or untracked files. Confirm only the two new feature files with:

```powershell
git status --short -- llm-hosting/object-segmentation-birefnet-lite.py tests/test_object_segmentation_birefnet_lite_files.py
```

Expected: exactly two new files.

---

### Task 2: Authenticated Worker segmentation proxy

**Files:**
- Modify: `D:\Github-Projects\Web-AR\worker\src\index.ts`
- Modify: `D:\Github-Projects\Web-AR\tests\worker\generateModelWorker.test.ts`
- Modify: `D:\Github-Projects\Web-AR\wrangler.jsonc`

**Interfaces:**
- Consumes: Modal JSON union from Task 1 via `env.MODAL_OBJECT_SEGMENTATION_URL`.
- Produces: authenticated `POST /segment-image` with the same validated JSON union; never invokes `MODEL_BUCKET.put`.

- [ ] **Step 1: Add failing Worker route tests**

Extend `createEnv()` with:

```ts
MODAL_OBJECT_SEGMENTATION_URL: 'https://modal.example/segment',
```

Add focused cases that create an approved user token using the existing auth helpers, then assert:

```ts
const response = await handleGenerateModelRequest(
  new Request('https://worker.example/segment-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ image_base64: 'aGVsbG8=', image_mime_type: 'image/jpeg' }),
  }),
  env,
  { fetch: modalFetch, now: () => new Date('2026-07-17T12:00:00Z') },
);

expect(modalFetch).toHaveBeenCalledWith('https://modal.example/segment', expect.objectContaining({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Modal-Key': 'modal-key',
    'Modal-Secret': 'modal-secret',
  },
}));
expect(await response.json()).toEqual({
  detected: true,
  mask_base64: 'bWFzaw==',
  mask_mime_type: 'image/png',
  bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
  confidence: 0.91,
});
expect(env.MODEL_BUCKET.put).not.toHaveBeenCalled();
```

Cover unauthenticated `401`, invalid MIME `400`, empty/invalid/oversized base64 `400`, missing endpoint `503`, explicit `detected:false`, malformed Modal success `502`, upstream non-success `502`, and abort/timeout `504`.

- [ ] **Step 2: Run the route tests and verify they fail**

```powershell
npx vitest run tests/worker/generateModelWorker.test.ts -t "segment-image"
```

Expected: FAIL with `404` or missing `MODAL_OBJECT_SEGMENTATION_URL` typing.

- [ ] **Step 3: Implement routing, validation, proxying, and timeout mapping**

Add to `WorkerEnv`:

```ts
MODAL_OBJECT_SEGMENTATION_URL?: string;
```

Add `/segment-image` to the known POST paths, but branch to `handleObjectSegmentationRequest()` immediately after `requireApprovedUser()` and before generation-pipeline environment validation.

Use these types and constants:

```ts
interface SegmentationResponseBody {
  detected?: unknown;
  mask_base64?: unknown;
  mask_mime_type?: unknown;
  bounds?: unknown;
  confidence?: unknown;
}

const maxSegmentationImageBytes = 5 * 1024 * 1024;
const segmentationTimeoutMs = 60_000;
const allowedSegmentationMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
```

`handleObjectSegmentationRequest()` must:

1. Return `503` when the Modal URL is absent.
2. Parse JSON and validate exact MIME type, canonical base64, and estimated decoded size.
3. Forward only `image_base64` and `image_mime_type` with Modal proxy headers.
4. Abort after 60 seconds to accommodate a scale-to-zero Modal cold start and return `504` for `AbortError`.
5. Return `502` for network/upstream failures or malformed JSON.
6. Accept `detected:false` only with finite confidence in `[0,1]`.
7. Accept `detected:true` only with non-empty base64 PNG mask, finite confidence, and finite normalized positive bounds fully contained in `[0,1]`.
8. Return a newly constructed JSON object rather than blindly forwarding upstream fields.

- [ ] **Step 4: Add the non-secret Wrangler endpoint variable**

Add a documented empty development value rather than inventing a production endpoint:

```json
"MODAL_OBJECT_SEGMENTATION_URL": ""
```

The service remains a safe fallback until the separately authorized Modal deployment provides its actual URL.

- [ ] **Step 5: Run focused and full Worker tests**

```powershell
npx vitest run tests/worker/generateModelWorker.test.ts -t "segment-image"
npx vitest run tests/worker/generateModelWorker.test.ts
```

Expected: focused and full Worker suites PASS, including the user’s pre-existing local-CORS tests.

---

### Task 3: Typed browser client and lightweight request image

**Files:**
- Create: `D:\Github-Projects\Web-AR\src\services\objectSegmentationClient.ts`
- Create: `D:\Github-Projects\Web-AR\tests\services\objectSegmentationClient.test.ts`
- Create: `D:\Github-Projects\Web-AR\src\capture\segmentationImage.ts`
- Create: `D:\Github-Projects\Web-AR\tests\capture\segmentationImage.test.ts`
- Modify: `D:\Github-Projects\Web-AR\.env.example`
- Modify: `D:\Github-Projects\Web-AR\src\vite-env.d.ts`

**Interfaces:**
- Produces: `segmentObject(input: SegmentObjectInput): Promise<ObjectSegmentationResult>` and a 1024-pixel compressed image payload.
- Consumed by: Task 6 orchestration.

- [ ] **Step 1: Write failing client contract tests**

Define the expected public types in the test:

```ts
type ObjectBounds = { x: number; y: number; width: number; height: number };
type ObjectSegmentationResult =
  | { detected: false; confidence: number }
  | { detected: true; confidence: number; maskBase64: string; maskMimeType: 'image/png'; bounds: ObjectBounds };
```

Assert that `segmentObject()` changes `https://worker.example/generate-3d` to `https://worker.example/segment-image`, forwards bearer auth and `AbortSignal`, maps snake_case fields, rejects malformed bounds/mask/confidence, preserves explicit no-object responses, and surfaces Worker error text.

- [ ] **Step 2: Run the client test and verify the missing-module failure**

```powershell
npx vitest run tests/services/objectSegmentationClient.test.ts
```

Expected: FAIL because `objectSegmentationClient.ts` does not exist.

- [ ] **Step 3: Implement the typed client**

Create:

```ts
export const OBJECT_SEGMENTATION_CONFIDENCE_THRESHOLD = 0.65;

export interface SegmentObjectInput {
  apiUrl: string;
  imageBase64: string;
  imageMimeType: string;
  authToken?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export type ObjectSegmentationResult =
  | { detected: false; confidence: number }
  | {
      detected: true;
      confidence: number;
      maskBase64: string;
      maskMimeType: 'image/png';
      bounds: { x: number; y: number; width: number; height: number };
    };

export async function segmentObject({
  apiUrl,
  imageBase64,
  imageMimeType,
  authToken,
  signal,
  fetchImpl = fetch,
}: SegmentObjectInput): Promise<ObjectSegmentationResult> {
  if (!apiUrl) throw new Error('Worker API URL is not configured.');
  const response = await fetchImpl(apiUrl.replace(/\/+$/, '').replace(/\/generate-3d$/, '/segment-image'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ image_base64: imageBase64, image_mime_type: imageMimeType }),
    signal,
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : `Object segmentation failed with HTTP ${response.status}.`);
  }
  const confidence = body.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Worker returned an invalid segmentation confidence.');
  }
  if (body.detected === false || confidence < OBJECT_SEGMENTATION_CONFIDENCE_THRESHOLD) {
    return { detected: false, confidence };
  }
  if (body.detected !== true || typeof body.mask_base64 !== 'string' || !body.mask_base64
      || body.mask_mime_type !== 'image/png' || !isObjectBounds(body.bounds)) {
    throw new Error('Worker returned an invalid object segmentation mask.');
  }
  return {
    detected: true,
    confidence,
    maskBase64: body.mask_base64,
    maskMimeType: 'image/png',
    bounds: body.bounds,
  };
}

function isObjectBounds(value: unknown): value is ObjectBounds {
  if (!value || typeof value !== 'object') return false;
  const bounds = value as Record<string, unknown>;
  const x = bounds.x;
  const y = bounds.y;
  const width = bounds.width;
  const height = bounds.height;
  return [x, y, width, height].every((part) => typeof part === 'number' && Number.isFinite(part))
    && (x as number) >= 0
    && (y as number) >= 0
    && (width as number) > 0
    && (height as number) > 0
    && (x as number) + (width as number) <= 1
    && (y as number) + (height as number) <= 1;
}
```

Perform independent runtime validation even though the Worker validates. `detected:true` below `0.65` maps to `{ detected:false, confidence }`, ensuring the renderer can never receive a low-confidence mask.

- [ ] **Step 4: Add a focused segmentation-image compressor**

Create `prepareSegmentationImage(blob, options)` in its own module so thumbnail semantics remain unchanged. Export:

```ts
export interface PreparedSegmentationImage {
  imageBase64: string;
  imageMimeType: string;
  width: number;
  height: number;
  bytes: number;
}

export const DEFAULT_SEGMENTATION_MAX_DIMENSION = 1024;
export const DEFAULT_SEGMENTATION_IMAGE_MIME_TYPE = 'image/webp';

export async function prepareSegmentationImage(
  blob: Blob,
  options: SegmentationImageOptions = {},
): Promise<PreparedSegmentationImage>;
```

Follow the existing thumbnail compressor’s injectable bitmap/canvas pattern, but use defaults `1024`, WebP, and `0.82`. Assert a `1600 x 900` source becomes `1024 x 576`, the bitmap is closed, WebP falls back to JPEG if the first `toBlob` returns `null`, and the input blob remains unchanged.

- [ ] **Step 5: Add the frontend feature flag typing and example**

Append:

```dotenv
VITE_OBJECT_SEGMENTATION_ENABLED=true
```

Declare `readonly VITE_OBJECT_SEGMENTATION_ENABLED?: string` in `ImportMetaEnv`. Task 6 treats only the exact string `"true"` as enabled.

- [ ] **Step 6: Run client and compression tests**

```powershell
npx vitest run tests/services/objectSegmentationClient.test.ts tests/capture/segmentationImage.test.ts
```

Expected: PASS.

---

### Task 4: Isolated mask-clipped canvas renderer

**Files:**
- Create: `D:\Github-Projects\Web-AR\src\ui\ObjectReconstructionOverlay.ts`
- Create: `D:\Github-Projects\Web-AR\tests\ui\ObjectReconstructionOverlay.test.ts`

**Interfaces:**
- Consumes: preview `HTMLImageElement`, mask data URL, normalized bounds, duration, and reduced-motion boolean.
- Produces: `play(options): Promise<void>` plus idempotent `cancel()`/`dispose()` lifecycle.

- [ ] **Step 1: Write failing geometry and lifecycle tests**

Test exported pure geometry:

```ts
expect(computeCoverRect(1600, 900, 300, 300)).toEqual({
  x: -116.66666666666669,
  y: 0,
  width: 533.3333333333334,
  height: 300,
});
```

With injected `requestAnimationFrame`, `cancelAnimationFrame`, `matchMedia`, image loader, canvas factory, and clock, assert:

- `play()` creates one decorative `canvas` with `aria-hidden="true"`;
- animated mode schedules frames and uses `destination-in` when compositing the effect layer;
- elapsed 2500 ms resolves and removes the canvas;
- reduced motion draws one static outline, schedules no moving frames, and resolves after a short static display;
- `cancel()` cancels the frame and resolves the pending play without leaving DOM nodes.

- [ ] **Step 2: Run the renderer tests and verify the missing-module failure**

```powershell
npx vitest run tests/ui/ObjectReconstructionOverlay.test.ts
```

Expected: FAIL because the renderer module is missing.

- [ ] **Step 3: Implement renderer geometry and dependency injection**

Expose:

```ts
export interface ReconstructionPlayback {
  maskUrl: string;
  bounds: ObjectBounds;
  durationMs?: number;
  reducedMotion?: boolean;
}

export class ObjectReconstructionOverlay {
  constructor(host: HTMLElement, preview: HTMLImageElement, dependencies: OverlayDependencies = {})
  play(options: ReconstructionPlayback): Promise<void>
  cancel(): void
  dispose(): void
}
```

`computeCoverRect()` must exactly mirror `object-fit: cover`. Cap backing resolution at device-pixel ratio 2. Use a main display canvas plus in-memory mask/effect canvases. Each animated frame:

1. dims the canvas lightly;
2. cuts the object region back out of the dim layer;
3. draws cyan/gold edge glow;
4. draws a moving scan band and grid into the effect canvas;
5. clips the effect with `globalCompositeOperation = 'destination-in'` and the aligned mask;
6. draws deterministic particles seeded from mask-boundary samples;
7. fades the overlay during the final 20%.

Always restore composite state. If mask loading, canvas context creation, or playback fails, cancel and reject so orchestration can fall back safely.

- [ ] **Step 4: Run renderer tests**

```powershell
npx vitest run tests/ui/ObjectReconstructionOverlay.test.ts
```

Expected: PASS without a real browser canvas.

---

### Task 5: HUD states, preview layering, and accessible styling

**Files:**
- Modify: `D:\Github-Projects\Web-AR\src\ui\routes.ts`
- Modify: `D:\Github-Projects\Web-AR\src\ui\ARHud.ts`
- Modify: `D:\Github-Projects\Web-AR\src\styles.css`
- Modify: `D:\Github-Projects\Web-AR\tests\ui\ARHud.test.ts`
- Modify: `D:\Github-Projects\Web-AR\tests\ui\styles.test.ts`

**Interfaces:**
- Produces: route-aware capture callback and HUD methods `showObjectSegmentationPending()`, `playObjectReconstruction()`, `showObjectSegmentationFallback()`, and `clearObjectReconstruction()`.
- Consumed by: Task 6.

- [ ] **Step 1: Write failing route and HUD-state tests**

Change the handler contract to:

```ts
onCaptureImage(route: 'camera' | 'full-flow' | 'dynamic'): void;
```

Export `CameraCaptureRoute`, `PhotoToARRoute`, `isCameraCaptureRoute()`, and `isPhotoToARRoute()` from `routes.ts`; add route-matrix tests in `tests/ui/routes.test.ts`. Use the guards instead of duplicating string checks in the HUD and app.

Assert Capture passes the active route. After `showCapturedImagePreview()`:

```ts
hud.showObjectSegmentationPending();
expect(root.querySelector('.camera-status')?.textContent).toBe('Finding the main object…');
expect(generateButton.disabled).toBe(false);
```

Mock the overlay class and assert `playObjectReconstruction(maskUrl, bounds)` delegates with duration `2500`, clears pending styling, and restores the route-specific ready message. Assert fallback restores ready state without calling playback; live preview, route exit, new captured preview, extraction, and generation loading call `clearObjectReconstruction()`.

- [ ] **Step 2: Run focused HUD tests and verify failure**

```powershell
npx vitest run tests/ui/ARHud.test.ts -t "object segmentation|capture route"
```

Expected: FAIL because methods and route argument are absent.

- [ ] **Step 3: Add HUD overlay ownership and state methods**

In the camera stage markup, wrap video/image/drop zones in or add a `.camera-media-layer` occupying creation-stage row 2 so the image and canvas share identical bounds. Instantiate one `ObjectReconstructionOverlay` with that layer and `cameraPreviewImage`.

Use these public methods:

```ts
showObjectSegmentationPending(): void;
playObjectReconstruction(maskUrl: string, bounds: ObjectBounds): Promise<void>;
showObjectSegmentationFallback(): void;
clearObjectReconstruction(): void;
```

Keep Generate enabled during pending/playback. Centralize captured-ready copy in `capturedImageReadyMessage()` so fallback, successful playback, and the initial captured preview cannot drift. `handleCaptureClick()` passes only `camera`, `full-flow`, or `dynamic`, defaulting to `camera` defensively.

- [ ] **Step 4: Add responsive and reduced-motion CSS**

Add stable selectors:

```css
.camera-media-layer {
  position: relative;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--radius-control);
}

.camera-media-layer > .camera-preview,
.object-reconstruction-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.object-reconstruction-overlay {
  z-index: 2;
  pointer-events: none;
}
```

Update existing direct-child `.creation-stage .camera-preview` rules to the media layer without changing upload drop-zone layout. Add a pending-state class with a restrained static border pulse, disabled under `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Run HUD and style tests**

```powershell
npx vitest run tests/ui/routes.test.ts tests/ui/ARHud.test.ts tests/ui/styles.test.ts
```

Expected: PASS.

---

### Task 6: Capture orchestration, cancellation, and stale-response safety

**Files:**
- Modify: `D:\Github-Projects\Web-AR\src\app\WebARApp.ts`
- Create: `D:\Github-Projects\Web-AR\tests\app\WebARAppSegmentation.test.ts`
- Modify: `D:\Github-Projects\Web-AR\tests\app\WebARApp.test.ts`

**Interfaces:**
- Consumes: `segmentObject`, `prepareSegmentationImage`, route-aware capture callbacks, and HUD methods from Tasks 3–5.
- Produces: automatic segmentation lifecycle limited to Photo-to-AR routes.

- [ ] **Step 1: Mock the client/compressor and write failing orchestration tests**

Add module mocks for `objectSegmentationClient` and `thumbnailCompression`. Build a small test app with mocked HUD, camera preview, auth token, and capture result. Cover:

1. `captureImage('full-flow')` and `captureImage('dynamic')` call segmentation automatically.
2. `captureImage('camera')` never compresses or segments.
3. The request uses the compressed 1024-pixel payload, Worker API URL, auth token, and an abort signal.
4. `detected:true` creates a `data:image/png;base64,` URL followed by the returned mask data and calls playback.
5. `detected:false`, low confidence (defended again), compression failure, request failure, and playback failure all call fallback while retaining `capturedImage`.
6. A second capture aborts the first request and ignores the first response.
7. route cleanup and generation clear/abort the overlay and pending request.
8. the `CapturedImage.imageBase64` passed to Full Flow/Dynamic generation remains the original, not the compressed segmentation copy.
9. Full Flow/Dynamic handlers snapshot the captured image before HUD navigation triggers route cleanup.

- [ ] **Step 2: Run focused app tests and verify failure**

```powershell
npx vitest run tests/app/WebARAppSegmentation.test.ts
```

Expected: FAIL because capture does not accept a route or start segmentation.

- [ ] **Step 3: Implement route-aware capture and segmentation lifecycle**

Add fields:

```ts
private objectSegmentationController: AbortController | null = null;
private objectSegmentationToken = 0;
```

Change `captureImage` to accept the route. Preserve capture, camera stop, and preview behavior, then fire segmentation only when:

```ts
const shouldSegment =
  import.meta.env.VITE_OBJECT_SEGMENTATION_ENABLED === 'true'
  && (route === 'full-flow' || route === 'dynamic');
```

Add:

```ts
private async segmentCapturedObject(capturedImage: CapturedImage): Promise<void>;
private cancelObjectSegmentation(): void;
```

`segmentCapturedObject()` increments the token, cancels the previous controller, keeps Generate enabled through `showObjectSegmentationPending()`, calls `prepareSegmentationImage()`, requests the Worker, verifies token/controller/captured-image identity after every await, and either plays or falls back. Treat `AbortError` as silent cancellation. Other errors log one warning without image data and fall back.

Call `cancelObjectSegmentation()` plus `hud.clearObjectReconstruction()` from live-camera restart, preview clearing, transient route reset, Full Flow/Dynamic generation start, and any path replacing the captured image.

Fix the existing Full Flow/Dynamic ordering hazard in `ARHud.handleGenerateClick()`: invoke `onFullFlowCapture` or `onDynamicFlowCapture` first so the async handler synchronously snapshots the original `CapturedImage`, then navigate to `ar`. Add a regression test proving route cleanup cannot erase the capture before generation consumes it.

- [ ] **Step 4: Run app orchestration and regression tests**

```powershell
npx vitest run tests/app/WebARAppSegmentation.test.ts tests/app/WebARApp.test.ts
npx vitest run tests/ui/ARHud.test.ts tests/services/objectSegmentationClient.test.ts
```

Expected: PASS.

---

### Task 7: Cross-repository verification and handoff

**Files:**
- Modify: `D:\Github-Projects\Web-AR\README.md`
- Verify only: all feature files from Tasks 1–6

**Interfaces:**
- Produces: deploy-ready local implementation and exact operational handoff without performing an external deployment.

- [ ] **Step 1: Document configuration and deployment commands**

Add a short README section naming the pinned model, feature flag, Worker variable, privacy behavior, and commands:

```powershell
cd D:\Github-Projects\Modal-Apps
uv run modal deploy llm-hosting/object-segmentation-birefnet-lite.py

cd D:\Github-Projects\Web-AR
npx wrangler secret put MODAL_KEY
npx wrangler secret put MODAL_SECRET
npx wrangler deploy
```

State that `MODAL_OBJECT_SEGMENTATION_URL` must be set to the deployed proxy-authenticated Modal endpoint before Worker deployment. Do not claim the endpoint is live.

- [ ] **Step 2: Run Modal repository verification**

```powershell
cd D:\Github-Projects\Modal-Apps
uv run --frozen --with pytest --with scipy pytest tests/test_object_segmentation_birefnet_lite_files.py -q
uv run --frozen python -m py_compile llm-hosting/object-segmentation-birefnet-lite.py
```

Expected: PASS and exit 0.

- [ ] **Step 3: Run Web-AR focused verification**

```powershell
cd D:\Github-Projects\Web-AR
npx vitest run tests/capture/segmentationImage.test.ts tests/services/objectSegmentationClient.test.ts tests/ui/ObjectReconstructionOverlay.test.ts tests/app/WebARAppSegmentation.test.ts tests/app/WebARApp.test.ts tests/ui/ARHud.test.ts tests/worker/generateModelWorker.test.ts
npm run build
```

Expected: all tests PASS; TypeScript and Vite build exit 0.

- [ ] **Step 4: Run the complete Web-AR suite**

```powershell
npm test
```

Expected: every suite PASS. If a pre-existing unrelated test fails, capture the exact failure and prove the focused feature suites still pass; do not modify unrelated behavior.

- [ ] **Step 5: Perform a local visual check without production deployment**

Start Vite and a local Worker or use a test-only mocked `/segment-image` response. Verify at mobile and desktop widths:

- plain Camera capture has no segmentation call;
- Photo to AR automatically shows “Finding the main object…”;
- only the supplied masked object receives moving scan/grid/glow;
- background remains stable apart from restrained dimming;
- Generate stays enabled;
- route exit and retake remove the canvas;
- reduced-motion mode shows only a static outline;
- low-confidence response shows the ordinary captured preview.

- [ ] **Step 6: Review final diffs and preserve unrelated work**

```powershell
git -C D:\Github-Projects\Web-AR diff --check
git -C D:\Github-Projects\Web-AR status --short
git -C D:\Github-Projects\Modal-Apps status --short
```

Expected: no whitespace errors. Explicitly separate feature files/hunks from the pre-existing changes in `worker/src/index.ts`, `tests/worker/generateModelWorker.test.ts`, and the dirty Modal repository before any optional staging or commit.
