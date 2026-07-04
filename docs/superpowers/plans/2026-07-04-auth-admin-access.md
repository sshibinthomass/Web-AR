# Auth Admin Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password login, admin approval, and route-level feature gates so guests can use AR View and Models while approved users can use Camera, Upload Image, Upload Model, and Full Flow.

**Architecture:** The GitHub Pages app remains static. The existing Cloudflare Worker owns auth endpoints, password hashing, signed sessions, account approval, and write-route authorization. The frontend stores the signed session token locally, validates it on startup, and renders login/admin controls through the existing HUD.

**Tech Stack:** Vite, TypeScript, Vitest, Cloudflare Worker, R2 object storage, Web Crypto PBKDF2 and HMAC.

## Global Constraints

- Do not store passwords or admin secrets in the browser.
- Make `sshibinthomass@gmail.com` the admin account; new non-admin accounts remain pending until approved.
- Guests can access AR View and Models.
- Only approved logged-in users can use Camera, Upload Image, Upload Model, and Full Flow.
- Admin can approve and remove accounts.
- Preserve existing dirty changes in `src/app/WebARApp.ts`, `src/ui/ARHud.ts`, and `tests/ui/ARHud.test.ts`.

---

### Task 1: Worker Auth API

**Files:**
- Modify: `worker/src/index.ts`
- Test: `tests/worker/generateModelWorker.test.ts`

**Interfaces:**
- Produces `POST /auth/signup`, `POST /auth/login`, `GET /auth/session`, `GET /auth/users`, `PATCH /auth/users/:email`, and `DELETE /auth/users/:email`.
- Produces bearer token authorization that protects all Worker write/generation routes except public model reads.

- [ ] Write failing Worker tests for admin signup, pending user signup, login approval, admin listing, approval, removal, and protected generation/upload routes.
- [ ] Run `npm test -- tests/worker/generateModelWorker.test.ts` and confirm the new tests fail because auth is missing.
- [ ] Implement R2-backed user storage, PBKDF2 password hashing, HMAC session signing, admin authorization, and route guards.
- [ ] Run `npm test -- tests/worker/generateModelWorker.test.ts` and confirm the Worker tests pass.

### Task 2: Browser Auth Client

**Files:**
- Create: `src/services/authClient.ts`
- Modify: `src/services/generatedModelClient.ts`
- Test: `tests/services/authClient.test.ts`
- Test: `tests/services/generatedModelClient.test.ts`

**Interfaces:**
- Produces `signup`, `login`, `getCurrentUser`, `listAccounts`, `approveAccount`, `removeAccount`, `saveAuthToken`, `loadAuthToken`, and `clearAuthToken`.
- Extends generation/model write functions to send `Authorization: Bearer <token>` when available.

- [ ] Write failing service tests for auth endpoint mapping, local token persistence, and authorization headers on protected model calls.
- [ ] Run service tests and confirm failures.
- [ ] Implement auth client and optional auth headers in generated model requests.
- [ ] Run service tests and confirm they pass.

### Task 3: HUD Auth Gates and Admin Dashboard

**Files:**
- Modify: `src/ui/ARHud.ts`
- Modify: `src/app/WebARApp.ts`
- Modify: `src/styles.css`
- Test: `tests/ui/ARHud.test.ts`

**Interfaces:**
- `ARHud` accepts auth handlers, exposes `updateAuthState(user)`, `showAuthMessage(message, isError)`, `updateAdminAccounts(users)`, and gates protected route buttons.
- `WebARApp` validates existing sessions on startup and connects HUD actions to Worker auth calls.

- [ ] Write failing HUD tests for guest gates, login/signup forms, admin dashboard visibility, approve/remove actions, and public AR/Models access.
- [ ] Run `npm test -- tests/ui/ARHud.test.ts` and confirm failures.
- [ ] Implement HUD auth state, route gates, login/signup view, and admin dashboard.
- [ ] Wire `WebARApp` to the auth client and pass session tokens to protected Worker calls.
- [ ] Run HUD tests and confirm they pass.

### Task 4: Full Verification

**Files:**
- Modify: `wrangler.jsonc`
- Test: all test suites

**Interfaces:**
- Adds `ADMIN_EMAIL` as a Worker variable and documents `AUTH_SECRET` as a required Worker secret.

- [ ] Add `ADMIN_EMAIL` to `wrangler.jsonc`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --stat` and ensure only auth-related changes plus the plan file are present.
