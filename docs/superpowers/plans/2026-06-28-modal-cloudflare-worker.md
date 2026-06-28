# Modal Cloudflare Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the WebXR app capture a camera image, generate a GLB through Modal, save it in Cloudflare R2, and load the generated model in AR.

**Architecture:** Keep secrets server-side in a Cloudflare Worker. The browser posts captured image data to the Worker; the Worker calls Modal, stores the returned GLB in R2, and returns a public GLB URL that the existing Three.js loader can consume.

**Tech Stack:** TypeScript, Vite, Vitest, Three.js, Cloudflare Workers, Cloudflare R2, Wrangler, browser MediaDevices API, Modal REST API.

## Global Constraints

- Do not expose `MODAL_KEY`, `MODAL_SECRET`, or Cloudflare write credentials in browser code.
- Preserve the existing Cloudflare model selector and AR placement behavior.
- Browser config may only contain the public Worker API URL.
- Worker stores generated models under `models/generated/`.
- All new behavior must be covered by failing-then-passing tests where practical.

---

## File Structure

- Create `worker/src/index.ts`: Worker fetch handler and helpers.
- Create `worker/tsconfig.json`: Worker TypeScript config.
- Create `wrangler.jsonc`: Worker name, entrypoint, variables, and R2 binding.
- Create `src/capture/cameraCapture.ts`: browser camera capture helpers.
- Create `src/services/generatedModelClient.ts`: browser API client for the Worker.
- Modify `src/ui/ARHud.ts`: camera controls, preview, generated model status.
- Modify `src/app/WebARApp.ts`: connect capture/generate/load flow to the existing GLB loader.
- Modify `src/state/AppState.ts`: track generated model state if needed.
- Modify `README.md`: setup for Worker secrets, R2, local dev, and deployment.
- Add tests under `tests/worker`, `tests/capture`, `tests/services`, and update `tests/ui`.

## Tasks

- [ ] Add failing Worker contract tests for validation, Modal forwarding, R2 upload, and CORS.
- [ ] Implement the Worker endpoint and Wrangler configuration.
- [ ] Add failing browser client/capture tests.
- [ ] Implement camera capture helpers and generated-model API client.
- [ ] Add failing HUD tests for camera actions and generated status.
- [ ] Wire HUD controls into `WebARApp` and load returned GLB URLs.
- [ ] Update README with setup commands and environment variables.
- [ ] Run `npm run test` and `npm run build`.

## Self-Review

The plan covers the approved flow, secret boundaries, Worker/R2 persistence, browser capture, app loading, docs, and verification. No placeholders remain.
