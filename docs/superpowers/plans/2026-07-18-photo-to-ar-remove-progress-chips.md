# Photo to AR Progress Chip Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the Capture, Generate, and Place progress chips only in the immersive Photo to AR interface while retaining both action buttons.

**Architecture:** Keep the shared HUD markup unchanged and use the existing `.photo-to-ar-immersive` route class as the scope boundary. A stylesheet contract test protects the route-specific visibility rule.

**Tech Stack:** TypeScript, CSS, Vitest, Vite

## Global Constraints

- Keep the Capture and Generate and place action buttons unchanged.
- Do not remove progress indicators from other routes.
- Do not change the object reconstruction loading animation.

---

### Task 1: Hide the Photo to AR progress chips

**Files:**
- Modify: `tests/ui/styles.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `.photo-to-ar-immersive` route class and `.creation-step-list` shared progress element.
- Produces: A route-specific CSS contract that hides only the Photo to AR progress list.

- [ ] **Step 1: Write the failing stylesheet contract test**

Add this assertion to the immersive Photo to AR stylesheet test:

```ts
const progressDeclarations = declarationsFor('.photo-to-ar-immersive .creation-step-list').join('\n');
expect(progressDeclarations).toContain('display: none;');
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/ui/styles.test.ts`

Expected: FAIL because the current Photo to AR progress-list declarations do not contain `display: none;`.

- [ ] **Step 3: Add the minimal route-specific CSS**

Replace the positioned progress-list styling with:

```css
.photo-to-ar-immersive .creation-step-list {
  display: none;
}
```

Remove the now-unused Photo to AR-specific list-item styling and the mobile media-query rule that adjusts this progress list.

- [ ] **Step 4: Run focused and complete verification**

Run:

```powershell
npm test -- --run tests/ui/styles.test.ts
npm test -- --run
npm run build
git diff --check
```

Expected: all tests pass, the production build succeeds, and `git diff --check` reports no errors.

- [ ] **Step 5: Commit and publish**

```powershell
git add src/styles.css tests/ui/styles.test.ts docs/superpowers/plans/2026-07-18-photo-to-ar-remove-progress-chips.md
git commit -m "style: remove photo progress chips"
git push origin main
```

Wait for the GitHub Pages deployment and verify Photo to AR shows only the Capture and Generate and place buttons in the bottom controls.
