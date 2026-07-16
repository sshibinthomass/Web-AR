# Web AR Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Anima You 3D as a consistent, accessible spatial workbench with reliable route history, auth-aware deep links, task-specific desktop/mobile layouts, and stable interactive state across every existing page.

**Architecture:** Keep the framework-free TypeScript/Vite application and its current rendering and generation services. Extract route configuration/history, application-shell chrome, modal focus management, and model-list equality into focused UI modules; then make `ARHud` consume those modules while retaining its existing public integration API. Replace the accumulated CSS override layers with a token-driven responsive system that preserves existing route class names where they remain useful.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 4 with jsdom, Three.js/WebXR, CSS, Fontsource self-hosted fonts, Playwright CLI for browser verification.

## Global Constraints

- Preserve the light spatial-grid identity and use the Spatial Calibration Frame once per major view.
- Use `#F4F8F7` canvas, `#FFFFFF` surface, `#102F2F` primary ink, `#496664` secondary ink, `#0B8F87` spatial teal, `#076A65` deep teal, `#F2A93B` tracking amber, `#D85D4A` error coral, `#D5E4E1` border, and `#2C8B5E` success.
- Use bundled Sora for display, Source Sans 3 for body and controls, and IBM Plex Mono for utility text.
- Desktop begins at `1024px`; mobile is below `768px`; `768px` through `1023px` uses mobile navigation with a wider content column.
- Maximum desktop content width is `1280px`.
- Default interactive control height is `48px`; no touch target is smaller than `44px`.
- Keep all existing routes, access permissions, WebXR behavior, model-generation APIs, and account roles.
- Do not migrate to a frontend framework or modify unrelated worker internals.
- Use sentence case and the approved action/status vocabulary from the design specification.
- Respect safe-area insets, WCAG AA contrast, keyboard navigation, focus visibility, and `prefers-reduced-motion`.
- Preserve unrelated local changes in `worker/src/index.ts`, `tests/worker/generateModelWorker.test.ts`, and all unrelated untracked files.

## File Structure

### New files

- `src/ui/routes.ts` — route names, metadata, hash parsing, parent routes, access rules, and route-specific initial copy.
- `src/ui/HashRouter.ts` — push/replace/back history semantics and location event handling.
- `src/ui/ApplicationShell.ts` — desktop header, create menu, route bar, mobile top bar, bottom navigation, account state, and immersive chrome.
- `src/ui/dialog.ts` — accessible modal focus trap, Escape handling, backdrop close, and focus restoration.
- `src/ui/modelCollections.ts` — stable equality comparison for model collections.
- `tests/ui/routes.test.ts` — route metadata and parsing tests.
- `tests/ui/HashRouter.test.ts` — history-depth, replace, browser navigation, and direct-entry fallback tests.
- `tests/ui/ApplicationShell.test.ts` — global navigation, active state, menu, account, and immersive-shell tests.
- `tests/ui/dialog.test.ts` — dialog semantics and keyboard-focus tests.
- `tests/ui/modelCollections.test.ts` — model equality tests.
- `tests/app/WebARAppRouting.test.ts` — auth restoration and intended-route integration tests.

### Modified files

- `src/ui/ARHud.ts` — consume router/shell/dialog modules, centralize route lifecycle, update route markup and copy, preserve focus during model refresh, and expose auth resolution.
- `src/app/WebARApp.ts` — load auth token before HUD route resolution, await session restoration, resume intended routes, and use HUD navigation APIs instead of direct hash assignment.
- `src/styles.css` — replace duplicate legacy/light overrides with tokens, shared components, route workspaces, responsive layouts, immersive controls, focus, and reduced motion.
- `src/main.ts` — import selected self-hosted font weights.
- `index.html` — align initial paint colors with design tokens and remove conflicting inline theme values.
- `package.json` and `package-lock.json` — add exact Fontsource packages.
- `tests/ui/ARHud.test.ts` — navigation, lifecycle, route identity, route markup, stable refresh, dialogs, and accessible action tests.
- `tests/ui/styles.test.ts` — replace brittle legacy-value checks with token, breakpoint, focus, hidden-state, and layout-invariant checks.
- `tests/app/WebARApp.test.ts` — update injected HUD shape where new navigation/auth methods are required.

---

### Task 1: Central route metadata and reliable hash history

**Files:**
- Create: `src/ui/routes.ts`
- Create: `src/ui/HashRouter.ts`
- Create: `tests/ui/routes.test.ts`
- Create: `tests/ui/HashRouter.test.ts`

**Interfaces:**
- Produces: `HudRoute`, `RouteMeta`, `ROUTES`, `parseRouteHash(hash)`, `routeHash(route)`, `routeCanOpen(route, user)`.
- Produces: `HashRouter.start(listener)`, `HashRouter.navigate(route, mode?)`, `HashRouter.back(fallback)`, `HashRouter.dispose()`.
- Consumes: browser `history`, `location`, `popstate`, and `hashchange`.

- [ ] **Step 1: Write route metadata tests**

```ts
import { describe, expect, it } from 'vitest';
import { ROUTES, parseRouteHash, routeCanOpen, routeHash } from '../../src/ui/routes';

describe('route metadata', () => {
  it('maps every supported hash and falls back to home', () => {
    expect(parseRouteHash('#/speech')).toBe('speech');
    expect(parseRouteHash('#/upload-model')).toBe('upload-model');
    expect(parseRouteHash('#/unknown')).toBe('home');
    expect(routeHash('home')).toBe('#/');
    expect(routeHash('multi-object')).toBe('#/multi-object');
  });

  it('keeps public, protected, and admin access explicit', () => {
    expect(routeCanOpen('models', null)).toBe(true);
    expect(routeCanOpen('speech', null)).toBe(false);
    expect(routeCanOpen('speech', { email: 'maker@example.com', role: 'user', status: 'active' })).toBe(true);
    expect(routeCanOpen('admin', { email: 'maker@example.com', role: 'user', status: 'active' })).toBe(false);
    expect(routeCanOpen('admin', { email: 'admin@example.com', role: 'admin', status: 'active' })).toBe(true);
  });

  it('defines route-specific identity and fallback metadata', () => {
    expect(ROUTES.camera.title).toBe('Camera capture');
    expect(ROUTES['full-flow'].title).toBe('Photo to AR');
    expect(ROUTES.dynamic.title).toBe('AI photo to AR');
    expect(ROUTES.speech.parent).toBe('home');
    expect(ROUTES.camera.initialStatus).toBe('Frame one object, then capture an image.');
  });
});
```

- [ ] **Step 2: Run route tests and verify failure**

Run: `npm.cmd test -- tests/ui/routes.test.ts`

Expected: FAIL because `src/ui/routes.ts` does not exist.

- [ ] **Step 3: Implement exact route configuration**

```ts
import type { AuthUser } from '../services/authClient';

export type HudRoute =
  | 'home'
  | 'camera'
  | 'upload'
  | 'upload-model'
  | 'ar'
  | 'full-flow'
  | 'dynamic'
  | 'speech'
  | 'multi-object'
  | 'models'
  | 'login'
  | 'admin';

export type NavigationSection = 'home' | 'create' | 'models' | 'ar' | 'account';
export type RouteShell = 'standard' | 'immersive';

export interface RouteMeta {
  hash: string;
  title: string;
  shortTitle: string;
  section: NavigationSection;
  parent: HudRoute;
  requiresAuth: boolean;
  requiresAdmin: boolean;
  shell: RouteShell;
  initialStatus: string;
}

export const ROUTES: Record<HudRoute, RouteMeta> = {
  home: {
    hash: '#/',
    title: 'Home',
    shortTitle: 'Home',
    section: 'home',
    parent: 'home',
    requiresAuth: false,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Choose how you want to create or place a model.',
  },
  camera: {
    hash: '#/camera',
    title: 'Camera capture',
    shortTitle: 'Camera',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'immersive',
    initialStatus: 'Frame one object, then capture an image.',
  },
  upload: {
    hash: '#/upload',
    title: 'Image to 3D',
    shortTitle: 'Image',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Choose an image to create a 3D model.',
  },
  'upload-model': {
    hash: '#/upload-model',
    title: 'Upload model',
    shortTitle: 'Upload',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Choose a GLB model to add to your library.',
  },
  ar: {
    hash: '#/ar',
    title: 'Place in AR',
    shortTitle: 'AR',
    section: 'ar',
    parent: 'home',
    requiresAuth: false,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Choose a model to place in your space.',
  },
  'full-flow': {
    hash: '#/full-flow',
    title: 'Photo to AR',
    shortTitle: 'Photo to AR',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'immersive',
    initialStatus: 'Capture an object, generate it, then place it in AR.',
  },
  dynamic: {
    hash: '#/dynamic',
    title: 'AI photo to AR',
    shortTitle: 'AI photo',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'immersive',
    initialStatus: 'Capture an object for AI enhancement and AR placement.',
  },
  speech: {
    hash: '#/speech',
    title: 'Text or voice to 3D',
    shortTitle: 'Text / voice',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Describe one object by text or voice.',
  },
  'multi-object': {
    hash: '#/multi-object',
    title: 'Multi-object AR',
    shortTitle: 'Multi-object',
    section: 'ar',
    parent: 'home',
    requiresAuth: false,
    requiresAdmin: false,
    shell: 'immersive',
    initialStatus: 'Place multiple models in this session.',
  },
  models: {
    hash: '#/models',
    title: 'Models',
    shortTitle: 'Models',
    section: 'models',
    parent: 'home',
    requiresAuth: false,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Browse saved and uploaded models.',
  },
  login: {
    hash: '#/login',
    title: 'Account',
    shortTitle: 'Account',
    section: 'account',
    parent: 'home',
    requiresAuth: false,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Sign in or create an account.',
  },
  admin: {
    hash: '#/admin',
    title: 'Admin',
    shortTitle: 'Admin',
    section: 'account',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: true,
    shell: 'standard',
    initialStatus: 'Manage accounts and generation jobs.',
  },
};

const routeByHash = new Map(
  Object.entries(ROUTES).map(([route, meta]) => [meta.hash, route as HudRoute]),
);

export function parseRouteHash(hash: string): HudRoute {
  return routeByHash.get(hash || '#/') ?? 'home';
}

export function routeHash(route: HudRoute): string {
  return ROUTES[route].hash;
}

export function routeCanOpen(route: HudRoute, user: AuthUser | null): boolean {
  const meta = ROUTES[route];
  if (meta.requiresAdmin) {
    return user?.status === 'active' && user.role === 'admin';
  }
  return !meta.requiresAuth || user?.status === 'active';
}
```

- [ ] **Step 4: Run route tests and verify pass**

Run: `npm.cmd test -- tests/ui/routes.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Write hash-router history tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter } from '../../src/ui/HashRouter';

describe('HashRouter', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('pushes forward routes and replaces redirects', () => {
    const routes: string[] = [];
    const router = new HashRouter(window);
    router.start((route) => routes.push(route));

    router.navigate('models');
    expect(window.location.hash).toBe('#/models');
    expect(window.history.state).toMatchObject({ webAr: true, depth: 1, route: 'models' });

    router.navigate('login', 'replace');
    expect(window.location.hash).toBe('#/login');
    expect(window.history.state).toMatchObject({ webAr: true, depth: 1, route: 'login' });
    expect(routes).toEqual(['home', 'models', 'login']);
  });

  it('uses browser history for an in-app back and replaces a direct-entry fallback', () => {
    const router = new HashRouter(window);
    router.start(() => undefined);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    router.navigate('models');
    router.back('home');
    expect(back).toHaveBeenCalledOnce();
    router.dispose();

    window.history.replaceState(null, '', '/#/speech');
    const directRouter = new HashRouter(window);
    directRouter.start(() => undefined);
    directRouter.back('home');
    expect(window.location.hash).toBe('#/');
    expect(window.history.state).toMatchObject({ depth: 0, route: 'home' });
    directRouter.dispose();
  });

  it('emits browser-driven route changes once', () => {
    const listener = vi.fn();
    const router = new HashRouter(window);
    router.start(listener);
    window.history.pushState({ webAr: true, depth: 1, route: 'ar' }, '', '#/ar');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    expect(listener).toHaveBeenLastCalledWith('ar');
  });
});
```

- [ ] **Step 6: Run hash-router tests and verify failure**

Run: `npm.cmd test -- tests/ui/HashRouter.test.ts`

Expected: FAIL because `HashRouter` does not exist.

- [ ] **Step 7: Implement the router**

```ts
import { parseRouteHash, routeHash, type HudRoute } from './routes';

type NavigationMode = 'push' | 'replace';
type RouteListener = (route: HudRoute) => void;

interface WebArHistoryState {
  webAr: true;
  depth: number;
  route: HudRoute;
}

function isWebArHistoryState(value: unknown): value is WebArHistoryState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Partial<WebArHistoryState>;
  return state.webAr === true && typeof state.depth === 'number' && typeof state.route === 'string';
}

export class HashRouter {
  private listener: RouteListener | null = null;
  private lastEmittedHash = '';
  private readonly handleLocationChange = () => this.emitLocation();

  constructor(private readonly targetWindow: Window) {}

  start(listener: RouteListener): void {
    this.listener = listener;
    const route = parseRouteHash(this.targetWindow.location.hash);
    const state = this.targetWindow.history.state;
    const depth = isWebArHistoryState(state) ? state.depth : 0;
    this.targetWindow.history.replaceState(
      { webAr: true, depth, route } satisfies WebArHistoryState,
      '',
      routeHash(route),
    );
    this.targetWindow.addEventListener('popstate', this.handleLocationChange);
    this.targetWindow.addEventListener('hashchange', this.handleLocationChange);
    this.lastEmittedHash = this.targetWindow.location.hash;
    listener(route);
  }

  navigate(route: HudRoute, mode: NavigationMode = 'push'): void {
    const hash = routeHash(route);
    const currentState = this.targetWindow.history.state;
    const depth = isWebArHistoryState(currentState) ? currentState.depth : 0;
    const nextState: WebArHistoryState = {
      webAr: true,
      depth: mode === 'push' ? depth + 1 : depth,
      route,
    };

    if (mode === 'replace' || hash === this.targetWindow.location.hash) {
      this.targetWindow.history.replaceState(nextState, '', hash);
    } else {
      this.targetWindow.history.pushState(nextState, '', hash);
    }
    this.lastEmittedHash = hash;
    this.listener?.(route);
  }

  back(fallback: HudRoute): void {
    const state = this.targetWindow.history.state;
    if (isWebArHistoryState(state) && state.depth > 0) {
      this.targetWindow.history.back();
      return;
    }
    this.navigate(fallback, 'replace');
  }

  dispose(): void {
    this.targetWindow.removeEventListener('popstate', this.handleLocationChange);
    this.targetWindow.removeEventListener('hashchange', this.handleLocationChange);
    this.listener = null;
  }

  private emitLocation(): void {
    const hash = this.targetWindow.location.hash || '#/';
    if (hash === this.lastEmittedHash) {
      return;
    }
    this.lastEmittedHash = hash;
    const route = parseRouteHash(hash);
    const state = this.targetWindow.history.state;
    if (!isWebArHistoryState(state)) {
      this.targetWindow.history.replaceState(
        { webAr: true, depth: 0, route } satisfies WebArHistoryState,
        '',
        routeHash(route),
      );
    }
    this.listener?.(route);
  }
}
```

- [ ] **Step 8: Run Task 1 tests**

Run: `npm.cmd test -- tests/ui/routes.test.ts tests/ui/HashRouter.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- src/ui/routes.ts src/ui/HashRouter.ts tests/ui/routes.test.ts tests/ui/HashRouter.test.ts
git commit -m "feat: add reliable application routing"
```

---

### Task 2: Auth-aware deep links and intended-route restoration

**Files:**
- Modify: `src/ui/ARHud.ts:1-1800`
- Modify: `src/app/WebARApp.ts:99-240`
- Create: `tests/app/WebARAppRouting.test.ts`
- Modify: `tests/ui/ARHud.test.ts:1-1340`

**Interfaces:**
- Consumes: `HashRouter`, `ROUTES`, `routeCanOpen`.
- Produces: `ARHudOptions { authRestoring?: boolean }`.
- Produces: `ARHud.updateAuthState(user)`, `ARHud.completeLogout()`, `ARHud.navigateHome(mode?)`.
- Maintains: one `pendingRoute: HudRoute | null`.

- [ ] **Step 1: Add failing HUD tests for restoration and intended routes**

Append these tests to `tests/ui/ARHud.test.ts`:

```ts
it('waits for auth restoration before resolving a protected deep link', () => {
  window.history.replaceState(null, '', '/#/speech');
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers(), { authRestoring: true });

  expect(window.location.hash).toBe('#/speech');
  expect(root.querySelector('.auth-panel')?.classList.contains('hidden')).toBe(true);
  expect(root.querySelector('.route-restoring')?.classList.contains('hidden')).toBe(false);

  hud.updateAuthState(activeUser);

  expect(window.location.hash).toBe('#/speech');
  expect(root.querySelector('.speech-panel')?.classList.contains('hidden')).toBe(false);
});

it('restores the intended protected route after login', () => {
  window.history.replaceState(null, '', '/#/speech');
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());

  expect(window.location.hash).toBe('#/login');
  hud.updateAuthState(activeUser);

  expect(window.location.hash).toBe('#/speech');
  expect(root.querySelector('.speech-panel')?.classList.contains('hidden')).toBe(false);
});

it('clears an intended route on explicit logout', () => {
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());
  hud.updateAuthState(activeUser);
  hud.navigateHome();
  hud.completeLogout();

  expect(window.location.hash).toBe('#/');
  expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(false);
});
```

- [ ] **Step 2: Run the new HUD tests and verify failure**

Run: `npm.cmd test -- tests/ui/ARHud.test.ts`

Expected: FAIL because the fourth constructor argument and navigation APIs do not exist.

- [ ] **Step 3: Integrate router and auth resolution into `ARHud`**

At the top of `src/ui/ARHud.ts`, import:

```ts
import { HashRouter } from './HashRouter';
import { parseRouteHash, ROUTES, routeCanOpen, type HudRoute } from './routes';
```

Delete the local `HudRoute` union. Add:

```ts
export interface ARHudOptions {
  authRestoring?: boolean;
}

private readonly router = new HashRouter(window);
private authResolved: boolean;
private pendingRoute: HudRoute | null = null;
private readonly routeRestoring: HTMLElement;
```

Change the constructor signature and startup:

```ts
constructor(
  root: HTMLElement,
  modelOptions: ModelOption[],
  private readonly handlers: HUDHandlers,
  options: ARHudOptions = {},
) {
  this.authResolved = !options.authRestoring;
  // Build the existing HUD elements before starting the router.
  this.routeRestoring = document.createElement('section');
  this.routeRestoring.className = 'route-restoring hidden';
  this.routeRestoring.innerHTML = `
    <div class="loading-ring" aria-hidden="true"></div>
    <p>Restoring your session...</p>
  `;
  shell.appendChild(this.routeRestoring);
  this.router.start((route) => this.applyRoute(route));
}
```

Replace `navigateTo`, `applyCurrentRoute`, `routeRequiresAuth`, `routeFromHash`, and direct hash writes with:

```ts
private navigateTo(route: HudRoute, mode: 'push' | 'replace' = 'push'): void {
  this.router.navigate(route, mode);
}

private navigateBack(): void {
  const activeRoute = this.activeRoute ?? 'home';
  this.router.back(ROUTES[activeRoute].parent);
}

navigateHome(mode: 'push' | 'replace' = 'replace'): void {
  this.pendingRoute = null;
  this.router.navigate('home', mode);
}

completeLogout(): void {
  this.currentUser = null;
  this.authResolved = true;
  this.pendingRoute = null;
  this.renderAuthControls();
  this.navigateHome('replace');
}
```

Replace auth gating at the start of `applyRoute`:

```ts
private applyRoute(route: HudRoute): void {
  const meta = ROUTES[route];
  if (!this.authResolved && meta.requiresAuth) {
    this.pendingRoute = route;
    this.showRestoringRoute();
    return;
  }

  if (!routeCanOpen(route, this.currentUser)) {
    this.pendingRoute = route;
    this.redirectToLogin(
      meta.requiresAdmin ? 'Admin access is required.' : this.loginMessageForRoute(route),
    );
    return;
  }

  if (this.activeRoute === route) {
    return;
  }

  const previousRoute = this.activeRoute;
  this.activeRoute = route;
  switch (route) {
    case 'camera':
      this.openCameraPage();
      return;
    case 'upload':
      this.openUploadPage();
      return;
    case 'upload-model':
      this.openUploadModelPage();
      return;
    case 'ar':
      this.openARPage();
      return;
    case 'full-flow':
      this.openFullFlowPage();
      return;
    case 'dynamic':
      this.openDynamicPage();
      return;
    case 'speech':
      this.openSpeechPage();
      return;
    case 'multi-object':
      this.openMultiObjectEditor();
      return;
    case 'models':
      this.openModelManagerPage();
      return;
    case 'login':
      this.openAuthPage();
      return;
    case 'admin':
      this.openAdminDashboardPage();
      return;
    case 'home':
      this.openHomePage(previousRoute);
  }
}
```

Implement resolution:

```ts
updateAuthState(user: AuthUser | null): void {
  this.currentUser = user?.status === 'active' ? user : null;
  this.authResolved = true;
  this.routeRestoring.classList.add('hidden');
  this.renderAuthControls();

  const intendedRoute = this.pendingRoute;
  if (intendedRoute && routeCanOpen(intendedRoute, this.currentUser)) {
    this.pendingRoute = null;
    this.navigateTo(intendedRoute, 'replace');
    return;
  }

  const currentRoute = parseRouteHash(window.location.hash);
  this.applyRoute(currentRoute);
}

private showRestoringRoute(): void {
  this.hideAllRouteViews();
  this.routeRestoring.classList.remove('hidden');
}

private redirectToLogin(message: string): void {
  this.activeRoute = 'login';
  this.router.navigate('login', 'replace');
  this.openAuthPage(message);
}
```

All current Back listeners must call `this.navigateBack()` rather than `this.navigateTo('home')`.

- [ ] **Step 4: Add failing WebARApp startup integration tests**

Create `tests/app/WebARAppRouting.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
const listGeneratedModels = vi.fn(async () => []);

vi.mock('../../src/services/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/authClient')>();
  return {
    ...actual,
    loadAuthToken: vi.fn(() => 'stored-token'),
    getCurrentUser,
  };
});

vi.mock('../../src/services/generatedModelClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/generatedModelClient')>();
  return { ...actual, listGeneratedModels };
});

import { WebARApp } from '../../src/app/WebARApp';

describe('WebARApp route restoration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/#/speech');
  });

  it('restores the protected deep link before completing start', async () => {
    getCurrentUser.mockResolvedValue({
      email: 'maker@example.com',
      role: 'user',
      status: 'active',
    });
    const root = document.createElement('div');
    const app = new WebARApp(root) as unknown as {
      prepareMultiObject: () => Promise<void>;
      start(): Promise<void>;
    };
    app.prepareMultiObject = vi.fn(async () => undefined);
    vi.spyOn(window, 'setInterval').mockReturnValue(0);

    await app.start();

    expect(window.location.hash).toBe('#/speech');
    expect(root.querySelector('.speech-panel')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.auth-panel')?.classList.contains('hidden')).toBe(true);
  });

  it('keeps an invalid-session deep link as the intended login destination', async () => {
    getCurrentUser.mockResolvedValue(null);
    const root = document.createElement('div');
    const app = new WebARApp(root) as unknown as {
      prepareMultiObject: () => Promise<void>;
      start(): Promise<void>;
    };
    app.prepareMultiObject = vi.fn(async () => undefined);
    vi.spyOn(window, 'setInterval').mockReturnValue(0);

    await app.start();

    expect(window.location.hash).toBe('#/login');
    expect(root.querySelector('.auth-panel')?.classList.contains('hidden')).toBe(false);
    expect(root.textContent).toContain('Sign in to use Text or Voice to 3D.');
  });
});
```

- [ ] **Step 5: Run startup integration test and verify failure**

Run: `npm.cmd test -- tests/app/WebARAppRouting.test.ts`

Expected: FAIL because `WebARApp.start()` constructs the HUD before loading/restoring auth.

- [ ] **Step 6: Reorder `WebARApp.start()` and remove direct route writes**

At the beginning of `start()`:

```ts
async start(): Promise<void> {
  this.authToken = loadAuthToken();
  this.hud = new ARHud(this.root, MODEL_OPTIONS, {
    onPlace: () => this.placeAtLatestHit(),
    onEdit: () => this.setEditing(),
    onReset: () => this.resetObject(),
    onResetScale: () => this.resetScale(),
    onRotate: (deltaRadians) => this.rotateBy(deltaRadians),
    onModelSelect: (modelId) => void this.loadSelectedModel(modelId),
    onStartCamera: () => void this.startCamera(),
    onCaptureImage: () => void this.captureImage(),
    onUploadImage: (file) => void this.uploadImage(file),
    onUploadModel: (file) => void this.uploadModel(file),
    onSubmitTarget: (targetObject) => void this.submitCapturedImageToGpt(targetObject),
    onGenerateModel: (targetObject) => void this.generateModel(targetObject),
    onFullFlowCapture: (targetObject) => void this.runFullFlow(targetObject),
    onDynamicFlowCapture: (targetObject) => void this.runDynamicFlow(targetObject),
    onStoreUploadedModel: () => void this.storeUploadedModel(),
    onRenameGeneratedModel: (modelId, label) => void this.renameGeneratedModel(modelId, label),
    onDeleteGeneratedModel: (modelId) => void this.deleteGeneratedModel(modelId),
    onToggleGeneratedModelVisibility: (modelId, visibility) => void this.toggleGeneratedModelVisibility(modelId, visibility),
    onDeleteUploadedModel: (modelId) => this.deleteUploadedModel(modelId),
    onPreviewModel: (modelId) => void this.previewModel(modelId),
    onCloseModelPreview: () => this.closeModelPreview(),
    onPreviewLightingChange: (intensity) => this.updateModelPreviewLighting(intensity),
    onPreviewLightDirectionChange: (degrees) => this.updateModelPreviewLightDirection(degrees),
    onPreviewAnimationSelect: (animationIndex) => this.selectModelPreviewAnimation(animationIndex),
    onUpdateModelThumbnail: (modelId, file) => void this.updateModelThumbnail(modelId, file),
    onReturnHome: () => void this.returnHome(),
    onLogin: (email, password) => void this.login(email, password),
    onSignup: (email, password, name) => void this.signup(email, password, name),
    onLogout: () => void this.logout(),
    onApproveAccount: (email) => void this.approveAccount(email),
    onRemoveAccount: (email) => void this.removeAccount(email),
    onRefreshAdminAccounts: () => void this.refreshAdminAccounts(),
    onRefreshAdminJobs: () => void this.refreshAdminJobs(),
    onRetryAdminJob: (jobId) => void this.retryAdminJob(jobId),
    onCleanupFailedJobArtifacts: () => void this.cleanupFailedJobArtifacts(),
    onStartSpeechRecording: () => void this.startSpeechRecording(),
    onStopSpeechRecording: () => void this.stopSpeechRecording(),
    onGenerateSpeechModel: () => void this.generateSpeechModel(),
    onGenerateTextModel: (text) => void this.generateTextModel(text),
    onAnimationSelect: (animationIndex) => this.selectModelAnimation(animationIndex),
    onStartMultiObject: () => void this.startMultiObjectSession(),
    onAddLayoutObject: () => this.promptForLayoutObject(),
    onDeleteLayoutObject: () => this.deleteSelectedLayoutObject(),
  }, {
    authRestoring: Boolean(this.authToken),
  });
  this.hud.updateModelSource('Cloudflare only');

  if (this.authToken) {
    await this.restoreSession();
  } else {
    this.hud.updateAuthState(null);
  }

  await this.refreshGeneratedModels();
  window.setInterval(() => {
    void this.refreshGeneratedModels();
  }, 60_000);
  window.addEventListener('focus', () => {
    void this.refreshGeneratedModels();
  });
}
```

In `login()` and `signup()`, delete `window.location.hash = '#/';`; `updateAuthState(session.user)` resumes the pending route.

Replace the invalid-session branches in `restoreSession()` with:

```ts
if (!user) {
  this.clearInvalidSession();
  return;
}
```

and:

```ts
} catch (error) {
  console.warn('Could not restore auth session.', error);
  this.clearInvalidSession();
}
```

Add:

```ts
private clearInvalidSession(): void {
  this.authToken = null;
  this.currentUser = null;
  clearAuthToken();
  this.hud?.updateAuthState(null);
}
```

At the end of `logout()`, replace both `this.hud?.updateAuthState(null);` and `window.location.hash = '#/';` with:

```ts
this.hud?.completeLogout();
```

In `requireAuthToken`, replace the direct hash assignment with:

```ts
this.hud?.showAuthMessage(message, true);
this.hud?.navigateToLogin(message);
```

Expose this narrow HUD method:

```ts
navigateToLogin(message: string): void {
  this.showAuthMessage(message, true);
  this.navigateTo('login', 'replace');
}
```

- [ ] **Step 7: Run auth and route tests**

Run: `npm.cmd test -- tests/app/WebARAppRouting.test.ts tests/ui/ARHud.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```powershell
git add -- src/ui/ARHud.ts src/app/WebARApp.ts tests/ui/ARHud.test.ts tests/app/WebARAppRouting.test.ts tests/app/WebARApp.test.ts
git commit -m "fix: restore protected routes after authentication"
```

---

### Task 3: Shared desktop/mobile application shell

**Files:**
- Create: `src/ui/ApplicationShell.ts`
- Create: `tests/ui/ApplicationShell.test.ts`
- Modify: `src/ui/ARHud.ts:210-740`

**Interfaces:**
- Consumes: `HudRoute`, `ROUTES`, `AuthUser`.
- Produces: `ApplicationShell.pageHost`, `ApplicationShell.overlay`.
- Produces: `setRoute(route)`, `setUser(user)`, `setRestoring(isRestoring)`.
- Emits: `onNavigate(route)`, `onBack()`, `onLogout()`.

- [ ] **Step 1: Write shell tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { ApplicationShell } from '../../src/ui/ApplicationShell';

describe('ApplicationShell', () => {
  it('renders labelled desktop and mobile navigation with one active section', () => {
    const host = document.createElement('div');
    const onNavigate = vi.fn();
    const shell = new ApplicationShell(host, {
      onNavigate,
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });

    shell.setRoute('models');

    expect(shell.pageHost.tagName).toBe('MAIN');
    expect(host.querySelector('.app-route-title')?.textContent).toBe('Models');
    expect(host.querySelector('[data-nav-route="models"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('.mobile-bottom-nav')?.getAttribute('aria-label')).toBe('Primary');
  });

  it('opens the create menu and routes from a labelled action', () => {
    const host = document.createElement('div');
    const onNavigate = vi.fn();
    new ApplicationShell(host, { onNavigate, onBack: vi.fn(), onLogout: vi.fn() });

    shell.openCreateMenu();
    expect(host.querySelector('.create-menu')?.hasAttribute('hidden')).toBe(false);
    host.querySelector<HTMLButtonElement>('[data-nav-route="speech"]')?.click();
    expect(onNavigate).toHaveBeenCalledWith('speech');
  });

  it('uses immersive chrome without standard navigation', () => {
    const host = document.createElement('div');
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });

    shell.setRoute('camera');

    expect(host.querySelector('.app-shell')?.getAttribute('data-shell')).toBe('immersive');
    expect(host.querySelector('.immersive-title')?.textContent).toBe('Camera capture');
    expect(host.querySelector('.app-header')?.getAttribute('aria-hidden')).toBe('true');
  });
});
```

- [ ] **Step 2: Run shell tests and verify failure**

Run: `npm.cmd test -- tests/ui/ApplicationShell.test.ts`

Expected: FAIL because `ApplicationShell` does not exist.

- [ ] **Step 3: Implement shell markup and behavior**

Create `src/ui/ApplicationShell.ts` with:

```ts
import type { AuthUser } from '../services/authClient';
import { ROUTES, type HudRoute } from './routes';

interface ApplicationShellHandlers {
  onNavigate(route: HudRoute): void;
  onBack(): void;
  onLogout(): void;
}

const createRoutes: HudRoute[] = [
  'camera',
  'upload',
  'upload-model',
  'speech',
  'full-flow',
  'dynamic',
];

export class ApplicationShell {
  readonly root: HTMLElement;
  readonly pageHost: HTMLElement;
  readonly overlay: HTMLElement;
  private readonly routeTitle: HTMLElement;
  private readonly immersiveTitle: HTMLElement;
  private readonly createTrigger: HTMLButtonElement;
  private readonly mobileCreateTrigger: HTMLButtonElement;
  private readonly createMenu: HTMLElement;
  private readonly identity: HTMLElement;
  private readonly adminLink: HTMLButtonElement;

  constructor(host: HTMLElement, private readonly handlers: ApplicationShellHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'app-shell';
    this.root.innerHTML = `
      <header class="app-header">
        <button class="brand-button" type="button" data-nav-route="home" aria-label="Anima You 3D home">
          <span class="brand-mark" aria-hidden="true"></span>
          <span>Anima You 3D</span>
        </button>
        <nav class="desktop-nav" aria-label="Primary">
          <button type="button" data-nav-route="home">Home</button>
          <div class="create-menu-wrap">
            <button class="create-menu-trigger" type="button" data-nav-section="create" aria-expanded="false" aria-controls="createMenu">Create</button>
          </div>
          <button type="button" data-nav-route="models">Models</button>
          <button type="button" data-nav-route="ar">Place in AR</button>
          <button type="button" data-nav-route="multi-object">Multi-object</button>
        </nav>
        <div class="shell-account">
          <span class="shell-identity"></span>
          <button type="button" data-nav-route="login">Account</button>
          <button class="shell-admin" type="button" data-nav-route="admin" hidden>Admin</button>
          <button class="shell-logout" type="button" hidden>Log out</button>
        </div>
      </header>
      <div id="createMenu" class="create-menu" role="menu" aria-label="Creation methods" hidden></div>
      <div class="route-bar">
        <button class="route-back" type="button">Back</button>
        <div class="calibration-heading">
          <span class="calibration-label">Spatial workspace</span>
          <h1 class="app-route-title"></h1>
        </div>
      </div>
      <div class="mobile-top-bar">
        <button class="route-back" type="button">Back</button>
        <strong class="mobile-route-title"></strong>
        <button type="button" data-nav-route="login">Account</button>
      </div>
      <div class="immersive-bar">
        <button class="immersive-exit" type="button">Exit</button>
        <div>
          <strong class="immersive-title"></strong>
          <span class="immersive-status"></span>
        </div>
      </div>
      <main class="app-page-host"></main>
      <nav class="mobile-bottom-nav" aria-label="Primary">
        <button type="button" data-nav-route="home">Home</button>
        <button class="mobile-create-trigger" type="button" data-nav-section="create" aria-expanded="false" aria-controls="createMenu">Create</button>
        <button type="button" data-nav-route="models">Models</button>
        <button type="button" data-nav-route="ar">AR</button>
      </nav>
      <div class="xr-overlay"></div>
    `;
    host.appendChild(this.root);
    this.pageHost = this.root.querySelector<HTMLElement>('.app-page-host')!;
    this.overlay = this.root.querySelector<HTMLElement>('.xr-overlay')!;
    this.routeTitle = this.root.querySelector<HTMLElement>('.app-route-title')!;
    this.immersiveTitle = this.root.querySelector<HTMLElement>('.immersive-title')!;
    this.createTrigger = this.root.querySelector<HTMLButtonElement>('.create-menu-trigger')!;
    this.mobileCreateTrigger = this.root.querySelector<HTMLButtonElement>('.mobile-create-trigger')!;
    this.createMenu = this.root.querySelector<HTMLElement>('.create-menu')!;
    this.identity = this.root.querySelector<HTMLElement>('.shell-identity')!;
    this.adminLink = this.root.querySelector<HTMLButtonElement>('.shell-admin')!;

    for (const route of createRoutes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.navRoute = route;
      button.textContent = ROUTES[route].title;
      button.setAttribute('role', 'menuitem');
      this.createMenu.appendChild(button);
    }

    this.root.addEventListener('click', (event) => this.handleClick(event));
  }

  setRoute(route: HudRoute): void {
    const meta = ROUTES[route];
    this.root.dataset.route = route;
    this.root.dataset.shell = meta.shell;
    this.routeTitle.textContent = meta.title;
    this.immersiveTitle.textContent = meta.title;
    this.root.querySelector<HTMLElement>('.mobile-route-title')!.textContent = meta.shortTitle;
    this.root.querySelector<HTMLElement>('.immersive-status')!.textContent = meta.initialStatus;
    this.root.querySelector<HTMLElement>('.app-header')!.setAttribute(
      'aria-hidden',
      String(meta.shell === 'immersive'),
    );
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-nav-route], [data-nav-section]')) {
      const target = button.dataset.navRoute as HudRoute | undefined;
      const section = button.dataset.navSection;
      const active = target === route
        || (target === 'ar' && meta.section === 'ar')
        || section === meta.section;
      if (active) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    }
    this.closeCreateMenu();
  }

  setUser(user: AuthUser | null): void {
    const logout = this.root.querySelector<HTMLButtonElement>('.shell-logout')!;
    this.identity.textContent = user ? user.email : 'Guest';
    logout.hidden = !user;
    this.adminLink.hidden = user?.role !== 'admin' || user.status !== 'active';
  }

  setRestoring(isRestoring: boolean): void {
    this.root.toggleAttribute('data-restoring', isRestoring);
  }

  openCreateMenu(): void {
    this.createMenu.hidden = false;
    this.createTrigger.setAttribute('aria-expanded', 'true');
    this.mobileCreateTrigger.setAttribute('aria-expanded', 'true');
    this.createMenu.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
    if (!target) {
      return;
    }
    if (target.matches('.route-back, .immersive-exit')) {
      this.handlers.onBack();
      return;
    }
    if (target.matches('.shell-logout')) {
      this.handlers.onLogout();
      return;
    }
    if (target.matches('.create-menu-trigger, .mobile-create-trigger')) {
      if (this.createMenu.hidden) {
        this.openCreateMenu();
      } else {
        this.closeCreateMenu();
      }
      return;
    }
    const route = target.dataset.navRoute as HudRoute | undefined;
    if (route) {
      this.handlers.onNavigate(route);
      this.closeCreateMenu();
    }
  }

  private closeCreateMenu(): void {
    this.createMenu.hidden = true;
    this.createTrigger.setAttribute('aria-expanded', 'false');
    this.mobileCreateTrigger.setAttribute('aria-expanded', 'false');
  }
}
```

- [ ] **Step 4: Run shell tests**

Run: `npm.cmd test -- tests/ui/ApplicationShell.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Replace ad-hoc root shell creation in `ARHud`**

Import and instantiate:

```ts
import { ApplicationShell } from './ApplicationShell';

private readonly appShell: ApplicationShell;

this.appShell = new ApplicationShell(root, {
  onNavigate: (route) => this.navigateTo(route),
  onBack: () => this.navigateBack(),
  onLogout: this.handlers.onLogout,
});
const shell = this.appShell.pageHost;
this.overlay = this.appShell.overlay;
```

Remove the old `document.createElement('div')` shell and old `xr-overlay` creation. Append standard pages to `pageHost` and immersive controls to `this.overlay`.

Update route and auth state:

```ts
this.appShell.setRoute(route);
this.appShell.setUser(this.currentUser);
this.appShell.setRestoring(!this.authResolved);
```

Remove standard-page local Back buttons from Auth, Speech, Admin, Models, and the unused Multi-object landing markup. Keep the status-panel Back element only temporarily for compatibility, rename it to `Exit`, and route it through `navigateBack`.

- [ ] **Step 6: Update HUD tests for one shared shell**

Add assertions:

```ts
expect(root.querySelector('.app-header')).not.toBeNull();
expect(root.querySelector('.mobile-bottom-nav')).not.toBeNull();
expect(root.querySelector('.app-route-title')?.textContent).toBe('Models');
expect(root.querySelectorAll('.auth-panel .page-back')).toHaveLength(0);
```

Update Back tests to click `.route-back` and simulate the previous browser entry when testing pushed navigation.

- [ ] **Step 7: Run shell and HUD tests**

Run: `npm.cmd test -- tests/ui/ApplicationShell.test.ts tests/ui/ARHud.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```powershell
git add -- src/ui/ApplicationShell.ts src/ui/ARHud.ts tests/ui/ApplicationShell.test.ts tests/ui/ARHud.test.ts
git commit -m "feat: add responsive application shell"
```

---

### Task 4: Central route lifecycle and route-specific workspace identity

**Files:**
- Modify: `src/ui/ARHud.ts:740-1815`
- Modify: `src/app/WebARApp.ts:99-160,876-895`
- Modify: `tests/ui/ARHud.test.ts:300-640,1280-1360`
- Modify: `tests/app/WebARApp.test.ts`

**Interfaces:**
- Consumes: route metadata and shell.
- Produces: `hideAllRouteViews()`, `resetImmersiveState()`, `enterPage(element)`.
- Produces: `HUDHandlers.onRouteExit(previousRoute, nextRoute)` for transient camera, speech, preview, layout, and XR cleanup.
- Guarantees: entering every route resets prior status, controls, and route-only classes.

- [ ] **Step 1: Add failing state-isolation and route-identity tests**

```ts
it('resets upload state when entering camera capture', () => {
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());
  hud.updateAuthState(activeUser);

  root.querySelector<HTMLButtonElement>('[data-nav-route="upload"]')?.click();
  expect(root.querySelector('.camera-status')?.textContent).toContain('Choose an image');

  root.querySelector<HTMLButtonElement>('[data-nav-route="camera"]')?.click();
  expect(root.querySelector('.camera-label')?.textContent).toBe('Camera capture');
  expect(root.querySelector('.camera-status')?.textContent).toBe('Frame one object, then capture an image.');
  expect(root.querySelector('.generated-model-status')?.textContent).toBe('No model generated yet.');
});

it('keeps camera-based workflow names distinct', () => {
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());
  hud.updateAuthState(activeUser);

  for (const [route, title] of [
    ['camera', 'Camera capture'],
    ['full-flow', 'Photo to AR'],
    ['dynamic', 'AI photo to AR'],
  ] as const) {
    root.querySelector<HTMLButtonElement>(`[data-nav-route="${route}"]`)?.click();
    expect(root.querySelector('.camera-label')?.textContent).toBe(title);
    expect(root.querySelector('.immersive-title')?.textContent).toBe(title);
  }
});

it('notifies the application when leaving a transient route', () => {
  const root = document.createElement('div');
  const onRouteExit = vi.fn();
  const hud = new ARHud(root, modelOptions, createHandlers({ onRouteExit }));
  hud.updateAuthState(activeUser);

  root.querySelector<HTMLButtonElement>('[data-nav-route="camera"]')?.click();
  root.querySelector<HTMLButtonElement>('[data-nav-route="upload"]')?.click();

  expect(onRouteExit).toHaveBeenCalledWith('camera', 'upload');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- tests/ui/ARHud.test.ts`

Expected: FAIL because camera entry retains the Upload message and all camera labels become `Camera`.

- [ ] **Step 3: Add one lifecycle reset path**

Add these helpers:

```ts
private readonly routeViews: HTMLElement[] = [];

private hideAllRouteViews(): void {
  for (const view of this.routeViews) {
    view.classList.add('hidden');
  }
  this.statusPanel.classList.add('hidden');
  this.hudActions.classList.add('hidden');
  this.modelRail.classList.add('hidden');
  this.arModelPicker.classList.add('hidden');
  this.gestureSurface.classList.add('hidden');
  this.cameraPanel.classList.add('hidden');
  this.fullFlowLoading.classList.add('hidden');
}

private resetImmersiveState(): void {
  this.statusPanel.classList.remove(
    'camera-active',
    'ar-picker-active',
    'full-flow-active',
    'layout-active',
    'object-placed',
  );
  this.cameraPanel.classList.remove('fullscreen');
  this.showLayoutActionButtons(false);
}

private prepareRoute(route: HudRoute, previousRoute: HudRoute | null): void {
  if (previousRoute && previousRoute !== 'home' && previousRoute !== route) {
    this.handlers.onRouteExit(previousRoute, route);
  }
  this.closeModelPreviewIfOpen();
  this.hideAllRouteViews();
  this.resetImmersiveState();
  this.appShell.setRoute(route);
  this.routeRestoring.classList.add('hidden');
  this.clearFullFlowModelOption();
  if (route !== 'ar') {
    this.arPlacementStarted = false;
  }
}
```

Populate `routeViews` after construction:

```ts
this.routeViews.push(
  this.landing,
  this.authPanel,
  this.adminDashboard,
  this.speechPanel,
  this.modelManager,
  this.layoutManager,
);
```

Call `prepareRoute(route)` once after route guards and before route dispatch. Remove repeated show/hide blocks from each `open*Page`.

Replace `HUDHandlers.onReturnHome` with:

```ts
onRouteExit(previousRoute: HudRoute, nextRoute: HudRoute): void;
```

Update `createHandlers()` in `tests/ui/ARHud.test.ts` with `onRouteExit: vi.fn()`.

In `applyRoute`, capture and pass the previous route:

```ts
const previousRoute = this.activeRoute;
this.activeRoute = route;
this.prepareRoute(route, previousRoute);
```

- [ ] **Step 4: Route transient cleanup through `WebARApp`**

In the HUD handler object:

```ts
onRouteExit: (previousRoute, nextRoute) => {
  void this.leaveRoute(previousRoute, nextRoute);
},
```

Rename `returnHome()` to `resetTransientExperience()` and add:

```ts
private async leaveRoute(previousRoute: HudRoute, _nextRoute: HudRoute): Promise<void> {
  const transientRoutes: HudRoute[] = [
    'camera',
    'upload',
    'upload-model',
    'full-flow',
    'dynamic',
    'speech',
    'ar',
    'multi-object',
  ];
  if (!transientRoutes.includes(previousRoute)) {
    return;
  }
  await this.resetTransientExperience();
}
```

Import `type HudRoute` from `../ui/routes` and use this exact cleanup body:

```ts
private async resetTransientExperience(): Promise<void> {
  stopCameraPreview(this.cameraStream);
  this.cameraStream = null;
  this.capturedImage = null;
  this.capturedImageGenerationPipeline = 'openai-to-3d';
  this.speechRecordingSession?.cancel();
  this.speechRecordingSession = null;
  this.speechAudio = null;
  this.speechJobWatchToken += 1;
  this.pendingUploadModelFile = null;
  this.layoutMode = false;
  this.layoutSceneManager?.clear();
  this.clearCapturedImagePreview();
  this.closeModelPreview();

  const session = this.sceneContext?.renderer.xr.getSession();
  if (session) {
    await session.end().catch(() => undefined);
  }
}
```

- [ ] **Step 5: Make each route establish its own state**

Use exact route metadata:

```ts
private openCameraPage(): void {
  this.statusPanel.classList.remove('hidden');
  this.statusPanel.classList.add('camera-active');
  this.cameraPanel.classList.remove('hidden');
  this.cameraPanel.classList.add('fullscreen');
  this.showLiveCameraPreview('camera');
  this.handlers.onStartCamera();
}

private showLiveCameraPreview(route: 'camera' | 'full-flow' | 'dynamic' = 'camera'): void {
  const meta = ROUTES[route];
  this.cameraLabel.textContent = meta.title;
  this.cameraStatusMessage.textContent = meta.initialStatus;
  this.generatedModelMessage.textContent = 'No model generated yet.';
  this.uploadImageField.classList.add('hidden');
  this.uploadImageInput.value = '';
  this.uploadModelField.classList.add('hidden');
  this.uploadModelInput.value = '';
  this.cameraActions.classList.remove('hidden');
  this.generatedModelMessage.classList.remove('hidden');
  this.cameraPreviewImage.classList.add('hidden');
  this.cameraPreviewImage.removeAttribute('src');
  this.cameraPreviewVideo.classList.remove('hidden');
  this.targetObjectInput.value = '';
  this.targetObjectInput.classList.add('hidden');
  this.targetObjectLabel.classList.add('hidden');
  this.captureButton.classList.remove('hidden');
  this.captureButton.disabled = false;
  this.submitButton.classList.add('hidden');
  this.submitButton.disabled = true;
  this.generateButton.classList.remove('hidden');
  this.generateButton.textContent = this.generationButtonLabel();
  this.generateButton.disabled = true;
  this.storeModelButton.classList.add('hidden');
  this.storeModelButton.disabled = true;
}

private openFullFlowPage(): void {
  this.statusPanel.classList.remove('hidden');
  this.statusPanel.classList.add('camera-active', 'full-flow-active');
  this.cameraPanel.classList.remove('hidden');
  this.cameraPanel.classList.add('fullscreen');
  this.showLiveCameraPreview('full-flow');
  this.handlers.onStartCamera();
}

private openDynamicPage(): void {
  this.statusPanel.classList.remove('hidden');
  this.statusPanel.classList.add('camera-active', 'full-flow-active');
  this.cameraPanel.classList.remove('hidden');
  this.cameraPanel.classList.add('fullscreen');
  this.showLiveCameraPreview('dynamic');
  this.handlers.onStartCamera();
}
```

Set upload labels and copy to `ROUTES.upload` and `ROUTES['upload-model']`. Update “Submit” to “Extract object,” “Generate 3D” to “Generate model,” and “Store Model” to “Upload model.” Remove direct hash writes from `showMultiObjectEditor()` and route `showFullFlowReady()` through `this.navigateTo('ar', 'replace')`. In `WebARApp.startCamera()`, remove `this.hud?.showLiveCameraPreview()` because route entry now owns that reset; keep only camera stream startup and `updateCameraStatus('Camera ready. Capture one object when the frame is clear.', false)`.

- [ ] **Step 6: Run HUD and application tests**

Run: `npm.cmd test -- tests/ui/ARHud.test.ts tests/app/WebARApp.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- src/ui/ARHud.ts src/app/WebARApp.ts tests/ui/ARHud.test.ts tests/app/WebARApp.test.ts
git commit -m "fix: isolate route workspace state"
```

---

### Task 5: Design tokens, bundled typography, controls, and global accessibility

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/main.ts`
- Modify: `index.html`
- Modify: `src/styles.css:1-2808`
- Modify: `tests/ui/styles.test.ts`

**Interfaces:**
- Produces CSS tokens used by all later route tasks.
- Produces shared classes: `.button`, `.primary`, `.secondary`, `.quiet`, `.danger`, `.field`, `.surface`, `.calibration-frame`.

- [ ] **Step 1: Replace brittle legacy style tests with failing system tests**

Replace `tests/ui/styles.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/styles.css'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('application design system', () => {
  it('defines the approved spatial-workbench tokens', () => {
    for (const declaration of [
      '--color-canvas: #f4f8f7;',
      '--color-surface: #ffffff;',
      '--color-ink: #102f2f;',
      '--color-teal: #0b8f87;',
      '--color-amber: #f2a93b;',
      '--color-error: #d85d4a;',
      '--content-max: 1280px;',
      '--control-height: 48px;',
    ]) {
      expect(styles).toContain(declaration);
    }
  });

  it('makes semantic hidden state and keyboard focus reliable', () => {
    expect(styles).toContain('[hidden] {\n  display: none !important;\n}');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('outline: 3px solid var(--color-focus);');
  });

  it('defines separate mobile, intermediate, and desktop behavior', () => {
    expect(styles).toContain('@media (max-width: 767px)');
    expect(styles).toContain('@media (min-width: 768px) and (max-width: 1023px)');
    expect(styles).toContain('@media (min-width: 1024px)');
  });

  it('honors reduced motion and mobile safe areas', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('env(safe-area-inset-bottom)');
  });
});
```

- [ ] **Step 2: Run style tests and verify failure**

Run: `npm.cmd test -- tests/ui/styles.test.ts`

Expected: FAIL because the approved tokens and breakpoint system are not present.

- [ ] **Step 3: Install exact self-hosted fonts**

Run:

```powershell
npm.cmd install @fontsource/sora@5.2.8 @fontsource/source-sans-3@5.2.9 @fontsource/ibm-plex-mono@5.2.6
```

Expected: `package.json` and `package-lock.json` update with the three Fontsource dependencies and no install errors.

- [ ] **Step 4: Import only required font weights**

At the top of `src/main.ts`:

```ts
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
```

- [ ] **Step 5: Replace the CSS foundation**

Start `src/styles.css` with this exact foundation, then move route rules under the layer comments:

```css
:root {
  --color-canvas: #f4f8f7;
  --color-surface: #ffffff;
  --color-ink: #102f2f;
  --color-ink-muted: #496664;
  --color-teal: #0b8f87;
  --color-teal-deep: #076a65;
  --color-amber: #f2a93b;
  --color-error: #d85d4a;
  --color-border: #d5e4e1;
  --color-success: #2c8b5e;
  --color-focus: #0b8f87;
  --font-display: "Sora", sans-serif;
  --font-body: "Source Sans 3", sans-serif;
  --font-utility: "IBM Plex Mono", monospace;
  --content-max: 1280px;
  --control-height: 48px;
  --radius-control: 10px;
  --radius-panel: 16px;
  --shadow-panel: 0 18px 55px rgba(16, 47, 47, 0.11);
  color: var(--color-ink);
  background: var(--color-canvas);
  font-family: var(--font-body);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

[hidden] {
  display: none !important;
}

.hidden {
  display: none !important;
}

html,
body,
#app {
  width: 100%;
  min-height: 100%;
  margin: 0;
}

canvas {
  position: fixed;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

body {
  min-width: 320px;
  overflow-x: hidden;
  background:
    linear-gradient(rgba(11, 143, 135, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(11, 143, 135, 0.055) 1px, transparent 1px),
    var(--color-canvas);
  background-size: 48px 48px;
}

button,
input,
select,
textarea {
  font: inherit;
}

button,
[role="button"],
input,
select,
textarea,
a {
  touch-action: manipulation;
}

:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

button {
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 0 16px;
  color: var(--color-ink);
  background: var(--color-surface);
  font-weight: 700;
  cursor: pointer;
}

button.primary,
.primary {
  border-color: var(--color-teal);
  color: #ffffff;
  background: var(--color-teal);
}

button.primary:hover,
.primary:hover {
  border-color: var(--color-teal-deep);
  background: var(--color-teal-deep);
}

button.danger,
.danger {
  border-color: color-mix(in srgb, var(--color-error) 42%, var(--color-border));
  color: #8f2f24;
  background: #fff1ef;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.surface {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
}

input,
select,
textarea {
  min-height: var(--control-height);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: 10px 12px;
  color: var(--color-ink);
  background: var(--color-surface);
}

textarea {
  line-height: 1.5;
}

h1,
h2,
h3 {
  font-family: var(--font-display);
}

.utility-label,
.calibration-label,
.status-label {
  font-family: var(--font-utility);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.calibration-frame {
  position: relative;
}

.calibration-frame::before,
.calibration-frame::after {
  content: "";
  position: absolute;
  width: 22px;
  height: 22px;
  border-color: var(--color-teal);
  pointer-events: none;
}

.calibration-frame::before {
  top: 12px;
  left: 12px;
  border-top: 2px solid;
  border-left: 2px solid;
}

.calibration-frame::after {
  right: 12px;
  bottom: 12px;
  border-right: 2px solid;
  border-bottom: 2px solid;
}
```

- [ ] **Step 6: Align `index.html` initial paint**

Replace the inline colors with:

```html
<style>
  html,
  body,
  #app {
    width: 100%;
    min-height: 100%;
    margin: 0;
    background: #f4f8f7;
  }

  body {
    color: #102f2f;
  }
</style>
```

- [ ] **Step 7: Add shell breakpoint rules**

```css
.app-shell {
  min-height: 100dvh;
}

.app-header {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 24px;
  min-height: 72px;
  padding-inline: max(24px, calc((100vw - var(--content-max)) / 2));
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  backdrop-filter: blur(16px);
}

.brand-button,
.desktop-nav,
.shell-account {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-button {
  padding-inline: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-display);
}

.desktop-nav {
  flex: 1;
}

.route-bar {
  position: fixed;
  top: 72px;
  right: 0;
  left: 0;
  align-items: center;
  gap: 16px;
  min-height: 72px;
  padding-inline: max(24px, calc((100vw - var(--content-max)) / 2));
  border-bottom: 1px solid var(--color-border);
  background: var(--color-canvas);
}

.mobile-top-bar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: calc(56px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 10px 0;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 96%, transparent);
  backdrop-filter: blur(16px);
}

.mobile-route-title {
  overflow: hidden;
  font-family: var(--font-display);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-header,
.route-bar,
.mobile-top-bar,
.immersive-bar,
.mobile-bottom-nav {
  position: relative;
  z-index: 30;
}

.app-page-host {
  min-height: 100dvh;
}

.xr-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  pointer-events: none;
}

.gesture-surface {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  touch-action: none;
}

.create-menu {
  position: fixed;
  z-index: 70;
  display: grid;
  gap: 6px;
  width: min(360px, calc(100vw - 32px));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  padding: 10px;
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
}

.create-menu button {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}

@media (max-width: 767px) {
  .app-header,
  .route-bar {
    display: none;
  }

  .mobile-top-bar,
  .mobile-bottom-nav {
    display: grid;
  }

  .mobile-bottom-nav {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-surface) 96%, transparent);
    backdrop-filter: blur(16px);
  }

  .mobile-bottom-nav button {
    min-width: 0;
    min-height: 52px;
    padding-inline: 6px;
    border: 0;
    background: transparent;
  }

  .create-menu {
    right: 16px;
    bottom: calc(76px + env(safe-area-inset-bottom));
    left: 16px;
    width: auto;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .app-header,
  .route-bar {
    display: none;
  }

  .mobile-top-bar,
  .mobile-bottom-nav {
    display: grid;
  }

  .app-page-host > section {
    width: min(760px, 100%);
    margin-inline: auto;
  }
}

@media (min-width: 1024px) {
  .mobile-top-bar,
  .mobile-bottom-nav {
    display: none;
  }

  .app-header,
  .route-bar {
    display: flex;
  }

  .create-menu {
    top: 72px;
    left: max(24px, calc((100vw - var(--content-max)) / 2 + 132px));
  }
}

.app-shell[data-shell="immersive"] .app-header,
.app-shell[data-shell="immersive"] .route-bar,
.app-shell[data-shell="immersive"] .mobile-top-bar,
.app-shell[data-shell="immersive"] .mobile-bottom-nav {
  display: none;
}

.app-shell[data-shell="standard"] .immersive-bar {
  display: none;
}

.app-shell[data-route="home"] .route-bar {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 8: Run style and full unit tests**

Run: `npm.cmd test -- tests/ui/styles.test.ts`

Expected: PASS.

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 9: Commit Task 5**

```powershell
git add -- package.json package-lock.json src/main.ts index.html src/styles.css tests/ui/styles.test.ts
git commit -m "feat: establish spatial workbench design system"
```

---

### Task 6: Home, account, speech, and admin responsive workspaces

**Files:**
- Modify: `src/ui/ARHud.ts:220-470,1690-1745,2100-2218`
- Modify: `src/styles.css`
- Modify: `tests/ui/ARHud.test.ts:65-330`

**Interfaces:**
- Uses shared shell, tokens, controls, and fields.
- Preserves existing HUD handler callbacks.

- [ ] **Step 1: Add failing route-structure tests**

```ts
it('renders a task-first home with one primary create launcher', () => {
  const root = document.createElement('div');
  new ARHud(root, modelOptions, createHandlers());

  expect(root.querySelector('.landing-preview')?.classList.contains('calibration-frame')).toBe(true);
  expect(root.querySelector('.home-primary-action')?.textContent).toBe('Create a model');
  expect(root.querySelector('.landing h1')?.textContent).toBe('Make it real. Place it here.');
});

it('fully hides the name field in login mode and reveals it in signup mode', () => {
  const root = document.createElement('div');
  new ARHud(root, modelOptions, createHandlers());
  root.querySelector<HTMLButtonElement>('[data-nav-route="login"]')?.click();

  const nameLabel = root.querySelector<HTMLInputElement>('input[name="authName"]')?.closest('label');
  expect(nameLabel?.hidden).toBe(true);
  [...root.querySelectorAll('button')].find((button) => button.textContent === 'Create account')?.click();
  expect(nameLabel?.hidden).toBe(false);
});

it('uses a full-width speech composer and deliberate action hierarchy', () => {
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());
  hud.updateAuthState(activeUser);
  root.querySelector<HTMLButtonElement>('[data-nav-route="speech"]')?.click();

  expect(root.querySelector('.speech-workspace')).not.toBeNull();
  expect(root.querySelector('.speech-text-input')?.getAttribute('aria-describedby')).toBe('speechPromptHint');
  expect(root.querySelector('.speech-actions button.primary')?.textContent).toBe('Generate model');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- tests/ui/ARHud.test.ts`

Expected: FAIL on new markup and copy.

- [ ] **Step 3: Replace Home copy and hierarchy**

Use this opening:

```html
<div class="landing-inner">
  <div class="landing-copy">
    <p class="landing-kicker">Spatial creation workspace</p>
    <h1>Make it real. Place it here.</h1>
    <p>Turn a photo, description, or existing model into something you can view in your own space.</p>
    <button class="home-primary-action primary" type="button">Create a model</button>
  </div>
  <div class="landing-preview calibration-frame" aria-hidden="true">
    <div class="preview-stage">
      <span class="preview-floor"></span>
      <span class="preview-anchor"></span>
      <span class="preview-object"></span>
    </div>
    <p><strong>Spatial preview</strong><span>Choose a model and place it at room scale.</span></p>
  </div>
  <div class="home-route-groups"></div>
</div>
```

Append the existing `modePicker` and `authActions` to `.home-route-groups`. Rename the two group headings to `Explore in AR` and `Create a model`, in that order. The primary action calls `this.appShell.openCreateMenu()`, so the same creation menu becomes a desktop popover and a mobile bottom sheet through CSS.

- [ ] **Step 4: Restructure Speech markup**

Wrap the existing composer/status pieces:

```html
<div class="speech-workspace">
  <section class="speech-composer surface calibration-frame">
    <label class="speech-text-field">
      <span>Describe one object</span>
      <textarea
        class="speech-text-input"
        rows="6"
        aria-describedby="speechPromptHint"
        placeholder="A compact walnut desk with rounded corners"
      ></textarea>
    </label>
    <p id="speechPromptHint" class="field-hint">Name the object, material, color, and defining shape.</p>
    <div class="speech-actions"></div>
  </section>
  <aside class="speech-progress surface">
    <div class="speech-visualizer" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span>
    </div>
    <div class="speech-transcript-card">
      <span>Request</span>
      <p class="speech-transcript" aria-live="polite">No request entered yet.</p>
    </div>
    <ol class="speech-stage-list" aria-label="Text or voice to 3D progress">
      <li data-speech-stage="speech_input"><span class="speech-stage-marker"></span><strong>Input request</strong><small>Type or record the object</small></li>
      <li data-speech-stage="detecting_speech"><span class="speech-stage-marker"></span><strong>Prepare request</strong><small>Shape the description for 3D</small></li>
      <li data-speech-stage="generating_image"><span class="speech-stage-marker"></span><strong>Generate image</strong><small>Create a clean reconstruction source</small></li>
      <li data-speech-stage="generating_3d"><span class="speech-stage-marker"></span><strong>Generate model</strong><small>Build the 3D object</small></li>
    </ol>
    <p class="speech-background-note hidden">You can leave this page. The model will continue generating and appear in Models when it is ready.</p>
  </aside>
</div>
```

Relabel actions:

```ts
this.speechTextGenerateButton = this.createButton('Generate model', 'primary', () => {
  this.handlers.onGenerateTextModel(this.speechTextInput.value.trim().replace(/\s+/g, ' '));
});
this.speechRecordButton.textContent = 'Record description';
this.speechStopButton.textContent = 'Stop recording';
this.speechGenerateButton.textContent = 'Generate from recording';
```

- [ ] **Step 5: Restructure Admin markup into two regions**

Wrap Accounts and Jobs:

```html
<div class="admin-workspace">
  <section class="admin-dashboard-section surface" aria-labelledby="adminAccountsTitle">
    <div class="admin-dashboard-section-header">
      <h3 id="adminAccountsTitle">Accounts</h3>
      <button class="admin-refresh-accounts" type="button">Refresh accounts</button>
    </div>
    <div class="admin-account-list"></div>
  </section>
  <section class="admin-dashboard-section surface" aria-labelledby="adminJobsTitle">
    <div class="admin-dashboard-section-header">
      <h3 id="adminJobsTitle">Generation jobs</h3>
      <div class="admin-dashboard-actions">
        <button class="admin-refresh-jobs" type="button">Refresh jobs</button>
        <button class="admin-cleanup-jobs danger" type="button">Clean failed previews</button>
      </div>
    </div>
    <div class="admin-job-list"></div>
    <p class="admin-job-message" aria-live="polite">Jobs load from Cloudflare storage.</p>
  </section>
</div>
```

- [ ] **Step 6: Add route layout CSS**

```css
.landing {
  min-height: 100dvh;
  overflow-y: auto;
  padding: 104px 24px 48px;
}

.auth-panel,
.speech-panel,
.admin-dashboard {
  min-height: 100dvh;
  overflow-y: auto;
  padding: 168px 24px 48px;
}

.landing-inner,
.auth-panel-inner,
.speech-panel-inner,
.admin-dashboard-inner {
  width: min(var(--content-max), 100%);
  margin-inline: auto;
}

.speech-text-field {
  display: grid;
  gap: 8px;
  width: 100%;
}

.speech-text-input {
  width: 100%;
  min-height: 180px;
  resize: vertical;
}

.speech-workspace {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(320px, 5fr);
  gap: 24px;
}

.speech-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, auto);
  gap: 10px;
}

.admin-workspace {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 24px;
}

@media (max-width: 1023px) {
  .landing,
  .auth-panel,
  .speech-panel,
  .admin-dashboard {
    padding: 72px 16px calc(96px + env(safe-area-inset-bottom));
  }

  .speech-workspace,
  .admin-workspace {
    grid-template-columns: 1fr;
  }

  .speech-actions {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Run route and style tests**

Run: `npm.cmd test -- tests/ui/ARHud.test.ts tests/ui/styles.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```powershell
git add -- src/ui/ARHud.ts src/styles.css tests/ui/ARHud.test.ts
git commit -m "feat: redesign core creation workspaces"
```

---

### Task 7: Camera, upload, and multi-step Photo-to-AR workspaces

**Files:**
- Modify: `src/ui/ARHud.ts:590-735,995-1138,1486-1664,1746-1815`
- Modify: `src/styles.css`
- Modify: `tests/ui/ARHud.test.ts:330-640,1130-1290`

**Interfaces:**
- Uses route metadata and lifecycle from Tasks 1–4.
- Preserves camera/upload handlers.
- Produces `.creation-workspace`, `.upload-drop-zone`, `.creation-step-list`, and `.sticky-primary-action`.

- [ ] **Step 1: Add failing responsive-workspace DOM tests**

```ts
it('uses a compact upload drop zone and one full-width primary action', () => {
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());
  hud.updateAuthState(activeUser);
  root.querySelector<HTMLButtonElement>('[data-nav-route="upload"]')?.click();

  expect(root.querySelector('.upload-image-field')?.classList.contains('upload-drop-zone')).toBe(true);
  expect(root.querySelector('.upload-image-field input')?.getAttribute('aria-describedby')).toBe('imageUploadHint');
  expect(root.querySelector('.camera-actions')?.classList.contains('single-primary')).toBe(true);
  expect(root.querySelector('.camera-actions button.primary')?.textContent).toBe('Generate model');
});

it('shows real Capture, Generate, Place steps for photo-to-ar routes only', () => {
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());
  hud.updateAuthState(activeUser);

  root.querySelector<HTMLButtonElement>('[data-nav-route="full-flow"]')?.click();
  expect([...root.querySelectorAll('.creation-step-list li')].map((item) => item.textContent?.trim())).toEqual([
    'Capture',
    'Generate',
    'Place',
  ]);

  root.querySelector<HTMLButtonElement>('[data-nav-route="camera"]')?.click();
  expect(root.querySelector('.creation-step-list')?.classList.contains('hidden')).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- tests/ui/ARHud.test.ts`

Expected: FAIL because the drop-zone and real flow-step structure do not exist.

- [ ] **Step 3: Add creation workspace structure**

Replace the camera panel wrapper with:

```html
<section class="camera-panel creation-workspace hidden">
  <div class="creation-stage calibration-frame">
    <p class="camera-label utility-label"></p>
    <video class="camera-preview" muted playsinline></video>
    <img class="camera-preview hidden" alt="Selected object preview">
    <label class="upload-image-field upload-drop-zone hidden">
      <span>Choose an image</span>
      <small id="imageUploadHint">PNG, JPG, or WebP with one clearly visible object.</small>
      <input name="uploadImage" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="imageUploadHint">
    </label>
    <label class="upload-model-field upload-drop-zone hidden">
      <span>Choose a GLB model</span>
      <small id="modelUploadHint">Use a binary .glb file ready for AR placement.</small>
      <input name="uploadModel" type="file" accept=".glb,model/gltf-binary" aria-describedby="modelUploadHint">
    </label>
  </div>
  <aside class="creation-guidance">
    <ol class="creation-step-list hidden" aria-label="Progress">
      <li data-creation-stage="capture">Capture</li>
      <li data-creation-stage="generate">Generate</li>
      <li data-creation-stage="place">Place</li>
    </ol>
    <label class="target-object-field hidden">
      <span>Object to extract <small>(optional)</small></span>
      <input name="targetObject" type="text" autocomplete="off" placeholder="For example: laptop">
    </label>
    <p class="camera-status" aria-live="polite"></p>
    <p class="generated-model-status"></p>
    <div class="camera-actions"></div>
  </aside>
</section>
```

- [ ] **Step 4: Make action geometry reflect visible actions**

Add:

```ts
private syncCameraActionLayout(): void {
  const visibleButtons = [...this.cameraActions.querySelectorAll<HTMLButtonElement>('button')]
    .filter((button) => !button.classList.contains('hidden'));
  this.cameraActions.classList.toggle('single-primary', visibleButtons.length === 1);
}
```

Call it at the end of every `show*Preview`, picker, and status method that changes action visibility.

Set:

```ts
this.generateButton.textContent = this.activeRoute === 'full-flow' || this.activeRoute === 'dynamic'
  ? 'Generate and place'
  : 'Generate model';
this.storeModelButton.textContent = 'Upload model';
this.submitButton.textContent = 'Extract object';
```

- [ ] **Step 5: Keep stage state explicit**

```ts
private setCreationStage(stage: 'capture' | 'generate' | 'place' | null): void {
  const showSteps = this.activeRoute === 'full-flow' || this.activeRoute === 'dynamic';
  const list = this.cameraPanel.querySelector<HTMLElement>('.creation-step-list')!;
  list.classList.toggle('hidden', !showSteps);
  for (const item of list.querySelectorAll<HTMLElement>('[data-creation-stage]')) {
    const itemStage = item.dataset.creationStage;
    item.classList.toggle('is-active', itemStage === stage);
    item.classList.toggle(
      'is-done',
      stage === 'generate' && itemStage === 'capture'
        || stage === 'place' && itemStage !== 'place',
    );
  }
}
```

Use Capture on entry, Generate after image selection/capture, and Place after generation completes.

- [ ] **Step 6: Add responsive workspace CSS**

```css
.creation-workspace.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 8fr) minmax(320px, 4fr);
  gap: 24px;
  padding: 84px max(24px, calc((100vw - var(--content-max)) / 2)) 24px;
  background: var(--color-canvas);
  pointer-events: auto;
}

.app-shell[data-shell="standard"] .creation-workspace.fullscreen {
  padding-top: 168px;
}

.creation-stage,
.creation-guidance {
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
}

.upload-drop-zone {
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 8px;
  min-height: 260px;
  border: 2px dashed var(--color-border);
  padding: 32px;
}

.camera-actions.single-primary {
  grid-template-columns: 1fr;
}

@media (max-width: 1023px) {
  .creation-workspace.fullscreen {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(260px, 1fr) auto;
    gap: 12px;
    padding: calc(64px + env(safe-area-inset-top)) 14px calc(88px + env(safe-area-inset-bottom));
  }

  .app-shell[data-shell="standard"] .creation-workspace.fullscreen {
    padding-top: calc(72px + env(safe-area-inset-top));
  }

  .upload-drop-zone {
    min-height: 220px;
  }

  .camera-actions .primary {
    width: 100%;
  }

  .creation-guidance .camera-actions {
    position: sticky;
    bottom: calc(76px + env(safe-area-inset-bottom));
    z-index: 4;
    padding-top: 10px;
    background: var(--color-surface);
  }
}
```

- [ ] **Step 7: Run HUD and full-flow tests**

Run: `npm.cmd test -- tests/ui/ARHud.test.ts tests/app/WebARApp.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 7**

```powershell
git add -- src/ui/ARHud.ts src/styles.css tests/ui/ARHud.test.ts
git commit -m "feat: redesign camera and upload flows"
```

---

### Task 8: Stable model collections and clear AR selection

**Files:**
- Create: `src/ui/modelCollections.ts`
- Create: `tests/ui/modelCollections.test.ts`
- Modify: `src/ui/ARHud.ts:1142-1178,1860-2419`
- Modify: `src/styles.css`
- Modify: `tests/ui/ARHud.test.ts:640-1120`

**Interfaces:**
- Produces: `modelCollectionsEqual(left, right): boolean`.
- Guarantees: unchanged refreshes do not replace model DOM or detach focused controls.

- [ ] **Step 1: Write model equality tests**

```ts
import { describe, expect, it } from 'vitest';
import { modelCollectionsEqual } from '../../src/ui/modelCollections';

const model = {
  id: 'chair',
  label: 'Chair',
  url: 'https://assets.example/chair.glb',
  previewUrl: 'https://assets.example/chair.png',
  visibility: 'private' as const,
};

describe('modelCollectionsEqual', () => {
  it('treats a cloned unchanged collection as equal', () => {
    expect(modelCollectionsEqual([model], [{ ...model }])).toBe(true);
  });

  it('detects label, thumbnail, visibility, order, and membership changes', () => {
    expect(modelCollectionsEqual([model], [{ ...model, label: 'Seat' }])).toBe(false);
    expect(modelCollectionsEqual([model], [{ ...model, previewUrl: 'next.png' }])).toBe(false);
    expect(modelCollectionsEqual([model], [{ ...model, visibility: 'public' }])).toBe(false);
    expect(modelCollectionsEqual([model], [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- tests/ui/modelCollections.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement stable comparison**

```ts
import type { ModelOption } from '../app/models';

const comparedKeys: Array<keyof ModelOption> = [
  'id',
  'label',
  'url',
  'previewUrl',
  'source',
  'ownerEmail',
  'visibility',
  'createdAt',
  'updatedAt',
  'bytes',
];

export function modelCollectionsEqual(left: ModelOption[], right: ModelOption[]): boolean {
  return left.length === right.length && left.every((model, index) => {
    const candidate = right[index];
    return Boolean(candidate) && comparedKeys.every((key) => model[key] === candidate[key]);
  });
}
```

- [ ] **Step 4: Add a failing focus-preservation HUD test**

```ts
it('does not replace focused model controls when refresh data is unchanged', () => {
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());
  const generated = {
    id: 'generated-chair',
    label: 'Generated chair',
    url: 'https://assets.example/generated-chair.glb',
    ownerEmail: activeUser.email,
    visibility: 'private' as const,
  };
  hud.updateAuthState(activeUser);
  hud.updateGeneratedModels([generated]);
  root.querySelector<HTMLButtonElement>('[data-nav-route="models"]')?.click();

  const previewButton = root.querySelector<HTMLButtonElement>('[data-model-id="generated-chair"] [data-action="preview"]')!;
  previewButton.focus();
  hud.updateGeneratedModels([{ ...generated }]);

  expect(document.activeElement).toBe(previewButton);
  expect(root.querySelector('[data-model-id="generated-chair"] [data-action="preview"]')).toBe(previewButton);
});
```

- [ ] **Step 5: Skip unchanged renders**

Import and update:

```ts
import { modelCollectionsEqual } from './modelCollections';

updateGeneratedModels(generatedModels: ModelOption[]): void {
  if (modelCollectionsEqual(this.generatedModelOptions, generatedModels)) {
    return;
  }
  this.generatedModelOptions = [...generatedModels];
  this.renderModelSelect();
  if (!this.modelEditDialog) {
    this.renderModelManagerList();
  }
}

updateUploadedModels(uploadedModels: ModelOption[]): void {
  if (modelCollectionsEqual(this.uploadedModelOptions, uploadedModels)) {
    return;
  }
  this.uploadedModelOptions = [...uploadedModels];
  this.renderModelSelect();
  if (!this.modelEditDialog) {
    this.renderModelManagerList();
  }
}
```

- [ ] **Step 6: Add AR picker title, instruction, and non-color selection state**

Before controls, add:

```html
<header class="ar-picker-heading calibration-heading">
  <span class="calibration-label">Placement library</span>
  <h2>Choose a model</h2>
  <p>Select one model, then continue to AR placement.</p>
</header>
```

On cards:

```ts
card.setAttribute('aria-pressed', String(isSelected));
const selectedLabel = document.createElement('span');
selectedLabel.className = 'selection-label';
selectedLabel.textContent = isSelected ? 'Selected' : 'Select';
```

Use button copy `Place selected model`.

- [ ] **Step 7: Add responsive collection CSS**

```css
.model-manager-inner,
.ar-model-picker-inner {
  width: min(var(--content-max), 100%);
  margin-inline: auto;
}

.model-manager,
.ar-model-picker {
  min-height: 100dvh;
  overflow-y: auto;
  padding: 168px 24px 48px;
  background: var(--color-canvas);
  pointer-events: auto;
}

.ar-model-card[aria-pressed="true"],
.model-manager-row.is-selected {
  border-color: var(--color-teal);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-teal) 24%, transparent);
}

.selection-label {
  font-family: var(--font-utility);
  font-size: 11px;
}

@media (max-width: 767px) {
  .model-manager,
  .ar-model-picker {
    padding: 72px 14px calc(96px + env(safe-area-inset-bottom));
  }

  .model-manager-actions {
    grid-template-columns: repeat(3, 44px);
  }

  .model-manager-actions button {
    width: 44px;
    min-width: 44px;
    min-height: 44px;
  }

  .ar-model-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

- [ ] **Step 8: Run model tests**

Run: `npm.cmd test -- tests/ui/modelCollections.test.ts tests/ui/ARHud.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit Task 8**

```powershell
git add -- src/ui/modelCollections.ts src/ui/ARHud.ts src/styles.css tests/ui/modelCollections.test.ts tests/ui/ARHud.test.ts
git commit -m "fix: preserve model interactions during refresh"
```

---

### Task 9: Accessible preview, edit, and destructive dialogs

**Files:**
- Create: `src/ui/dialog.ts`
- Create: `tests/ui/dialog.test.ts`
- Modify: `src/ui/ARHud.ts:497-548,1192-1245,1980-2102,2582-2711`
- Modify: `src/styles.css`
- Modify: `tests/ui/ARHud.test.ts:840-1110`

**Interfaces:**
- Produces: `openDialog(dialog, options): () => void`.
- Consumes: dialog element, initial focus element, and close callback.
- Guarantees: modal semantics, Escape, Tab loop, backdrop close, and focus restoration.

- [ ] **Step 1: Write dialog utility tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { openDialog } from '../../src/ui/dialog';

describe('openDialog', () => {
  it('traps focus, closes on Escape, and restores the opener', () => {
    const opener = document.createElement('button');
    const dialog = document.createElement('div');
    const first = document.createElement('button');
    const last = document.createElement('button');
    dialog.append(first, last);
    document.body.append(opener, dialog);
    opener.focus();
    const onClose = vi.fn();

    const close = openDialog(dialog, { initialFocus: first, onClose });
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(first);

    last.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
    close();
    expect(document.activeElement).toBe(opener);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm.cmd test -- tests/ui/dialog.test.ts`

Expected: FAIL because the dialog utility does not exist.

- [ ] **Step 3: Implement focus management**

```ts
interface DialogOptions {
  initialFocus?: HTMLElement;
  onClose(): void;
}

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function openDialog(dialog: HTMLElement, options: DialogOptions): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      options.onClose();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const onClick = (event: MouseEvent) => {
    if (event.target === dialog) {
      options.onClose();
    }
  };

  dialog.addEventListener('keydown', onKeyDown);
  dialog.addEventListener('click', onClick);
  (options.initialFocus ?? dialog.querySelector<HTMLElement>(focusableSelector) ?? dialog).focus();

  return () => {
    dialog.removeEventListener('keydown', onKeyDown);
    dialog.removeEventListener('click', onClick);
    opener?.focus();
  };
}
```

- [ ] **Step 4: Upgrade model preview semantics**

Give the preview title an ID and link it:

```html
<section class="model-preview hidden" role="dialog" aria-modal="true" aria-labelledby="modelPreviewTitle">
  <div class="model-preview-panel">
    <div class="model-preview-bar">
      <div class="model-preview-heading">
        <span class="model-preview-kicker">3D preview</span>
        <h3 id="modelPreviewTitle" class="model-preview-title"></h3>
      </div>
      <div class="model-preview-controls" aria-label="Preview controls">
        <label class="model-preview-control model-preview-animation hidden">
          <span>Animation</span>
          <select class="model-preview-animation-select" name="modelPreviewAnimation" aria-label="Preview animation"></select>
        </label>
        <label class="model-preview-control model-preview-lighting">
          <span>Lighting</span>
          <input class="model-preview-lighting-input" type="range" min="50" max="180" step="5" value="100" aria-label="Preview lighting intensity">
          <output class="model-preview-lighting-value">100%</output>
        </label>
        <label class="model-preview-control model-preview-direction">
          <span>Direction</span>
          <input class="model-preview-direction-input" type="range" min="0" max="355" step="5" value="45" aria-label="Preview light direction">
          <output class="model-preview-direction-value">45 deg</output>
        </label>
      </div>
      <button class="model-preview-close" type="button">Close preview</button>
    </div>
    <div class="model-preview-viewport"></div>
    <p class="model-preview-status" aria-live="polite">Loading preview...</p>
  </div>
</section>
```

Store `private closeModelPreviewDialog: (() => void) | null = null;`.

On show:

```ts
this.modelPreview.classList.remove('hidden');
this.closeModelPreviewDialog ??= openDialog(this.modelPreview, {
  initialFocus: this.modelPreview.querySelector<HTMLButtonElement>('.model-preview-close') ?? undefined,
  onClose: () => this.handlers.onCloseModelPreview(),
});
```

On hide:

```ts
this.closeModelPreviewDialog?.();
this.closeModelPreviewDialog = null;
this.modelPreview.classList.add('hidden');
```

- [ ] **Step 5: Reuse utility for edit and delete confirmation**

Replace custom edit keydown handling with `openDialog`. Before irreversible generated-model delete:

```ts
private openModelDeleteConfirmation(model: ModelOption): void {
  const dialog = document.createElement('div');
  dialog.className = 'confirmation-dialog';
  dialog.setAttribute('aria-labelledby', 'deleteModelTitle');
  dialog.innerHTML = `
    <div class="confirmation-panel">
      <h3 id="deleteModelTitle">Delete model?</h3>
      <p class="confirmation-message"></p>
      <div class="confirmation-actions">
        <button type="button" data-action="cancel">Cancel</button>
        <button class="danger" type="button" data-action="confirm">Delete model</button>
      </div>
    </div>
  `;
  dialog.querySelector<HTMLElement>('.confirmation-message')!.textContent =
    `${model.label} will be removed from your library.`;
  this.modelManager.appendChild(dialog);
  const cancel = dialog.querySelector<HTMLButtonElement>('[data-action="cancel"]')!;
  const confirm = dialog.querySelector<HTMLButtonElement>('[data-action="confirm"]')!;
  let releaseFocus = () => undefined;
  const close = () => {
    releaseFocus();
    dialog.remove();
  };
  cancel.addEventListener('click', close);
  confirm.addEventListener('click', () => {
    close();
    if (model.id.startsWith('uploaded-')) {
      this.handlers.onDeleteUploadedModel(model.id);
    } else {
      this.handlers.onDeleteGeneratedModel(model.id);
    }
  });
  releaseFocus = openDialog(dialog, {
    initialFocus: cancel,
    onClose: close,
  });
}
```

Replace both generated and uploaded direct delete callbacks in `renderModelManagerList()` with `this.openModelDeleteConfirmation(model)`. The confirm action uses `.danger`; Cancel receives initial focus.

- [ ] **Step 6: Add dialog CSS**

```css
.model-preview,
.model-edit-dialog,
.confirmation-dialog {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(16, 47, 47, 0.56);
  backdrop-filter: blur(10px);
}

.model-preview-panel,
.model-edit-panel,
.confirmation-panel {
  width: min(920px, 100%);
  max-height: calc(100dvh - 32px);
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--color-surface);
  box-shadow: 0 28px 90px rgba(16, 47, 47, 0.28);
}
```

- [ ] **Step 7: Add HUD dialog tests**

Test `role`, `aria-modal`, labelled title, Escape callback, focus trap, opener restore, and delete confirmation before handler invocation.

- [ ] **Step 8: Run dialog and HUD tests**

Run: `npm.cmd test -- tests/ui/dialog.test.ts tests/ui/ARHud.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit Task 9**

```powershell
git add -- src/ui/dialog.ts src/ui/ARHud.ts src/styles.css tests/ui/dialog.test.ts tests/ui/ARHud.test.ts
git commit -m "feat: make model dialogs keyboard accessible"
```

---

### Task 10: Immersive AR and multi-object control layout

**Files:**
- Modify: `src/ui/ARHud.ts:776-825,1513-1535,2219-2419`
- Modify: `src/styles.css`
- Modify: `tests/ui/ARHud.test.ts:520-580,1300-1620`

**Interfaces:**
- Uses ApplicationShell immersive chrome.
- Preserves all placement callbacks and WebXR behavior.
- Guarantees one aligned desktop action row and mobile model rail/action sheet separation.

- [ ] **Step 1: Add failing immersive-control tests**

```ts
it('presents multi-object AR with one immersive control system', () => {
  const root = document.createElement('div');
  const hud = new ARHud(root, modelOptions, createHandlers());

  root.querySelector<HTMLButtonElement>('[data-nav-route="multi-object"]')?.click();

  expect(root.querySelector('.app-shell')?.getAttribute('data-shell')).toBe('immersive');
  expect(root.querySelector('.immersive-title')?.textContent).toBe('Multi-object AR');
  expect(root.querySelector('.status-panel')?.classList.contains('immersive-inspector')).toBe(true);
  expect(root.querySelector('.hud-actions')?.classList.contains('immersive-actions')).toBe(true);
  expect(root.querySelector('.status-panel > .page-back')).toBeNull();
});

it('keeps delete separate and identifies the selected-object action', () => {
  const root = document.createElement('div');
  new ARHud(root, modelOptions, createHandlers());
  root.querySelector<HTMLButtonElement>('[data-nav-route="multi-object"]')?.click();

  const deleteButton = [...root.querySelectorAll<HTMLButtonElement>('.hud-actions button')]
    .find((button) => button.textContent === 'Delete selected');
  expect(deleteButton?.classList.contains('danger')).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm.cmd test -- tests/ui/ARHud.test.ts`

Expected: FAIL on new immersive class and copy.

- [ ] **Step 3: Consolidate immersive markup**

On AR/multi-object entry:

```ts
this.statusPanel.classList.add('immersive-inspector');
this.hudActions.classList.add('immersive-actions');
```

Update action copy:

```ts
this.addLayoutObjectButton.textContent = 'Add model';
this.deleteLayoutObjectButton.textContent = 'Delete selected';
```

Remove the unused Multi-object introduction route and continue opening the editor directly.

Delete the old status-panel `backButton` field, construction, and object-placed “Back only” behavior. The shared `.immersive-exit` control is the only route-exit action during live Camera and AR sessions.

- [ ] **Step 4: Add desktop/mobile immersive CSS**

```css
.immersive-bar {
  position: fixed;
  top: max(12px, env(safe-area-inset-top));
  right: 14px;
  left: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: auto;
}

.immersive-inspector {
  position: fixed;
  top: 84px;
  right: 24px;
  width: min(340px, calc(100vw - 48px));
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: var(--radius-panel);
  color: #ffffff;
  background: rgba(16, 47, 47, 0.86);
}

.immersive-actions {
  position: fixed;
  right: 24px;
  bottom: max(20px, env(safe-area-inset-bottom));
  left: 24px;
  display: flex;
  justify-content: center;
  gap: 8px;
}

@media (max-width: 767px) {
  .immersive-inspector {
    top: calc(68px + env(safe-area-inset-top));
    right: 12px;
    left: 12px;
    width: auto;
    max-height: 160px;
  }

  .model-rail {
    bottom: calc(100px + env(safe-area-inset-bottom));
  }

  .immersive-actions {
    right: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom));
    left: 10px;
    overflow-x: auto;
    justify-content: flex-start;
  }
}
```

- [ ] **Step 5: Run immersive and application tests**

Run: `npm.cmd test -- tests/ui/ARHud.test.ts tests/app/WebARApp.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 10**

```powershell
git add -- src/ui/ARHud.ts src/styles.css tests/ui/ARHud.test.ts
git commit -m "feat: unify immersive ar controls"
```

---

### Task 11: Complete automated regression and production build

**Files:**
- Modify only files required by failures introduced by Tasks 1–10.

**Interfaces:**
- No new product interfaces.
- Produces a green unit suite and production build.

- [ ] **Step 1: Run focused UI and application tests**

Run:

```powershell
npm.cmd test -- tests/ui tests/app
```

Expected: all UI and app tests pass.

- [ ] **Step 2: Run the complete test suite**

Run:

```powershell
npm.cmd test
```

Expected: all tests pass; baseline was 719 tests before this redesign.

- [ ] **Step 3: Run typecheck and production build**

Run:

```powershell
npm.cmd run build
```

Expected: TypeScript completes without errors and Vite creates `dist`.

- [ ] **Step 4: Inspect the changed-file boundary**

Run:

```powershell
git status --short
git diff --check
git diff --stat 115d324..HEAD
```

Expected: no whitespace errors; unrelated worker and user-owned files remain unstaged and unmodified by this work.

- [ ] **Step 5: Commit any test-only corrections**

```powershell
git add -- src/ui src/app/WebARApp.ts src/styles.css tests/ui tests/app package.json package-lock.json index.html
git commit -m "test: complete web ar redesign coverage"
```

Skip this commit if Step 1–4 require no corrections.

---

### Task 12: Desktop/mobile browser audit and final visual critique

**Files:**
- Modify only files needed to correct reproduced browser failures.

**Interfaces:**
- No new product interfaces.
- Verifies every route at the three required viewport classes.

- [ ] **Step 1: Start the isolated development server**

Run:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5180
```

Expected: Vite serves Anima You 3D at `http://127.0.0.1:5180`.

- [ ] **Step 2: Audit all routes at 390×844**

Verify the wrapper prerequisite and start an isolated browser session:

```powershell
Get-Command npx.cmd
$pwcli = 'C:\Users\shibi\.codex\skills\playwright\scripts\playwright_cli.sh'
New-Item -ItemType Directory -Force 'output\playwright' | Out-Null
bash $pwcli --session web-ar-redesign open about:blank --headed
```

Install safe camera/auth/model API mocks before app navigation:

```powershell
bash $pwcli --session web-ar-redesign run-code "await page.addInitScript(() => { localStorage.setItem('web-ar-auth-token', 'audit-token'); Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => new MediaStream() } }); HTMLMediaElement.prototype.play = async () => undefined; }); await page.route('**/auth/session', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { email: 'admin@example.com', name: 'Admin', role: 'admin', status: 'active' } }) })); await page.route('**/auth/users', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ email: 'maker@example.com', name: 'Maker', role: 'user', status: 'pending' }] }) })); await page.route('**/generate-3d/models', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ id: 'generated-chair', label: 'Generated chair', model_url: 'https://assets.example/chair.glb', object_key: 'models/chair.glb', owner_email: 'admin@example.com', visibility: 'private', bytes: 204800, completed_at: '2026-07-16T10:00:00Z' }, { id: 'public-lamp', label: 'Public lamp', model_url: 'https://assets.example/lamp.glb', object_key: 'models/lamp.glb', visibility: 'public', bytes: 102400, completed_at: '2026-07-15T10:00:00Z' }] }) })); await page.route('**/jobs', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: [{ id: 'job-1', label: 'Generated chair', status: 'completed', owner_email: 'admin@example.com', completed_at: '2026-07-16T10:00:00Z', bytes: 204800 }] }) }));"
```

Capture every route:

```powershell
bash $pwcli --session web-ar-redesign resize 390 844
bash $pwcli --session web-ar-redesign run-code "const routes = ['home','models','ar','multi-object','login','speech','camera','upload','upload-model','full-flow','dynamic','admin']; for (const route of routes) { const hash = route === 'home' ? '#/' : '#/' + route; await page.goto('http://127.0.0.1:5180/' + hash); await page.waitForTimeout(150); await page.screenshot({ path: 'output/playwright/mobile-' + route + '.png', fullPage: true }); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth); if (overflow) throw new Error('Horizontal overflow on ' + route); }"
```

Inspect the twelve screenshots and use `snapshot` on any route requiring interaction. The route list is:

```text
#/
#/models
#/ar
#/multi-object
#/login
#/speech
#/camera
#/upload
#/upload-model
#/full-flow
#/dynamic
#/admin
```

Expected:

- no horizontal overflow;
- stable top/bottom navigation;
- primary actions above safe areas;
- full-width speech composer;
- compact upload zones;
- distinct camera-flow titles;
- no overlapping route title and Back/Exit controls;
- dialogs usable by keyboard.

- [ ] **Step 3: Audit all routes at 768×1024**

Run:

```powershell
bash $pwcli --session web-ar-redesign resize 768 1024
bash $pwcli --session web-ar-redesign run-code "const routes = ['home','models','ar','multi-object','login','speech','camera','upload','upload-model','full-flow','dynamic','admin']; for (const route of routes) { const hash = route === 'home' ? '#/' : '#/' + route; await page.goto('http://127.0.0.1:5180/' + hash); await page.waitForTimeout(150); await page.screenshot({ path: 'output/playwright/tablet-' + route + '.png', fullPage: true }); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth); if (overflow) throw new Error('Horizontal overflow on ' + route); }"
```

Expected:

- mobile navigation model remains active;
- content uses the wider column;
- no compressed desktop header;
- selected two-column components do not overflow.

- [ ] **Step 4: Audit all routes at 1440×1000**

Run:

```powershell
bash $pwcli --session web-ar-redesign resize 1440 1000
bash $pwcli --session web-ar-redesign run-code "const routes = ['home','models','ar','multi-object','login','speech','camera','upload','upload-model','full-flow','dynamic','admin']; for (const route of routes) { const hash = route === 'home' ? '#/' : '#/' + route; await page.goto('http://127.0.0.1:5180/' + hash); await page.waitForTimeout(150); await page.screenshot({ path: 'output/playwright/desktop-' + route + '.png', fullPage: true }); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth); if (overflow) throw new Error('Horizontal overflow on ' + route); }"
```

Expected:

- header and route bar are stable;
- content never exceeds 1280px;
- Speech uses 7/5 layout;
- Admin uses two regions;
- Camera and upload use 8/4 workspaces;
- HUD actions remain in one row where space allows.

- [ ] **Step 5: Verify navigation and auth scenarios**

Exercise:

```text
Models → internal Back → Home → browser Back
Direct #/speech with valid stored session
Direct #/speech as guest → Login → successful login
Image Upload → Camera
Focused model Preview action → unchanged model refresh
Preview modal → Tab/Shift+Tab/Escape → focus restoration
```

Expected:

- no history loop;
- no authenticated login-page trap;
- intended route resumes;
- no cross-route status leakage;
- no detached active control;
- modal focus behavior is complete.

Use fresh snapshots before each interactive sequence:

```powershell
bash $pwcli --session web-ar-redesign run-code "await page.goto('http://127.0.0.1:5180/#/models')"
bash $pwcli --session web-ar-redesign snapshot
bash $pwcli --session web-ar-redesign go-back
bash $pwcli --session web-ar-redesign go-forward
bash $pwcli --session web-ar-redesign snapshot
```

Use element references from the latest snapshot for internal Back, login form, model Preview, Tab, Shift+Tab, and Escape interactions. Re-run `snapshot` after every route or dialog change.

- [ ] **Step 6: Perform frontend-design self-critique**

Check:

- only one Spatial Calibration Frame is visually dominant per route;
- no generic decorative gradients remain;
- typography hierarchy is consistent;
- primary actions are unmistakable;
- dark surfaces are limited to live visual-content overlays;
- no route feels like a stretched phone layout on desktop;
- mobile first viewport presents the current task before supporting explanation.

Remove any decoration or motion that does not improve orientation or state understanding.

- [ ] **Step 7: Re-run tests and build after visual corrections**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all tests and build pass.

- [ ] **Step 8: Commit browser-audit corrections**

```powershell
git add -- src tests package.json package-lock.json index.html
git commit -m "fix: complete responsive web ar audit"
```

Only stage paths changed by the redesign; do not stage user-owned worker or documentation files.
