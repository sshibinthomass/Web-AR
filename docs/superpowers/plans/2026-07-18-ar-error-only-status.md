# AR Error-Only Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide normal single-object AR status UI and show only genuine errors as a compact transparent notification at the top.

**Architecture:** `ARHud.update` will expose the existing `unsupported` error mode as an `is-error` class on the status panel. Route-specific CSS will hide the normal single-object AR inspector and reveal only the error state without changing Multi-object AR or other routes.

**Tech Stack:** TypeScript, CSS, Vitest, Vite

## Global Constraints

- Hide normal status only on the single-object `ar` route.
- Preserve status behavior on camera, generation, model picker, speech, administration, and Multi-object AR routes.
- Show only the main error message in the compact AR error notification.
- Do not change AR placement or generation behavior.

---

### Task 1: Add error-only single-object AR status

**Files:**
- Modify: `tests/ui/ARHud.test.ts`
- Modify: `tests/ui/styles.test.ts`
- Modify: `src/ui/ARHud.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `ARHud.update(mode: AppMode, customMessage?: string)` and the existing `unsupported` error mode.
- Produces: `.status-panel.is-error` state plus route-specific compact error-only presentation.

- [ ] **Step 1: Write failing behavior and stylesheet tests**

Add HUD assertions:

```ts
hud.update('editing');
expect(statusPanel?.classList.contains('is-error')).toBe(false);
hud.update('unsupported', 'AR session failed.');
expect(statusPanel?.classList.contains('is-error')).toBe(true);
hud.update('scanning');
expect(statusPanel?.classList.contains('is-error')).toBe(false);
```

Add stylesheet contracts requiring normal AR inspectors to be hidden and error inspectors to use compact translucent top positioning:

```ts
expect(styles).toContain('.app-shell[data-route="ar"] .status-panel.immersive-inspector:not(.is-error) {');
expect(styles).toContain('display: none;');
expect(styles).toContain('.app-shell[data-route="ar"] .status-panel.immersive-inspector.is-error {');
expect(styles).toContain('background: rgba(2, 10, 12, 0.58);');
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- --run tests/ui/ARHud.test.ts tests/ui/styles.test.ts`

Expected: FAIL because `ARHud.update` does not mark error mode and route-specific error-only CSS does not exist.

- [ ] **Step 3: Implement minimal error state and CSS**

In `ARHud.update`:

```ts
this.statusPanel.classList.toggle('is-error', mode === 'unsupported');
```

Add route-specific CSS that hides the non-error inspector, styles the error inspector as a compact centered top notification, and hides `.status-label` plus `.status-source` inside the error notification.

- [ ] **Step 4: Run focused and complete verification**

Run:

```powershell
npm test -- --run tests/ui/ARHud.test.ts tests/ui/styles.test.ts
npm test -- --run
npm run build
git diff --check
```

Expected: all tests pass, the build succeeds, and the diff check is clean.

- [ ] **Step 5: Commit and publish**

```powershell
git add src/ui/ARHud.ts src/styles.css tests/ui/ARHud.test.ts tests/ui/styles.test.ts
git commit -m "style: show AR status only for errors"
git push origin main
```

Wait for GitHub Pages and verify normal production AR placement has no status card.
