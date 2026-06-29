# GPT Extract To Async 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved flow where capture happens first, optional target text is collected after capture, OpenAI image extraction runs in the Cloudflare Worker, async Trellis Modal creates the GLB, and the existing dropdown and Full Flow placement paths consume the stored model.

**Architecture:** The browser sends captured image data and optional `target_object` to the Worker. The Worker creates an OpenAI image-edit job synchronously inside job startup, sends the extracted base64 image to async Trellis Modal, persists job metadata in R2, and later stores the completed GLB. Modal only exposes async Trellis `start_api` and `result_api`; it does not call OpenAI.

**Tech Stack:** Vite, TypeScript, Vitest, Cloudflare Workers, R2, Wrangler, Python Modal, TRELLIS.2, OpenAI Images Edit API, PowerShell.

## Global Constraints

- Work on branch `codex/gpt-object-extraction-flow` in both `D:\Github-Projects\Web-AR` and `D:\Github-Projects\Modal-Apps`.
- Do not print, commit, or copy plaintext `OPENAI_API_KEY`; reuse `D:\Github-Projects\Modal-Apps\.env` only through no-output loading.
- OpenAI image extraction runs in the Cloudflare Worker, not Modal.
- Modal Trellis receives the OpenAI-extracted image only.
- Target object text is optional and is collected after capture.
- Empty or whitespace-only target object text uses the main-object prompt from `inf-gpt-image.ts`.
- Camera generation runs in the background; Full Flow polls until the generated GLB is ready.
- Keep generated models in the existing R2 index and AR dropdown flow.

---

### Task 1: Modal Async Trellis Endpoints

**Files:**
- Modify: `D:\Github-Projects\Modal-Apps\llm-hosting\trellis-2-4b-fast.py`
- Modify: `D:\Github-Projects\Modal-Apps\tests\test_trellis_fast_files.py`

**Interfaces:**
- Consumes: existing `Trellis2FastModel.generate(...) -> bytes`
- Produces: `POST /start-api` returning `{"call_id": string}` and `GET /result-api?call_id=...` returning HTTP `202` while running or GLB bytes when complete.

- [ ] **Step 1: Add failing test for async endpoints**

Add assertions to `test_trellis_fast_files.py` that `trellis-2-4b-fast.py` contains `def start_api`, `def result_api`, `self.generate.spawn`, and `modal.FunctionCall.from_id`.

- [ ] **Step 2: Run Modal fast tests and verify failure**

Run: `uv run python -m unittest tests.test_trellis_fast_files`
Expected before implementation: FAIL because async endpoint strings are missing.

- [ ] **Step 3: Implement async endpoints**

Add `JSONResponse` import and methods matching the proven `openai-to-3d-fast.py` pattern:

```python
@modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
def start_api(self, request: GenerateRequest) -> JSONResponse:
    import base64
    image_bytes = base64.b64decode(request.image_base64)
    call = self.generate.spawn(...)
    return JSONResponse({"call_id": call.object_id})

@modal.fastapi_endpoint(method="GET", requires_proxy_auth=True)
def result_api(self, call_id: str):
    call = modal.FunctionCall.from_id(call_id)
    try:
        glb_bytes = call.get(timeout=0)
    except TimeoutError:
        return JSONResponse({"status": "running"}, status_code=202)
    return Response(content=glb_bytes, media_type="model/gltf-binary")
```

- [ ] **Step 4: Verify Modal fast tests pass**

Run: `uv run python -m unittest tests.test_trellis_fast_files`
Expected: OK.

### Task 2: Worker OpenAI Extraction Pipeline

**Files:**
- Modify: `D:\Github-Projects\Web-AR\worker\src\index.ts`
- Modify: `D:\Github-Projects\Web-AR\tests\worker\generateModelWorker.test.ts`
- Modify: `D:\Github-Projects\Web-AR\wrangler.jsonc`

**Interfaces:**
- Consumes browser body `{ image_base64, image_mime_type, target_object? }`
- Produces target-aware Worker jobs, OpenAI extracted image forwarded to Modal start URL, existing job status/list contracts unchanged.

- [ ] **Step 1: Add failing Worker tests**

Add tests proving `target_object: " laptop "` builds the target-object prompt, empty target uses main-object prompt, OpenAI returned `b64_json` is sent to Modal instead of original image, and labels are target-aware.

- [ ] **Step 2: Run Worker tests and verify failure**

Run: `npm test -- tests/worker/generateModelWorker.test.ts`
Expected before implementation: FAIL because Worker does not call OpenAI or accept `target_object`.

- [ ] **Step 3: Implement Worker extraction**

Add `OPENAI_API_KEY` to `WorkerEnv`; construct `FormData` for `https://api.openai.com/v1/images/edits`; build prompts from the spec; parse `data[0].b64_json` or download `data[0].url`; forward extracted base64 to Modal; store `target_object` in `StoredJob`; format labels as `<target> - timestamp` or `Main object - timestamp`.

- [ ] **Step 4: Point Worker vars to async Trellis fast endpoints**

Update `wrangler.jsonc` Modal URLs to the deployed `trellis-2-4b-fast` `generate-api`, `start-api`, and `result-api` endpoints.

- [ ] **Step 5: Verify Worker tests pass**

Run: `npm test -- tests/worker/generateModelWorker.test.ts`
Expected: PASS.

### Task 3: Browser Client And HUD Target Input

**Files:**
- Modify: `D:\Github-Projects\Web-AR\src\services\generatedModelClient.ts`
- Modify: `D:\Github-Projects\Web-AR\src\ui\ARHud.ts`
- Modify: `D:\Github-Projects\Web-AR\src\app\WebARApp.ts`
- Modify: `D:\Github-Projects\Web-AR\tests\services\generatedModelClient.test.ts`
- Modify: `D:\Github-Projects\Web-AR\tests\ui\ARHud.test.ts`

**Interfaces:**
- Consumes: captured image from existing camera flow.
- Produces: optional target object text sent as `target_object` to Worker after capture.

- [ ] **Step 1: Add failing client and HUD tests**

Add tests showing `startGeneratedModelJob` and `generateModelFromImage` include trimmed `target_object` only when non-empty. Add HUD tests that target input is hidden before capture, visible after capture, can be empty, and generation handlers receive the trimmed value.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- tests/services/generatedModelClient.test.ts tests/ui/ARHud.test.ts`
Expected before implementation: FAIL because no target input/pass-through exists.

- [ ] **Step 3: Implement browser pass-through**

Add a target input in `ARHud`, expose `getTargetObject()`, show it only after captured preview, update Camera and Full Flow generation handlers to read it, pass it to generated-model client calls, and change Full Flow button text to `Generate and Place` after capture.

- [ ] **Step 4: Verify focused tests pass**

Run: `npm test -- tests/services/generatedModelClient.test.ts tests/ui/ARHud.test.ts`
Expected: PASS.

### Task 4: Full Verification And Deploy Prep

**Files:**
- All files changed above.

**Interfaces:**
- Consumes completed code from Tasks 1-3.
- Produces verified branch ready for user review/deploy.

- [ ] **Step 1: Run all Web AR tests**

Run: `npm test`
Expected: 8+ test files pass with no failures.

- [ ] **Step 2: Run Web AR production build**

Run: `$env:GITHUB_PAGES='true'; $env:VITE_GENERATE_MODEL_API_URL='https://web-ar-generate-model.sshibinthomass.workers.dev/generate-3d'; npm run build`
Expected: TypeScript and Vite build succeed.

- [ ] **Step 3: Run Modal tests**

Run: `uv run python -m unittest tests.test_trellis_fast_files`
Expected: OK.

- [ ] **Step 4: Review git status in both repos**

Run: `git status -sb` in Web-AR and `git -C D:\Github-Projects\Modal-Apps status -sb`.
Expected: only intended files changed.
