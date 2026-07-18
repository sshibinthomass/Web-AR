# Remove “Keep this page open” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove “Keep this page open” from every user-facing generation message without changing generation behavior.

**Architecture:** Keep the existing AR HUD and application flow intact. Change only the default and call-site copy, with a regression assertion covering the shared phrase and focused assertions preserving the useful operation text.

**Tech Stack:** TypeScript, Vitest, jsdom, Vite

## Global Constraints

- Remove “Keep this page open” from every user-facing generation/loading message.
- Preserve operation-specific generation descriptions.
- Do not change status behavior, loading visuals, cancellation behavior, error handling, or generation workflows.

---

### Task 1: Shorten all generation messages

**Files:**
- Modify: `tests/ui/ARHud.test.ts`
- Modify: `src/ui/ARHud.ts`
- Modify: `src/app/WebARApp.ts`

**Interfaces:**
- Consumes: `ARHud.showFullFlowLoading(message: string)` and `ARHud.showSpeechGenerating(message?: string)`
- Produces: The same HUD methods and application flows with concise user-facing copy.

- [ ] **Step 1: Write the failing regression assertions**

Add assertions to the existing HUD tests that exercise Photo-to-AR and speech generation:

```ts
expect(root.textContent).not.toContain('Keep this page open');
expect(root.textContent).toContain('Building your 3D object in Modal.');

hud.showSpeechGenerating();
expect(root.textContent).toContain('Generating a 3D-ready image and model from speech.');
expect(root.textContent).not.toContain('Keep this page open');
```

Also update the Photo-to-AR handler expectation so the exact emitted loading message is `Building your 3D object in Modal.`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run tests/ui/ARHud.test.ts
```

Expected: FAIL because the current default and handler copy still contains “Keep this page open”.

- [ ] **Step 3: Apply the minimal copy changes**

In `src/ui/ARHud.ts`, use:

```ts
showSpeechGenerating(message = 'Generating a 3D-ready image and model from speech.'): void
```

Use these Photo-to-AR loading messages:

```ts
'Building your 3D object in Modal.'
'Generating a dynamic image, then building your 3D object in Modal.'
```

Apply the same two messages at the matching `WebARApp` call sites. Do not alter error or ready-state copy.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
npx vitest run tests/ui/ARHud.test.ts
npx vitest run --exclude ".worktrees/**"
npm run build
rg -n --glob '!docs/**' --glob '!node_modules/**' --glob '!.worktrees/**' "Keep this page open" src tests
```

Expected: focused and full tests PASS, build exits 0, and `rg` returns no source/test matches.

- [ ] **Step 5: Commit and publish**

```powershell
git add -- tests/ui/ARHud.test.ts src/ui/ARHud.ts src/app/WebARApp.ts docs/superpowers/plans/2026-07-18-remove-keep-page-open.md
git commit -m "style: shorten generation messages"
git push origin main
```

Wait for the GitHub Pages workflow and verify that the production bundle contains no “Keep this page open” copy.
