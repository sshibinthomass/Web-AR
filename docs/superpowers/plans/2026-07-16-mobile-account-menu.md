# Mobile Account Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users persistent, name-based signed-in feedback and make Account, Admin, and Log out reliably accessible from one responsive menu.

**Architecture:** Add one focused account-name formatter, then make `ApplicationShell` the sole owner of responsive account controls, menu state, focus, and the global session notice. `ARHud` will remove its duplicate home-page account controls and will redirect an authenticated user away from the login route. `WebARApp` will publish name-based success feedback after successful authentication.

**Tech Stack:** TypeScript 6, DOM APIs, Vite 8, Vitest 4 with jsdom, CSS media queries.

## Global Constraints

- Signed-out shell copy is exactly **Account**.
- Signed-in shell copy is **Hi, Name**, preferring `AuthUser.name` and falling back to a readable email prefix.
- The account menu is shared by mobile and desktop.
- **Admin dashboard** appears only for an active administrator.
- **Log out** appears for every signed-in user.
- Successful direct login replaces the login route with Home.
- Protected-route login continues to resume the originally requested destination.
- The global success copy for login is **Welcome back, Name.**
- Mobile interactive targets remain at least 44 px tall.
- Existing unrelated Worker and documentation changes in the main checkout must not be staged or modified.

---

## File Structure

- Create `src/ui/accountIdentity.ts`: pure display-name formatting for shell and login feedback.
- Create `tests/ui/accountIdentity.test.ts`: name and email fallback contract.
- Modify `src/ui/ApplicationShell.ts`: responsive Account/Hi trigger, shared account menu, session notice, focus and dismissal behavior.
- Modify `tests/ui/ApplicationShell.test.ts`: shell behavior and accessibility regressions.
- Modify `src/ui/ARHud.ts`: remove duplicate home authentication controls, expose the global notice, and redirect authenticated login routes.
- Modify `tests/ui/ARHud.test.ts`: direct-login route and duplicate-control regressions.
- Modify `src/app/WebARApp.ts`: emit name-based login/signup success feedback.
- Modify `tests/app/WebARAppRouting.test.ts`: direct login, protected destination, and feedback behavior.
- Modify `src/styles.css`: desktop/mobile trigger, account menu, identity, status dot, and notice layout.
- Modify `tests/ui/styles.test.ts`: responsive account-menu design contract.

### Task 1: Account display-name formatter

**Files:**
- Create: `src/ui/accountIdentity.ts`
- Create: `tests/ui/accountIdentity.test.ts`

**Interfaces:**
- Consumes: `AuthUser` from `src/services/authClient.ts`.
- Produces: `getAccountDisplayName(user: Pick<AuthUser, "name" | "email">): string`.

- [ ] **Step 1: Write the failing formatter tests**

```ts
import { describe, expect, it } from 'vitest';
import { getAccountDisplayName } from '../../src/ui/accountIdentity';

describe('getAccountDisplayName', () => {
  it('prefers a trimmed account name', () => {
    expect(getAccountDisplayName({
      email: 'maker@example.com',
      name: '  Maya Stone  ',
    })).toBe('Maya Stone');
  });

  it('turns an email prefix into a readable fallback name', () => {
    expect(getAccountDisplayName({
      email: 'maya.stone+ar@example.com',
    })).toBe('Maya Stone');
  });
});
```

- [ ] **Step 2: Run the formatter test and verify RED**

Run:

```powershell
npm.cmd test -- tests/ui/accountIdentity.test.ts
```

Expected: FAIL because `src/ui/accountIdentity.ts` does not exist.

- [ ] **Step 3: Implement the minimal formatter**

```ts
import type { AuthUser } from '../services/authClient';

export function getAccountDisplayName(
  user: Pick<AuthUser, 'name' | 'email'>,
): string {
  const name = user.name?.trim();
  if (name) {
    return name;
  }

  const localPart = user.email
    .split('@')[0]
    ?.split('+')[0]
    ?.replace(/[._-]+/g, ' ')
    .trim();

  if (!localPart) {
    return user.email;
  }

  return localPart
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
```

- [ ] **Step 4: Run the formatter test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/ui/accountIdentity.test.ts
```

Expected: 1 file and 2 tests pass.

- [ ] **Step 5: Commit the formatter**

```powershell
git add -- src/ui/accountIdentity.ts tests/ui/accountIdentity.test.ts
git commit -m "feat: format signed-in account names"
```

### Task 2: Shared responsive account menu

**Files:**
- Modify: `src/ui/ApplicationShell.ts:1-252`
- Modify: `tests/ui/ApplicationShell.test.ts:1-157`

**Interfaces:**
- Consumes: `getAccountDisplayName(user)` from Task 1 and the existing `ApplicationShellHandlers`.
- Produces:
  - `ApplicationShell.setUser(user: AuthUser | null): void`
  - `ApplicationShell.showSessionNotice(message: string): void`
  - responsive `.account-menu-trigger`, `.account-menu`, `.account-menu-admin`, and `.account-menu-logout` elements.

- [ ] **Step 1: Replace the old administrator test with failing signed-in menu tests**

Add these test users:

```ts
const activeUser = {
  email: 'maker@example.com',
  name: 'Maya Stone',
  role: 'user' as const,
  status: 'active' as const,
};

const adminUser = {
  email: 'admin@example.com',
  name: 'Alex Admin',
  role: 'admin' as const,
  status: 'active' as const,
};
```

Add focused tests:

```ts
it('changes both account triggers to Hi, Name and opens one shared menu', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const shell = new ApplicationShell(host, {
    onNavigate: vi.fn(),
    onBack: vi.fn(),
    onLogout: vi.fn(),
  });

  shell.setUser(activeUser);

  const triggers = [...host.querySelectorAll<HTMLButtonElement>('.account-menu-trigger')];
  expect(triggers.map((trigger) => trigger.textContent?.trim())).toEqual([
    'Hi, Maya Stone',
    'Hi, Maya Stone',
  ]);

  const mobileTrigger = host.querySelector<HTMLButtonElement>('.mobile-account-link')!;
  mobileTrigger.click();

  const menu = host.querySelector<HTMLElement>('.account-menu')!;
  expect(menu.hidden).toBe(false);
  expect(mobileTrigger.getAttribute('aria-expanded')).toBe('true');
  expect(menu.querySelector('.account-menu-name')?.textContent).toBe('Maya Stone');
  expect(menu.querySelector('.account-menu-email')?.textContent).toBe('maker@example.com');
  expect(document.activeElement).toBe(menu.querySelector('.account-menu-logout'));
});

it('routes guests to Login instead of opening an empty account menu', () => {
  const host = document.createElement('div');
  const onNavigate = vi.fn();
  const shell = new ApplicationShell(host, {
    onNavigate,
    onBack: vi.fn(),
    onLogout: vi.fn(),
  });

  shell.setUser(null);
  host.querySelector<HTMLButtonElement>('.mobile-account-link')?.click();

  expect(onNavigate).toHaveBeenCalledWith('login');
  expect(host.querySelector<HTMLElement>('.account-menu')?.hidden).toBe(true);
});

it('makes Admin and Log out available from the shared mobile menu', () => {
  const host = document.createElement('div');
  const onNavigate = vi.fn();
  const onLogout = vi.fn();
  const shell = new ApplicationShell(host, {
    onNavigate,
    onBack: vi.fn(),
    onLogout,
  });
  shell.setUser(adminUser);

  host.querySelector<HTMLButtonElement>('.mobile-account-link')?.click();
  host.querySelector<HTMLButtonElement>('.account-menu-admin')?.click();
  expect(onNavigate).toHaveBeenCalledWith('admin');

  host.querySelector<HTMLButtonElement>('.mobile-account-link')?.click();
  host.querySelector<HTMLButtonElement>('.account-menu-logout')?.click();
  expect(onLogout).toHaveBeenCalledOnce();
});

it('closes the account menu on Escape and restores the actual opener', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const shell = new ApplicationShell(host, {
    onNavigate: vi.fn(),
    onBack: vi.fn(),
    onLogout: vi.fn(),
  });
  shell.setUser(activeUser);
  const mobileTrigger = host.querySelector<HTMLButtonElement>('.mobile-account-link')!;
  const menu = host.querySelector<HTMLElement>('.account-menu')!;

  mobileTrigger.click();
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  expect(menu.hidden).toBe(true);
  expect(document.activeElement).toBe(mobileTrigger);
});

it('closes the account menu when another page area is activated', () => {
  const host = document.createElement('div');
  const shell = new ApplicationShell(host, {
    onNavigate: vi.fn(),
    onBack: vi.fn(),
    onLogout: vi.fn(),
  });
  shell.setUser(activeUser);
  const menu = host.querySelector<HTMLElement>('.account-menu')!;

  host.querySelector<HTMLButtonElement>('.mobile-account-link')?.click();
  host.querySelector<HTMLElement>('.app-page-host')?.click();

  expect(menu.hidden).toBe(true);
});
```

- [ ] **Step 2: Run the shell tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/ui/ApplicationShell.test.ts
```

Expected: FAIL because the shared menu and name-based trigger do not exist.

- [ ] **Step 3: Replace the desktop account actions and mobile hard-coded Account button**

In `ApplicationShell` replace the desktop account markup with:

```html
<div class="shell-account">
  <button
    class="account-menu-trigger desktop-account-trigger"
    type="button"
    aria-expanded="false"
    aria-controls="accountMenu"
  >
    <span class="account-status-dot" aria-hidden="true" hidden></span>
    <span class="account-trigger-label">Account</span>
  </button>
</div>
```

Change the mobile button to:

```html
<button
  class="mobile-account-link account-menu-trigger"
  type="button"
  aria-expanded="false"
  aria-controls="accountMenu"
>
  <span class="account-status-dot" aria-hidden="true" hidden></span>
  <span class="account-trigger-label">Account</span>
</button>
```

Add one shared menu and one global live notice after the mobile bar:

```html
<section id="accountMenu" class="account-menu" role="menu" aria-label="Account" hidden>
  <div class="account-menu-identity" role="none">
    <strong class="account-menu-name"></strong>
    <span class="account-menu-email"></span>
  </div>
  <button class="account-menu-admin" type="button" role="menuitem" hidden>
    Admin dashboard
  </button>
  <button class="account-menu-logout" type="button" role="menuitem">
    Log out
  </button>
</section>
<div class="session-notice" role="status" aria-live="polite" hidden></div>
```

- [ ] **Step 4: Add account state, menu behavior, and session notice**

Import the formatter:

```ts
import { getAccountDisplayName } from './accountIdentity';
```

Add focused state:

```ts
private readonly accountTriggers: HTMLButtonElement[];
private readonly accountMenu: HTMLElement;
private readonly accountName: HTMLElement;
private readonly accountEmail: HTMLElement;
private readonly accountAdminButton: HTMLButtonElement;
private readonly accountLogoutButton: HTMLButtonElement;
private readonly sessionNotice: HTMLElement;
private currentUser: AuthUser | null = null;
private accountMenuOpener: HTMLButtonElement | null = null;
private sessionNoticeTimer: number | null = null;
```

Initialize those elements after `root.innerHTML`, then replace `setUser` with:

```ts
setUser(user: AuthUser | null): void {
  this.currentUser = user;
  this.closeAccountMenu();

  const displayName = user ? getAccountDisplayName(user) : '';
  for (const trigger of this.accountTriggers) {
    const label = trigger.querySelector<HTMLElement>('.account-trigger-label')!;
    const dot = trigger.querySelector<HTMLElement>('.account-status-dot')!;
    label.textContent = user ? `Hi, ${displayName}` : 'Account';
    dot.hidden = !user;
    trigger.title = user
      ? `Signed in as ${displayName}. Open account menu.`
      : 'Sign in or create an account.';
  }

  this.accountName.textContent = displayName;
  this.accountEmail.textContent = user?.email ?? '';
  this.accountAdminButton.hidden = user?.role !== 'admin' || user.status !== 'active';
}
```

Add:

```ts
showSessionNotice(message: string): void {
  if (this.sessionNoticeTimer !== null) {
    window.clearTimeout(this.sessionNoticeTimer);
  }
  this.sessionNotice.textContent = message;
  this.sessionNotice.hidden = false;
  this.sessionNoticeTimer = window.setTimeout(() => {
    this.sessionNotice.hidden = true;
    this.sessionNoticeTimer = null;
  }, 4500);
}

private openAccountMenu(opener: HTMLButtonElement): void {
  if (!this.currentUser) {
    this.handlers.onNavigate('login');
    return;
  }

  this.closeCreateMenu();
  this.accountMenuOpener = opener;
  this.accountMenu.hidden = false;
  for (const trigger of this.accountTriggers) {
    trigger.setAttribute('aria-expanded', String(trigger === opener));
  }
  const initialFocus = this.accountAdminButton.hidden
    ? this.accountLogoutButton
    : this.accountAdminButton;
  initialFocus.focus();
}

private closeAccountMenu(restoreFocus = false): void {
  const opener = this.accountMenuOpener;
  this.accountMenu.hidden = true;
  for (const trigger of this.accountTriggers) {
    trigger.setAttribute('aria-expanded', 'false');
  }
  this.accountMenuOpener = null;
  if (restoreFocus) {
    opener?.focus();
  }
}
```

At the beginning of `handleClick`, close an open account menu when the click is outside `.account-menu` and `.account-menu-trigger`. Handle `.account-menu-trigger`, `.account-menu-logout`, and `.account-menu-admin` before generic route handling. Update the Escape handler to close whichever menu is open and restore its actual opener. Ensure `setRoute` closes both menus.

- [ ] **Step 5: Run the shell tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/ui/ApplicationShell.test.ts tests/ui/accountIdentity.test.ts
```

Expected: both files pass.

- [ ] **Step 6: Commit the shell behavior**

```powershell
git add -- src/ui/ApplicationShell.ts tests/ui/ApplicationShell.test.ts
git commit -m "feat: add responsive account menu"
```

### Task 3: Authentication completion and duplicate-control removal

**Files:**
- Modify: `src/ui/ARHud.ts:100-106, 232-292, 746-772, 786-797, 1960-1976`
- Modify: `tests/ui/ARHud.test.ts:65-140, 340-420`
- Modify: `src/app/WebARApp.ts:1-40, 195-238`
- Modify: `tests/app/WebARAppRouting.test.ts:1-178`

**Interfaces:**
- Consumes:
  - `ApplicationShell.showSessionNotice(message: string)`
  - `getAccountDisplayName(user)`
- Produces: `ARHud.showSessionNotice(message: string): void`.

- [ ] **Step 1: Add failing HUD regressions**

Add `name: 'Maya Stone'` to `activeUser`, then add:

```ts
it('removes duplicate home account actions and redirects an authenticated Login route home', () => {
  window.history.replaceState(null, '', '/#/login');
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());

  expect(root.querySelector('.home-route-groups .auth-actions')).toBeNull();

  hud.updateAuthState(activeUser);

  expect(window.location.hash).toBe('#/');
  expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(false);
  expect(root.querySelector('.account-trigger-label')?.textContent).toBe('Hi, Maya Stone');
});

it('shows a global signed-in notice outside the login panel', () => {
  vi.useFakeTimers();
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());

  hud.showSessionNotice('Welcome back, Maya Stone.');

  const notice = root.querySelector<HTMLElement>('.session-notice')!;
  expect(notice.hidden).toBe(false);
  expect(notice.textContent).toBe('Welcome back, Maya Stone.');

  vi.advanceTimersByTime(4500);
  expect(notice.hidden).toBe(true);
  vi.useRealTimers();
});
```

- [ ] **Step 2: Add failing app routing and feedback regression**

Update `activeUser` in `WebARAppRouting.test.ts` to include `name: 'Maya Stone'`. Add:

```ts
it('returns a direct Login to Home and shows persistent and transient signed-in feedback', async () => {
  authMocks.loadAuthToken.mockReturnValue(null);
  window.localStorage.clear();
  window.history.replaceState(null, '', '/#/login');
  const root = document.createElement('div');
  const app = new WebARApp(root) as unknown as {
    login(email: string, password: string): Promise<void>;
    start(): Promise<void>;
  };

  await app.start();
  await app.login('maker@example.com', 'password');

  expect(window.location.hash).toBe('#/');
  expect(root.querySelector('.account-trigger-label')?.textContent).toBe('Hi, Maya Stone');
  expect(root.querySelector('.session-notice')?.textContent).toBe('Welcome back, Maya Stone.');
  expect(root.querySelector<HTMLElement>('.session-notice')?.hidden).toBe(false);
});
```

Keep the existing protected-route test and assert that it still resumes `#/speech`.

- [ ] **Step 3: Run HUD and routing tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/ui/ARHud.test.ts tests/app/WebARAppRouting.test.ts
```

Expected: FAIL because direct login stays on Login, the notice API is absent, and duplicate home authentication controls remain.

- [ ] **Step 4: Remove the duplicate home account controls**

Delete these `ARHud` fields:

```ts
private readonly authActions: HTMLElement;
private readonly authIdentity: HTMLElement;
private readonly loginButton: HTMLButtonElement;
private readonly logoutButton: HTMLButtonElement;
private readonly adminButton: HTMLButtonElement;
```

Delete the constructor block that creates `.auth-actions`, `.auth-identity`, Login, Admin, and Logout and appends it to `.home-route-groups`.

Reduce `renderAuthControls` to:

```ts
private renderAuthControls(): void {
  this.appShell.setUser(this.currentUser);
  this.renderModelManagerList();
}
```

- [ ] **Step 5: Redirect authenticated users away from Login and expose the notice**

In `ARHud`, add:

```ts
showSessionNotice(message: string): void {
  this.appShell.showSessionNotice(message);
}
```

In `updateAuthState`, after handling an allowed `pendingRoute`, add:

```ts
const currentRoute = parseRouteHash(window.location.hash);
if (this.currentUser && currentRoute === 'login') {
  this.navigateHome('replace');
  return;
}
```

Then keep the existing route authorization and `applyRoute(currentRoute)` logic.

- [ ] **Step 6: Publish name-based authentication feedback from the app**

Import:

```ts
import { getAccountDisplayName } from '../ui/accountIdentity';
```

After successful login:

```ts
this.hud?.updateAuthState(session.user);
this.hud?.showSessionNotice(
  `Welcome back, ${getAccountDisplayName(session.user)}.`,
);
```

Replace the old hidden-login-panel success message. After immediately approved signup use:

```ts
this.hud?.updateAuthState(session.user);
this.hud?.showSessionNotice(
  `Welcome, ${getAccountDisplayName(session.user)}.`,
);
```

- [ ] **Step 7: Run HUD and routing tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/ui/ARHud.test.ts tests/app/WebARAppRouting.test.ts tests/ui/ApplicationShell.test.ts
```

Expected: all selected files pass, including the existing protected-route restoration tests.

- [ ] **Step 8: Commit authentication completion**

```powershell
git add -- src/ui/ARHud.ts src/app/WebARApp.ts tests/ui/ARHud.test.ts tests/app/WebARAppRouting.test.ts
git commit -m "fix: make signed-in state unmistakable"
```

### Task 4: Responsive account-menu styling

**Files:**
- Modify: `src/styles.css:243-363, 406-460, 3102-3159, 3192-3300`
- Modify: `tests/ui/styles.test.ts:1-87`

**Interfaces:**
- Consumes the account classes produced by `ApplicationShell`.
- Produces responsive visual and touch behavior for mobile, tablet, and desktop.

- [ ] **Step 1: Write the failing CSS contract**

Replace the old `.mobile-account-link.is-concealed`-only assertion with:

```ts
it('keeps the responsive signed-in account menu visible, touchable, and above page content', () => {
  expect(styles).toContain('.account-menu-trigger {');
  expect(styles).toContain('.account-status-dot {');
  expect(styles).toContain('.account-menu {');
  expect(styles).toContain('z-index: 75;');
  expect(styles).toContain('.account-menu button {');
  expect(styles).toContain('min-height: 44px;');
  expect(styles).toContain('.session-notice {');
  expect(styles).toContain(
    '  .account-menu {\n' +
    '    top: calc(56px + env(safe-area-inset-top) + 8px);',
  );
  expect(styles).toContain(
    '  .mobile-account-link {\n' +
    '    max-width: min(34vw, 150px);',
  );
});
```

Retain the existing upload and Admin layout assertions in their own test.

- [ ] **Step 2: Run the CSS test and verify RED**

Run:

```powershell
npm.cmd test -- tests/ui/styles.test.ts
```

Expected: FAIL because the account menu classes are not styled.

- [ ] **Step 3: Add base trigger, menu, and notice styles**

Add:

```css
.account-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
}

.account-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-status-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--color-teal);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-teal) 14%, transparent);
}

.account-menu {
  position: fixed;
  top: 64px;
  right: max(16px, calc((100vw - var(--content-max)) / 2));
  z-index: 75;
  display: grid;
  gap: 6px;
  width: min(320px, calc(100vw - 24px));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  padding: 10px;
  color: var(--color-ink);
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
}

.account-menu-identity {
  display: grid;
  gap: 3px;
  padding: 10px 10px 12px;
  border-bottom: 1px solid var(--color-border);
}

.account-menu-name {
  overflow: hidden;
  font-family: var(--font-display);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-menu-email {
  overflow-wrap: anywhere;
  color: var(--color-ink-muted);
  font-size: 13px;
}

.account-menu button {
  width: 100%;
  min-height: 44px;
  justify-content: flex-start;
  border-color: transparent;
  background: transparent;
  text-align: left;
}

.account-menu-logout {
  color: var(--color-error);
}

.session-notice {
  position: fixed;
  top: 84px;
  left: 50%;
  z-index: 74;
  width: min(440px, calc(100vw - 24px));
  transform: translateX(-50%);
  border: 1px solid color-mix(in srgb, var(--color-teal) 28%, var(--color-border));
  border-radius: var(--radius-control);
  padding: 12px 16px;
  color: var(--color-teal-deep);
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
  font-weight: 700;
  text-align: center;
}
```

- [ ] **Step 4: Add mobile/tablet positioning**

Inside both mobile and intermediate responsive ranges, use:

```css
.account-menu {
  top: calc(56px + env(safe-area-inset-top) + 8px);
  right: 12px;
  left: 12px;
  width: auto;
}

.mobile-account-link {
  max-width: min(34vw, 150px);
}

.session-notice {
  top: calc(56px + env(safe-area-inset-top) + 8px);
}
```

Keep `.mobile-account-link.is-concealed` so the guest login page does not show a redundant Account destination.

- [ ] **Step 5: Run CSS and shell tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/ui/styles.test.ts tests/ui/ApplicationShell.test.ts
```

Expected: both files pass.

- [ ] **Step 6: Commit responsive styling**

```powershell
git add -- src/styles.css tests/ui/styles.test.ts
git commit -m "style: polish responsive account controls"
```

### Task 5: Full verification and publication

**Files:**
- Verify all changed files.
- No Worker deployment: `worker/src/index.ts` is not changed by this plan.

**Interfaces:**
- Consumes the complete implementation.
- Produces a verified commit on `main` and a successful GitHub Pages deployment.

- [ ] **Step 1: Install the locked dependencies in the worktree**

Run:

```powershell
npm.cmd ci
```

Expected: install completes with zero vulnerabilities.

- [ ] **Step 2: Run the full automated suite**

Run:

```powershell
npm.cmd test
```

Expected: all test files and tests pass with zero failures.

- [ ] **Step 3: Run the GitHub Pages production build**

Run:

```powershell
$env:GITHUB_PAGES='true'
npm.cmd run build
```

Expected: TypeScript and Vite build successfully. The existing Three.js chunk-size warning may remain.

- [ ] **Step 4: Audit repository state**

Run:

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: no unstaged implementation changes and no whitespace errors.

- [ ] **Step 5: Verify responsive behavior**

At 390×844 and 1440×1000 verify:

- guest trigger says **Account** and navigates to Login;
- active user trigger says **Hi, Maya Stone**;
- direct login lands on Home with **Welcome back, Maya Stone.**;
- mobile account sheet fits within the viewport;
- active administrator can activate **Admin dashboard**;
- every signed-in user can activate **Log out**;
- Escape closes the menu and restores focus;
- no horizontal overflow exists.

- [ ] **Step 6: Merge the branch into main**

From `D:\Github-Projects\Web-AR`, preserve unrelated local changes and run:

```powershell
git merge --ff-only codex/mobile-account-menu-fix
```

Expected: a clean fast-forward that does not stage or alter unrelated Worker/docs files.

- [ ] **Step 7: Re-run tests and Pages build on merged main**

Run:

```powershell
npm.cmd test
$env:GITHUB_PAGES='true'
npm.cmd run build
```

Expected: tests and build pass on the actual publishing checkout.

- [ ] **Step 8: Push and monitor GitHub Pages**

Run:

```powershell
git push origin main
gh run list --workflow "Deploy GitHub Pages" --branch main --limit 1
gh run watch <run-id> --exit-status --interval 5
```

Expected: build and deploy jobs finish with `success`.

- [ ] **Step 9: Verify the live site**

Verify `https://sshibinthomass.github.io/Web-AR/` returns HTTP 200 and its current bundle contains both `Hi, ` and `Welcome back, `.

- [ ] **Step 10: Clean up the merged feature branch**

After successful publication:

```powershell
git worktree remove "D:\Github-Projects\Web-AR\.worktrees\mobile-account-menu-fix"
git worktree prune
git branch -d codex/mobile-account-menu-fix
```

Expected: the feature worktree registration and merged branch are removed.
