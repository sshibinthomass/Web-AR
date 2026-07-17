# WebXRify by Arvenilo Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all twelve existing application routes as WebXRify by Arvenilo using the approved Arvenilo Precision Spatial system while preserving every current behavior, handler, route, service call, auth rule, model operation, capture flow, and WebXR interaction.

**Architecture:** Preserve the existing `ApplicationShell`, `ARHud`, router, service, and app boundaries. Copy approved binary assets unchanged into Vite-managed `src/assets`, update only presentational markup in the shell and HUD, and consolidate the existing stylesheet at its semantic sections rather than adding another override file. Existing class, data-attribute, ARIA, input-name, and state hooks remain runtime contracts.

**Tech Stack:** TypeScript 6, Vite 8, Vitest 4 with jsdom, Three.js/WebXR, plain HTML/CSS, locally hosted WOFF2 fonts and approved PNG assets.

## Global Constraints

- The product name is `WebXRify`; first-contact and endorsed contexts use `WebXRify by Arvenilo`.
- Use only the approved master assets `00-arvenilo-master-transparent-logo.png` and `00-arvenilo-master-transparent.png`; never use or derive from an `01-arvenilo-agents-*` asset.
- Preserve all twelve hashes in `src/ui/routes.ts` and do not change route access, handlers, services, worker contracts, storage, capture, model, auth, dialog, or WebXR behavior.
- Preserve `[hidden]`, `.hidden`, `.route-back`, `.create-menu*`, `.account-menu-*`, `.camera-active`, `.ar-picker-active`, `.full-flow-active`, `.fullscreen`, `.immersive-*`, `.has-animation-control`, `.is-selected`, `.is-downloading`, `.is-complete`, `data-route`, `data-shell`, `data-model-id`, `data-action`, input `name` values, dialog IDs, and existing ARIA state attributes.
- Use the exact canonical colors: Spatial Void `#020A0C`, Spatial Ink `#081D21`, Spatial Surface `#0D2A2E`, Spatial Surface Raised `#12363A`, Reality Mist `#F4FBFA`, Interface White `#FFFFFF`, Signal Mint `#5EEAD4`, Digital Violet `#7456F1`, Anchor Gold `#F4B942`, Context Slate `#4D6265`, Mist Slate `#A8B9BB`, Dark Border `#1D454A`, Light Border `#C9DADA`, Mint Wash `#D8F8F2`, Violet Wash `#E9E5FF`, Gold Wash `#FFF1CF`, Error Dark `#B83E4B`, and Error Light `#FF9099`.
- Self-host the seven supplied font files and keep the three supplied OFL license files in the committed source tree.
- Design from `320px` upward; use the `767/768`, `1023/1024`, and `1439/1440` content breakpoints, `20/32/48/64px` gutters, at least `44px` targets, safe-area support, visible focus, and reduced-motion support.
- Do not add a UI framework, CSS framework, icon dependency, router, state library, fake telemetry, fictional coordinates, or decorative motion unrelated to real state.
- Preserve unrelated dirty-worktree changes in `worker/src/index.ts`, `tests/worker/generateModelWorker.test.ts`, the design handoff, and all other user-owned untracked files.
- Use `npx.cmd vitest run --dir tests` as the authoritative test command; plain `npm.cmd test` discovers ignored worktree copies in this checkout.

---

### Task 1: Add immutable brand assets and WebXRify metadata

**Files:**
- Create: `src/assets/brand/00-arvenilo-master-transparent-logo.png`
- Create: `src/assets/brand/00-arvenilo-master-transparent.png`
- Create: `src/ui/brandAssets.ts`
- Create: `tests/ui/brandAssets.test.ts`
- Modify: `index.html`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: approved PNG sources under `Arvenilo-Design-Handoff/03-Logos/Transparent-PNG/`.
- Produces: `apertureLogoUrl: string` and `arveniloLockupUrl: string` exports for shell and route markup.

- [ ] **Step 1: Write the failing immutable-asset and metadata test**

Create `tests/ui/brandAssets.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { apertureLogoUrl, arveniloLockupUrl } from '../../src/ui/brandAssets';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string): Buffer => readFileSync(resolve(repoRoot, path));
const sha256 = (path: string): string => createHash('sha256').update(read(path)).digest('hex').toUpperCase();

describe('WebXRify brand assets', () => {
  it('uses byte-identical approved master assets and endorsed metadata', () => {
    expect(sha256('src/assets/brand/00-arvenilo-master-transparent-logo.png')).toBe(
      '919F3CC2A9377A99C0430D3CEEA8490D3B0C44E568BE112CA3854AC9A1BE5D48',
    );
    expect(sha256('src/assets/brand/00-arvenilo-master-transparent.png')).toBe(
      'C163A582BF0F1D9E860938282DAE6C2A1A39E457019D642E6A74E104AB0F7721',
    );
    expect(apertureLogoUrl).toContain('00-arvenilo-master-transparent-logo.png');
    expect(arveniloLockupUrl).toContain('00-arvenilo-master-transparent.png');

    const indexHtml = read('index.html').toString('utf8');
    expect(indexHtml).toContain('<title>WebXRify by Arvenilo</title>');
    expect(indexHtml).toContain('name="application-name" content="WebXRify by Arvenilo"');
    expect(indexHtml).toContain('name="theme-color" content="#F4FBFA"');
    expect(indexHtml).toContain('/src/assets/brand/00-arvenilo-master-transparent-logo.png');

    const packageJson = JSON.parse(read('package.json').toString('utf8')) as {
      name: string;
      description: string;
    };
    expect(packageJson.name).toBe('webxrify');
    expect(packageJson.description).toContain('WebXRify by Arvenilo');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails before assets and exports exist**

Run:

```powershell
npx.cmd vitest run tests/ui/brandAssets.test.ts
```

Expected: FAIL because `src/ui/brandAssets.ts` and the runtime asset copies do not exist.

- [ ] **Step 3: Copy the approved PNGs without modifying their bytes**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'src\assets\brand' | Out-Null
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\03-Logos\Transparent-PNG\00-arvenilo-master-transparent-logo.png' -Destination 'src\assets\brand\00-arvenilo-master-transparent-logo.png'
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\03-Logos\Transparent-PNG\00-arvenilo-master-transparent.png' -Destination 'src\assets\brand\00-arvenilo-master-transparent.png'
```

Create `src/ui/brandAssets.ts`:

```ts
import apertureLogoUrl from '../assets/brand/00-arvenilo-master-transparent-logo.png';
import arveniloLockupUrl from '../assets/brand/00-arvenilo-master-transparent.png';

export { apertureLogoUrl, arveniloLockupUrl };
```

- [ ] **Step 4: Replace document metadata and the critical inline colors**

Replace the `index.html` head metadata with:

```html
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>WebXRify by Arvenilo</title>
<meta name="application-name" content="WebXRify by Arvenilo" />
<meta
  name="description"
  content="Create and manage 3D models, then place them in your space with browser-based AR."
/>
<meta name="theme-color" content="#F4FBFA" />
<link
  rel="icon"
  type="image/png"
  sizes="325x325"
  href="/src/assets/brand/00-arvenilo-master-transparent-logo.png"
/>
```

Set the inline critical background and text values to:

```css
background: #f4fbfa;
color: #081d21;
```

Update the root package fields without changing scripts or non-font dependencies:

```json
"name": "webxrify",
"description": "WebXRify by Arvenilo creates, manages, and places 3D models through browser-based AR."
```

Then synchronize the root lockfile:

```powershell
npm.cmd install --package-lock-only
```

- [ ] **Step 5: Verify the asset test, hashes, typecheck, and production build**

Run:

```powershell
npx.cmd vitest run tests/ui/brandAssets.test.ts
npx.cmd tsc --noEmit --pretty false
npm.cmd run build
```

Expected: one brand-assets test passes, typecheck exits `0` with no output, and Vite reports `built`.

- [ ] **Step 6: Commit the immutable assets and metadata**

```powershell
git add -- src/assets/brand src/ui/brandAssets.ts tests/ui/brandAssets.test.ts index.html package.json package-lock.json
git commit -m "feat: add WebXRify brand assets and metadata"
```

---

### Task 2: Apply the endorsed identity to the shared shell, Home, and Account

**Files:**
- Modify: `src/ui/ApplicationShell.ts`
- Modify: `src/ui/ARHud.ts`
- Modify: `tests/ui/ApplicationShell.test.ts`
- Modify: `tests/ui/ARHud.test.ts`
- Modify: `tests/ui/brandAssets.test.ts`

**Interfaces:**
- Consumes: `apertureLogoUrl` and `arveniloLockupUrl` from Task 1.
- Produces: stable `.brand-aperture`, `.brand-product-name`, `.brand-endorsement`, `.product-name`, `.availability-label`, `.webxr-aperture-stage`, `.arvenilo-lockup`, and `.auth-endorsement` presentation hooks while retaining all existing navigation/action hooks.

- [ ] **Step 1: Add failing shell and route identity assertions**

Add this test to `tests/ui/ApplicationShell.test.ts` without changing its existing thirteen cases:

```ts
it('renders the endorsed WebXRify identity with the approved master aperture', () => {
  const host = document.createElement('div');
  new ApplicationShell(host, {
    onNavigate: vi.fn(),
    onBack: vi.fn(),
    onLogout: vi.fn(),
  });

  const brand = host.querySelector<HTMLButtonElement>('.brand-button')!;
  expect(brand.dataset.navRoute).toBe('home');
  expect(brand.getAttribute('aria-label')).toBe('WebXRify by Arvenilo home');
  expect(brand.querySelector('.brand-product-name')?.textContent).toBe('WebXRify');
  expect(brand.querySelector('.brand-endorsement')?.textContent).toBe('by Arvenilo');
  const image = brand.querySelector<HTMLImageElement>('img.brand-aperture')!;
  expect(image.alt).toBe('');
  expect(image.src).toContain('00-arvenilo-master-transparent-logo.png');
  expect(host.querySelector('.mobile-brand-button img.brand-aperture')).not.toBeNull();
});
```

In the first two Home tests in `tests/ui/ARHud.test.ts`, replace only their obsolete visual assertions with:

```ts
expect(root.querySelector('.landing .product-name')?.textContent).toBe('WebXRify by Arvenilo');
expect(root.querySelector('.availability-label')?.textContent).toBe('AVAILABLE NOW');
expect(root.querySelector('.webxr-aperture-stage')?.getAttribute('role')).toBe('img');
expect(root.querySelector('.webxr-aperture-stage')?.getAttribute('aria-label')).toBeTruthy();
expect(root.querySelector<HTMLImageElement>('.arvenilo-lockup')?.alt).toBe('Arvenilo');
expect(root.textContent).toContain('Where Intelligence Meets Reality.');
```

Keep the existing exact route-action arrays, hidden-state assertions, `Create a model` assertion, and Create-menu click assertion.

Extend the existing brand-assets test with:

```ts
const interfaceSources = [
  'index.html',
  'src/main.ts',
  'src/ui/ApplicationShell.ts',
  'src/ui/ARHud.ts',
  'src/ui/routes.ts',
].map((path) => read(path).toString('utf8')).join('\n');
expect(interfaceSources).not.toMatch(/Anima You 3D|Arvenilo Agent|WebXRify Agent/i);
```

- [ ] **Step 2: Run the focused tests and verify the old identity fails them**

Run:

```powershell
npx.cmd vitest run tests/ui/ApplicationShell.test.ts tests/ui/ARHud.test.ts tests/ui/brandAssets.test.ts
```

Expected: FAIL because the shell still says `Anima You 3D` and Home lacks the endorsed identity/stage/footer hooks.

- [ ] **Step 3: Replace the shell's presentational brand markup without changing navigation hooks**

Import the compact asset in `ApplicationShell.ts`:

```ts
import { apertureLogoUrl } from './brandAssets';
```

Replace the existing `.brand-button` contents with:

```html
<button class="brand-button" type="button" data-nav-route="home" aria-label="WebXRify by Arvenilo home">
  <img
    class="brand-aperture"
    src="${apertureLogoUrl}"
    alt=""
    width="325"
    height="325"
  >
  <span class="brand-copy" aria-hidden="true">
    <strong class="brand-product-name">WebXRify</strong>
    <small class="brand-endorsement">by Arvenilo</small>
  </span>
</button>
```

Insert this before the existing mobile Back button inside `.mobile-top-bar`; do not remove the Back, route-title, or account controls:

```html
<button
  class="mobile-brand-button"
  type="button"
  data-nav-route="home"
  aria-label="WebXRify by Arvenilo home"
>
  <img
    class="brand-aperture"
    src="${apertureLogoUrl}"
    alt=""
    width="325"
    height="325"
  >
</button>
```

- [ ] **Step 4: Add the approved Home stage, endorsement, and Account context**

Import both asset URLs in `ARHud.ts`:

```ts
import { apertureLogoUrl, arveniloLockupUrl } from './brandAssets';
```

Replace the Home `landing-inner` template with this structure, retaining the existing `.home-primary-action`, `.landing-preview`, `.preview-*`, and `.home-route-groups` hooks:

```html
<div class="landing-inner">
  <div class="landing-copy">
    <p class="landing-kicker">
      <span class="product-name">WebXRify by Arvenilo</span>
      <span class="availability-label">AVAILABLE NOW</span>
    </p>
    <h1>Make it real. Place it here.</h1>
    <p>Turn a photo, description, or existing model into something you can view in your own space.</p>
    <button class="home-primary-action primary" type="button">Create a model</button>
  </div>
  <div
    class="landing-preview webxr-aperture-stage calibration-frame"
    role="img"
    aria-label="A digital object converging on one selected spatial anchor."
  >
    <div class="preview-stage" aria-hidden="true">
      <span class="aperture-path aperture-path-left"></span>
      <span class="aperture-path aperture-path-right"></span>
      <span class="preview-floor"></span>
      <span class="preview-anchor"></span>
      <span class="preview-object"></span>
    </div>
    <p><strong>WebXR aperture</strong><span>Create a model, then place it at room scale.</span></p>
  </div>
  <div class="home-route-groups"></div>
  <section class="brand-endorsement-panel" aria-label="About Arvenilo">
    <div>
      <p class="utility-label">AN ARVENILO PRODUCT</p>
      <h2>Where Intelligence Meets Reality.</h2>
      <p>WebXRify turns digital creation into something you can experience in the world around you.</p>
    </div>
    <img
      class="arvenilo-lockup"
      src="${arveniloLockupUrl}"
      alt="Arvenilo"
      width="1952"
      height="806"
    >
  </section>
</div>
```

Replace the Account template's outer form with a presentational wrapper while keeping every existing field name and `.auth-*` hook:

```html
<div class="auth-panel-inner">
  <aside class="auth-brand-context">
    <img class="brand-aperture" src="${apertureLogoUrl}" alt="" width="325" height="325">
    <p class="auth-endorsement utility-label">WebXRify by Arvenilo</p>
    <h2>Bring digital objects into the world around you.</h2>
    <p>Sign in to create models, manage your library, and continue protected creation workflows.</p>
  </aside>
  <form class="auth-form surface">
    <div class="auth-panel-header">
      <h2>Login</h2>
      <p class="auth-message">Sign in with an approved account, or create one for admin approval.</p>
    </div>
    <label class="field">
      <span>Email</span>
      <input name="authEmail" type="email" autocomplete="email">
    </label>
    <label class="field">
      <span>Password</span>
      <input name="authPassword" type="password" autocomplete="current-password">
    </label>
    <label class="field" hidden>
      <span>Name</span>
      <input name="authName" type="text" autocomplete="name">
    </label>
    <div class="auth-form-actions"></div>
  </form>
</div>
```

Do not change the existing form submit listener, auth mode logic, or button handlers.

- [ ] **Step 5: Run focused and full tests plus typecheck**

Run:

```powershell
npx.cmd vitest run tests/ui/ApplicationShell.test.ts tests/ui/ARHud.test.ts tests/ui/brandAssets.test.ts
npx.cmd vitest run --dir tests
npx.cmd tsc --noEmit --pretty false
```

Expected final count at this point: `27 passed` files and `259 passed` tests; typecheck exits `0`.

- [ ] **Step 6: Commit the shared identity markup**

```powershell
git add -- src/ui/ApplicationShell.ts src/ui/ARHud.ts tests/ui/ApplicationShell.test.ts tests/ui/ARHud.test.ts tests/ui/brandAssets.test.ts
git commit -m "feat: apply WebXRify identity to the application shell"
```

---

### Task 3: Install the local type system and canonical design foundation

**Files:**
- Create: `src/assets/fonts/sora-latin-wght-normal.woff2`
- Create: `src/assets/fonts/inter-latin-wght-normal.woff2`
- Create: `src/assets/fonts/inter-latin-wght-italic.woff2`
- Create: `src/assets/fonts/ibm-plex-mono-latin-400-normal.woff2`
- Create: `src/assets/fonts/ibm-plex-mono-latin-400-italic.woff2`
- Create: `src/assets/fonts/ibm-plex-mono-latin-500-normal.woff2`
- Create: `src/assets/fonts/ibm-plex-mono-latin-500-italic.woff2`
- Create: `src/assets/fonts/LICENSE-Sora.txt`
- Create: `src/assets/fonts/LICENSE-Inter.txt`
- Create: `src/assets/fonts/LICENSE-IBM-Plex-Mono.txt`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/ui/brandAssets.test.ts`
- Modify: `tests/ui/styles.test.ts`

**Interfaces:**
- Consumes: the seven handoff WOFF2 files and three OFL licenses.
- Produces: canonical Arvenilo custom properties and local font faces used by every existing selector family.

- [ ] **Step 1: Extend the tests for exact font copies, dependency cleanup, and canonical tokens**

Add these source/runtime pairs to the existing brand-assets test and compare `read(runtime).equals(read(source))` for each pair:

```ts
const fontPairs = [
  ['Arvenilo-Design-Handoff/04-Fonts/Sora/sora-latin-wght-normal.woff2', 'src/assets/fonts/sora-latin-wght-normal.woff2'],
  ['Arvenilo-Design-Handoff/04-Fonts/Inter/inter-latin-wght-normal.woff2', 'src/assets/fonts/inter-latin-wght-normal.woff2'],
  ['Arvenilo-Design-Handoff/04-Fonts/Inter/inter-latin-wght-italic.woff2', 'src/assets/fonts/inter-latin-wght-italic.woff2'],
  ['Arvenilo-Design-Handoff/04-Fonts/IBM-Plex-Mono/ibm-plex-mono-latin-400-normal.woff2', 'src/assets/fonts/ibm-plex-mono-latin-400-normal.woff2'],
  ['Arvenilo-Design-Handoff/04-Fonts/IBM-Plex-Mono/ibm-plex-mono-latin-400-italic.woff2', 'src/assets/fonts/ibm-plex-mono-latin-400-italic.woff2'],
  ['Arvenilo-Design-Handoff/04-Fonts/IBM-Plex-Mono/ibm-plex-mono-latin-500-normal.woff2', 'src/assets/fonts/ibm-plex-mono-latin-500-normal.woff2'],
  ['Arvenilo-Design-Handoff/04-Fonts/IBM-Plex-Mono/ibm-plex-mono-latin-500-italic.woff2', 'src/assets/fonts/ibm-plex-mono-latin-500-italic.woff2'],
] as const;
for (const [source, runtime] of fontPairs) {
  expect(read(runtime).equals(read(source))).toBe(true);
}
```

Add equivalent byte comparisons for the three license source files and their `src/assets/fonts/LICENSE-*.txt` copies. Assert `src/main.ts` contains no `@fontsource` and `package.json` has none of the three `@fontsource/*` dependencies.

In `tests/ui/styles.test.ts`, replace the old token test with:

```ts
it('defines the approved Arvenilo tokens and local font families', () => {
  for (const declaration of [
    '--color-spatial-void: #020a0c;',
    '--color-spatial-ink: #081d21;',
    '--color-spatial-surface: #0d2a2e;',
    '--color-spatial-surface-raised: #12363a;',
    '--color-reality-mist: #f4fbfa;',
    '--color-interface-white: #ffffff;',
    '--color-signal-mint: #5eead4;',
    '--color-digital-violet: #7456f1;',
    '--color-anchor-gold: #f4b942;',
    '--color-context-slate: #4d6265;',
    '--color-mist-slate: #a8b9bb;',
    '--color-border-dark: #1d454a;',
    '--color-border-light: #c9dada;',
    '--color-mint-wash: #d8f8f2;',
    '--color-violet-wash: #e9e5ff;',
    '--color-gold-wash: #fff1cf;',
    '--color-error-dark: #b83e4b;',
    '--color-error-light: #ff9099;',
    '--content-max: 1600px;',
    '--radius-control: 10px;',
    '--radius-card: 16px;',
    '--radius-stage: 24px;',
  ]) {
    expect(styles).toContain(declaration);
  }
  expect(styles).toContain('font-family: "Sora Variable";');
  expect(styles).toContain('font-family: "Inter Variable";');
  expect(styles).toContain('font-family: "IBM Plex Mono";');
  expect(styles).toContain('outline: 3px solid var(--color-signal-mint);');
  expect(styles).toContain('outline-offset: 3px;');
});
```

- [ ] **Step 2: Run the focused tests and verify missing local assets/tokens fail**

```powershell
npx.cmd vitest run tests/ui/brandAssets.test.ts tests/ui/styles.test.ts
```

Expected: FAIL because the local font bundle, new tokens, and dependency cleanup are absent.

- [ ] **Step 3: Copy all fonts and licenses byte-for-byte**

```powershell
New-Item -ItemType Directory -Force -Path 'src\assets\fonts' | Out-Null
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\04-Fonts\Sora\sora-latin-wght-normal.woff2' -Destination 'src\assets\fonts\sora-latin-wght-normal.woff2'
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\04-Fonts\Inter\inter-latin-wght-normal.woff2' -Destination 'src\assets\fonts\inter-latin-wght-normal.woff2'
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\04-Fonts\Inter\inter-latin-wght-italic.woff2' -Destination 'src\assets\fonts\inter-latin-wght-italic.woff2'
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\04-Fonts\IBM-Plex-Mono\ibm-plex-mono-latin-400-normal.woff2' -Destination 'src\assets\fonts\ibm-plex-mono-latin-400-normal.woff2'
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\04-Fonts\IBM-Plex-Mono\ibm-plex-mono-latin-400-italic.woff2' -Destination 'src\assets\fonts\ibm-plex-mono-latin-400-italic.woff2'
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\04-Fonts\IBM-Plex-Mono\ibm-plex-mono-latin-500-normal.woff2' -Destination 'src\assets\fonts\ibm-plex-mono-latin-500-normal.woff2'
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\04-Fonts\IBM-Plex-Mono\ibm-plex-mono-latin-500-italic.woff2' -Destination 'src\assets\fonts\ibm-plex-mono-latin-500-italic.woff2'
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\04-Fonts\Sora\LICENSE.txt' -Destination 'src\assets\fonts\LICENSE-Sora.txt'
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\04-Fonts\Inter\LICENSE.txt' -Destination 'src\assets\fonts\LICENSE-Inter.txt'
Copy-Item -LiteralPath 'Arvenilo-Design-Handoff\04-Fonts\IBM-Plex-Mono\LICENSE.txt' -Destination 'src\assets\fonts\LICENSE-IBM-Plex-Mono.txt'
```

- [ ] **Step 4: Replace the font imports and root design foundation**

Delete all six `@fontsource/*` imports from `src/main.ts`; keep only:

```ts
import './styles.css';
import { WebARApp } from './app/WebARApp';
```

Place the seven exact `@font-face` declarations from `Arvenilo-Design-Handoff/04-Fonts/README.md` at the start of `src/styles.css`, changing only their URLs to the flattened `./assets/fonts/*.woff2` destinations above.

Replace the current root token block with:

```css
:root {
  --color-spatial-void: #020a0c;
  --color-spatial-ink: #081d21;
  --color-spatial-surface: #0d2a2e;
  --color-spatial-surface-raised: #12363a;
  --color-reality-mist: #f4fbfa;
  --color-interface-white: #ffffff;
  --color-signal-mint: #5eead4;
  --color-digital-violet: #7456f1;
  --color-anchor-gold: #f4b942;
  --color-context-slate: #4d6265;
  --color-mist-slate: #a8b9bb;
  --color-border-dark: #1d454a;
  --color-border-light: #c9dada;
  --color-mint-wash: #d8f8f2;
  --color-violet-wash: #e9e5ff;
  --color-gold-wash: #fff1cf;
  --color-error-dark: #b83e4b;
  --color-error-light: #ff9099;
  --color-canvas: var(--color-reality-mist);
  --color-surface: var(--color-interface-white);
  --color-ink: var(--color-spatial-ink);
  --color-ink-muted: var(--color-context-slate);
  --color-teal: var(--color-signal-mint);
  --color-teal-deep: color-mix(in srgb, var(--color-signal-mint) 68%, var(--color-spatial-ink));
  --color-amber: var(--color-anchor-gold);
  --color-error: var(--color-error-dark);
  --color-border: var(--color-border-light);
  --color-success: color-mix(in srgb, var(--color-signal-mint) 56%, var(--color-spatial-ink));
  --color-focus: var(--color-signal-mint);
  --font-display: "Sora Variable", "Sora", "Avenir Next", "Segoe UI", sans-serif;
  --font-text: "Inter Variable", "Inter", "Segoe UI Variable Text", "Segoe UI", sans-serif;
  --font-body: var(--font-text);
  --font-utility: "IBM Plex Mono", "Cascadia Mono", "SFMono-Regular", monospace;
  --content-reading: 720px;
  --content-standard: 1200px;
  --content-wide: 1440px;
  --content-max: 1600px;
  --gutter-mobile: 20px;
  --gutter-tablet: 32px;
  --gutter-desktop: 48px;
  --gutter-wide: 64px;
  --control-height: 48px;
  --radius-control: 10px;
  --radius-card: 16px;
  --radius-stage: 24px;
  --radius-panel: var(--radius-card);
  --radius-status: 999px;
  --shadow-panel: 0 22px 60px rgba(8, 29, 33, 0.1);
  color: var(--color-spatial-ink);
  background: var(--color-reality-mist);
  font-family: var(--font-text);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

Change the global focus rule to the exact mint outline, change `body` to a solid Reality Mist canvas, and change primary buttons to Signal Mint with Spatial Ink text. Keep `[hidden]`, `.hidden`, fixed root canvas behavior, and semantic control elements intact.

Remove the three now-unused font packages and synchronize the lockfile:

```powershell
npm.cmd uninstall @fontsource/ibm-plex-mono @fontsource/sora @fontsource/source-sans-3
```

- [ ] **Step 5: Verify focused tests, typecheck, both production bases, and font output**

```powershell
npx.cmd vitest run tests/ui/brandAssets.test.ts tests/ui/styles.test.ts
npx.cmd tsc --noEmit --pretty false
npm.cmd run build
$env:GITHUB_PAGES='true'; npm.cmd run build; Remove-Item Env:GITHUB_PAGES
```

Expected: tests pass; typecheck exits `0`; both builds report `built`; the GitHub Pages build emits hashed PNG and WOFF2 assets under `dist/assets` and uses `/Web-AR/` URLs in `dist/index.html`.

- [ ] **Step 6: Commit the local type and token foundation**

```powershell
git add -- src/assets/fonts src/main.ts src/styles.css package.json package-lock.json tests/ui/brandAssets.test.ts tests/ui/styles.test.ts
git commit -m "style: establish the Arvenilo design foundation"
```

---

### Task 4: Consolidate the shell, Home, and standard workspaces

**Files:**
- Modify: `src/styles.css`
- Modify: `tests/ui/styles.test.ts`

**Interfaces:**
- Consumes: existing markup/state hooks plus Task 2's identity hooks and Task 3's canonical tokens.
- Produces: one coherent light editorial theme for Home, Account, Speech, Admin, Models, AR selection, file-based creation, and modals.

- [ ] **Step 1: Add failing structural style assertions**

Add one style test that asserts all of these exact selectors and declarations exist:

```ts
it('styles the endorsed shell and standard workspaces as one Precision Spatial system', () => {
  for (const contract of [
    '.brand-aperture {',
    '.brand-product-name {',
    '.brand-endorsement {',
    '.webxr-aperture-stage {',
    '.brand-endorsement-panel {',
    '.auth-brand-context {',
    '.speech-stage-list li.is-active {',
    '.admin-workspace {',
    '.model-manager-row {',
    '.ar-model-card[aria-pressed="true"],',
    '.model-preview,\n.model-edit-dialog,\n.confirmation-dialog {',
    'min-height: 44px;',
  ]) {
    expect(styles).toContain(contract);
  }
});
```

- [ ] **Step 2: Run the style and DOM suites and verify the new visual contracts fail**

```powershell
npx.cmd vitest run tests/ui/styles.test.ts tests/ui/ApplicationShell.test.ts tests/ui/ARHud.test.ts
```

Expected: the new structural style test fails; all behavior-oriented DOM cases remain passing.

- [ ] **Step 3: Refactor the existing semantic CSS seam instead of appending a new theme**

Use the current `/* Responsive application shell */` marker as the consolidation seam. Refactor the existing blocks from that marker through `/* Accessible modal layer */` family-by-family. Do not create a second stylesheet, do not add `@layer`, and do not rename any runtime hook.

The consolidated shell must implement this geometry:

```css
.app-header {
  position: sticky;
  top: 0;
  z-index: 60;
  display: grid;
  grid-template-columns: minmax(230px, 1fr) auto minmax(230px, 1fr);
  align-items: center;
  min-height: 76px;
  border-bottom: 1px solid var(--color-border-light);
  padding-inline: max(var(--gutter-desktop), calc((100vw - var(--content-wide)) / 2));
  background: color-mix(in srgb, var(--color-reality-mist) 92%, transparent);
  backdrop-filter: blur(18px);
}

.brand-button {
  display: inline-flex;
  justify-self: start;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  border-color: transparent;
  padding: 6px 8px;
  background: transparent;
}

.brand-aperture {
  display: block;
  width: 40px;
  height: auto;
  flex: 0 0 auto;
}

.brand-copy {
  display: grid;
  gap: 1px;
  text-align: left;
}

.brand-product-name {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1;
}

.brand-endorsement {
  color: var(--color-context-slate);
  font-family: var(--font-utility);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  line-height: 1.2;
  text-transform: uppercase;
}

.desktop-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.desktop-nav button,
.account-menu-trigger {
  min-height: 44px;
  border-color: transparent;
  background: transparent;
  font-weight: 600;
}

.desktop-nav button[aria-current="page"] {
  border-color: var(--color-border-light);
  background: var(--color-interface-white);
}

.shell-account {
  justify-self: end;
}

.route-bar {
  width: min(var(--content-wide), calc(100% - (2 * var(--gutter-desktop))));
  margin-inline: auto;
  border-bottom: 1px solid var(--color-border-light);
  padding-block: 22px;
}
```

The Home stage and endorsement must use:

```css
.landing {
  position: relative;
  inset: auto;
  min-height: 100dvh;
  overflow: visible;
  padding: 72px var(--gutter-desktop) 96px;
  background: var(--color-reality-mist);
}

.landing-inner {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(340px, 5fr);
  gap: 32px 56px;
  width: min(var(--content-wide), 100%);
  margin-inline: auto;
}

.landing-kicker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  align-items: center;
  margin: 0 0 18px;
  color: var(--color-spatial-ink);
  font-family: var(--font-utility);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.availability-label {
  border-radius: var(--radius-status);
  padding: 5px 9px;
  color: var(--color-spatial-ink);
  background: var(--color-mint-wash);
}

.landing h1 {
  max-width: 10ch;
  margin: 0 0 18px;
  color: var(--color-spatial-ink);
  font-size: clamp(48px, 6vw, 88px);
  font-weight: 650;
  letter-spacing: -0.045em;
  line-height: 0.98;
}

.webxr-aperture-stage {
  position: relative;
  min-height: 430px;
  border: 1px solid var(--color-border-dark);
  border-radius: var(--radius-stage);
  overflow: hidden;
  color: var(--color-interface-white);
  background: var(--color-spatial-ink);
  box-shadow: none;
}

.webxr-aperture-stage .preview-floor {
  border-color: var(--color-border-dark);
  background:
    linear-gradient(var(--color-border-dark) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-border-dark) 1px, transparent 1px);
  background-size: 32px 32px;
}

.webxr-aperture-stage .preview-anchor {
  border-color: var(--color-anchor-gold);
  box-shadow: 0 0 0 12px color-mix(in srgb, var(--color-anchor-gold) 12%, transparent);
}

.webxr-aperture-stage .preview-object {
  border-color: color-mix(in srgb, var(--color-signal-mint) 55%, var(--color-border-dark));
  background: var(--color-signal-mint);
}

.brand-endorsement-panel {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 320px);
  gap: 32px;
  align-items: center;
  border-top: 1px solid var(--color-border-light);
  margin-top: 32px;
  padding-top: 48px;
}

.arvenilo-lockup {
  display: block;
  width: 100%;
  height: auto;
}
```

Use solid white cards, one-pixel Light Border, `16px` card radius, and no blanket decorative gradients for `.mode-group`, `.auth-form`, `.speech-composer`, `.speech-progress`, `.admin-dashboard-section`, `.model-manager-row`, `.ar-model-card`, `.model-edit-panel`, and `.confirmation-panel`.

- [ ] **Step 4: Apply route-specific light workspace rules while keeping state hooks**

Use these route compositions in the same semantic blocks:

```css
.auth-panel-inner {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(420px, 7fr);
  gap: 48px;
  width: min(var(--content-standard), 100%);
  margin-inline: auto;
  align-items: center;
}

.auth-brand-context {
  display: grid;
  gap: 14px;
  max-width: 480px;
}

.auth-brand-context .brand-aperture {
  width: 64px;
}

.auth-form {
  display: grid;
  gap: 18px;
  padding: 32px;
}

.speech-workspace {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(320px, 5fr);
  gap: 24px;
  align-items: start;
}

.speech-stage-list li.is-active {
  border-color: var(--color-digital-violet);
  background: var(--color-violet-wash);
}

.admin-workspace {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 24px;
  align-items: start;
}

.model-manager-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.model-manager-row,
.ar-model-card {
  min-width: 0;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-card);
  background: var(--color-interface-white);
  box-shadow: none;
}

.ar-model-card[aria-pressed="true"],
.model-manager-row.is-selected {
  border-color: var(--color-anchor-gold);
  box-shadow: 0 0 0 3px var(--color-gold-wash);
}

.model-manager-actions button,
.ar-model-place-button,
.auth-form-actions button,
.speech-actions button,
.admin-account-actions button,
.admin-job-actions button,
.admin-job-actions a {
  min-height: 44px;
}

.model-preview,
.model-edit-dialog,
.confirmation-dialog {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(2, 10, 12, 0.74);
}
```

Preserve the existing status-specific classes. Map success/active to mint, AI processing to violet, the one selected spatial target to gold, and destructive/failure states to Error Dark/Error Light with readable text.

- [ ] **Step 5: Run the focused UI suite, full suite, typecheck, and build**

```powershell
npx.cmd vitest run --dir tests/ui
npx.cmd vitest run --dir tests
npx.cmd tsc --noEmit --pretty false
npm.cmd run build
```

Expected: all UI tests, `27/259` full tests, typecheck, and build pass.

- [ ] **Step 6: Commit standard route styling**

```powershell
git add -- src/styles.css tests/ui/styles.test.ts
git commit -m "style: redesign WebXRify standard workspaces"
```

---

### Task 5: Finish immersive, responsive, and overflow-safe layouts

**Files:**
- Modify: `src/styles.css`
- Modify: `tests/ui/styles.test.ts`

**Interfaces:**
- Consumes: `data-shell`, `data-route`, immersive/creation/model state classes, and Task 4's light workspaces.
- Produces: dark camera/WebXR modes, safe responsive layouts at every approved breakpoint, and explicit overflow/target guarantees.

- [ ] **Step 1: Add failing responsive and immersive contract assertions**

Add this test to `tests/ui/styles.test.ts`:

```ts
it('defines complete Precision Spatial responsive and immersive behavior', () => {
  for (const contract of [
    '@media (max-width: 767px)',
    '@media (min-width: 768px) and (max-width: 1023px)',
    '@media (min-width: 1024px)',
    '@media (min-width: 1440px)',
    'env(safe-area-inset-bottom)',
    'overflow-wrap: anywhere;',
    'grid-template-columns: minmax(0, 1fr);',
    '.app-shell[data-shell="immersive"] {',
    '.immersive-inspector {',
    '.immersive-actions {',
    '@media (prefers-reduced-motion: reduce)',
  ]) {
    expect(styles).toContain(contract);
  }
});
```

- [ ] **Step 2: Run the style tests and verify missing breakpoint contracts fail**

```powershell
npx.cmd vitest run tests/ui/styles.test.ts
```

Expected: FAIL until the 1440 breakpoint, overflow wrapping, and consolidated immersive contract are present.

- [ ] **Step 3: Consolidate the authoritative breakpoints and remove conflicting legacy breakpoint blocks**

Delete the obsolete `@media (max-width: 860px)`, `@media (min-width: 620px)`, and `@media (max-width: 420px)` blocks after porting any still-required state positioning into the approved breakpoints. Do not delete the reduced-motion rules.

The responsive shell must include:

```css
.app-shell,
.app-page-host,
.landing-inner,
.auth-panel-inner,
.speech-panel-inner,
.admin-dashboard-inner,
.creation-workspace,
.model-manager-inner,
.ar-model-picker-inner,
.model-manager-row,
.ar-model-card {
  min-width: 0;
  max-width: 100%;
}

.model-manager-name,
.admin-account-email,
.admin-job-meta,
.account-menu-email,
.speech-transcript {
  overflow-wrap: anywhere;
}

@media (max-width: 767px) {
  .app-header,
  .route-bar {
    display: none;
  }

  .mobile-top-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    min-height: calc(56px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) var(--gutter-mobile) 0;
  }

  .mobile-brand-button {
    grid-column: 1;
    display: none;
    justify-self: start;
    min-width: 44px;
    min-height: 44px;
    border-color: transparent;
    padding: 4px;
    background: transparent;
  }

  .app-shell[data-route="home"] .mobile-brand-button {
    display: inline-flex;
  }

  .mobile-brand-button .brand-aperture {
    width: 36px;
  }

  .landing,
  .auth-panel,
  .speech-panel,
  .admin-dashboard,
  .model-manager,
  .ar-model-picker {
    padding-right: var(--gutter-mobile);
    padding-left: var(--gutter-mobile);
  }

  .landing-inner,
  .auth-panel-inner,
  .speech-workspace,
  .admin-workspace,
  .brand-endorsement-panel,
  .model-manager-list,
  .home-route-groups .mode-picker {
    grid-template-columns: minmax(0, 1fr);
  }

  .landing h1 {
    max-width: 100%;
    font-size: clamp(42px, 13vw, 58px);
    overflow-wrap: anywhere;
  }

  .webxr-aperture-stage {
    min-height: 300px;
  }

  .mobile-bottom-nav {
    padding-bottom: env(safe-area-inset-bottom);
  }

  .model-manager-actions {
    grid-template-columns: repeat(3, minmax(44px, 1fr));
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .landing,
  .auth-panel,
  .speech-panel,
  .admin-dashboard,
  .model-manager,
  .ar-model-picker {
    padding-right: var(--gutter-tablet);
    padding-left: var(--gutter-tablet);
  }

  .landing-inner,
  .auth-panel-inner,
  .speech-workspace,
  .admin-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (min-width: 1024px) {
  .app-header,
  .route-bar,
  .landing,
  .auth-panel,
  .speech-panel,
  .admin-dashboard,
  .model-manager,
  .ar-model-picker {
    padding-right: var(--gutter-desktop);
    padding-left: var(--gutter-desktop);
  }
}

@media (min-width: 1440px) {
  .app-header,
  .route-bar,
  .landing,
  .auth-panel,
  .speech-panel,
  .admin-dashboard,
  .model-manager,
  .ar-model-picker {
    padding-right: var(--gutter-wide);
    padding-left: var(--gutter-wide);
  }
}
```

Do not use `body { overflow-x: hidden }` as the fix for overflowing children; the grid and child constraints above must prevent the overflow. Intentional horizontal scrollers remain limited to the model rail and immersive action rail.

- [ ] **Step 4: Consolidate dark capture and live WebXR surfaces**

Refactor the existing camera/creation and `/* Immersive single- and multi-object AR controls */` sections to use:

```css
.app-shell[data-shell="immersive"] {
  color: var(--color-interface-white);
  background: var(--color-spatial-void);
}

.immersive-bar {
  border-bottom: 1px solid var(--color-border-dark);
  color: var(--color-interface-white);
  background: color-mix(in srgb, var(--color-spatial-ink) 92%, transparent);
}

.creation-workspace.fullscreen .creation-stage,
.model-preview-viewport {
  border-color: var(--color-border-dark);
  border-radius: var(--radius-stage);
  background: var(--color-spatial-void);
}

.immersive-inspector {
  border: 1px solid var(--color-border-dark);
  border-radius: var(--radius-card);
  color: var(--color-interface-white);
  background: color-mix(in srgb, var(--color-spatial-surface) 94%, transparent);
}

.immersive-inspector .status-label,
.immersive-inspector .status-source,
.immersive-status {
  color: var(--color-mist-slate);
}

.immersive-actions {
  border: 1px solid var(--color-border-dark);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-spatial-ink) 92%, transparent);
}

.immersive-actions button.hud-action-chip,
.immersive-actions .rotate-control,
.immersive-actions .animation-control {
  min-height: 44px;
  border-color: var(--color-border-dark);
  color: var(--color-interface-white);
  background: var(--color-spatial-surface);
}

.immersive-actions button.hud-action-chip.primary {
  border-color: var(--color-signal-mint);
  color: var(--color-spatial-ink);
  background: var(--color-signal-mint);
}

.immersive-actions button.hud-action-chip.danger {
  border-color: var(--color-error-light);
  color: var(--color-error-light);
  background: var(--color-spatial-surface);
}
```

Keep the real video/canvas as the dominant content. Keep labels, statuses, and primary actions outside media where the existing DOM permits. Preserve all current pointer-event and gesture-surface behavior.

- [ ] **Step 5: Verify tests, typecheck, and both builds**

```powershell
npx.cmd vitest run --dir tests/ui
npx.cmd vitest run --dir tests
npx.cmd tsc --noEmit --pretty false
npm.cmd run build
$env:GITHUB_PAGES='true'; npm.cmd run build; Remove-Item Env:GITHUB_PAGES
```

Expected: `27/259` full tests, typecheck, and both Vite bases pass.

- [ ] **Step 6: Commit immersive and responsive styling**

```powershell
git add -- src/styles.css tests/ui/styles.test.ts
git commit -m "style: finish responsive WebXRify workspaces"
```

---

### Task 6: Complete the functional and visual regression audit

**Files:**
- Modify only if the audit finds a presentation defect: `src/styles.css`, `src/ui/ApplicationShell.ts`, `src/ui/ARHud.ts`, `index.html`, and their presentation tests.
- Do not modify: `src/app/`, `src/services/`, `src/capture/`, `src/interaction/`, `src/xr/`, `worker/`, or non-presentation tests.

**Interfaces:**
- Consumes: the complete redesign and all existing route/behavior contracts.
- Produces: verified functional parity and responsive presentation evidence.

- [ ] **Step 1: Run the full automated regression gate from a clean dev-server state**

```powershell
npx.cmd vitest run --dir tests
npx.cmd tsc --noEmit --pretty false
npm.cmd run build
$env:GITHUB_PAGES='true'; npm.cmd run build; Remove-Item Env:GITHUB_PAGES
```

Expected: `27 passed` test files, `259 passed` tests, typecheck exit `0`, and both builds report `built`. Do not claim a coverage percentage because no coverage provider is configured.

- [ ] **Step 2: Start the local app and verify emitted assets**

Run:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5180
```

In the browser, verify the compact logo, full lockup, favicon, and all seven WOFF2 requests return `200` under the normal base. Inspect the GitHub Pages `dist/index.html` and asset requests to confirm `/Web-AR/`-prefixed hashed URLs and no `/src/` production URLs.

- [ ] **Step 3: Audit every route at the required viewport matrix**

Visit these exact hashes:

```text
#/
#/camera
#/upload
#/upload-model
#/ar
#/full-flow
#/dynamic
#/speech
#/multi-object
#/models
#/login
#/admin
```

Audit each at `1440x1000`, `834x1112`, `390x844`, and `320x720`. Also spot-check boundary widths `767`, `768`, `1023`, `1024`, `1439`, and `1440`.

For every visible route state, evaluate:

```js
({
  viewport: window.innerWidth,
  documentWidth: document.documentElement.scrollWidth,
  overflow: document.documentElement.scrollWidth > window.innerWidth,
  offenders: [...document.querySelectorAll<HTMLElement>('body *')]
    .filter((element) => {
      const style = getComputedStyle(element);
      if (style.position === 'fixed' && element.closest('canvas')) return false;
      if (element.closest('.model-rail, .immersive-actions')) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
    })
    .slice(0, 20)
    .map((element) => ({
      tag: element.tagName,
      className: element.className,
      text: element.textContent?.trim().slice(0, 60),
    })),
})
```

Expected: `overflow` is false and `offenders` is empty outside the two intentional rails. Capture screenshots for Home, Models, Account, one file-creation route, Speech, the AR picker, and an immersive AR state at desktop and mobile widths.

- [ ] **Step 4: Exercise the behavior-preservation matrix**

Verify with fresh snapshots between state changes:

```text
Home -> Create menu -> Escape -> opener focus restored
Home -> protected creation route -> Account -> intended route restored after valid sign-in
Account menu -> Escape -> actual opener focus restored
Models -> search -> filter -> favorite -> Preview -> Escape -> replacement opener focus restored
Models -> authorized Edit/Delete/Visibility actions retain their current confirmation and permission rules
Image Upload -> selected filename/preview -> generation controls
Camera -> permission guidance -> capture -> retake -> generation controls
Photo to AR and AI photo to AR -> Capture -> Generate -> Place state sequence
Text or Voice to 3D -> text/record/stop/generate states and background note
Place in AR -> model selection -> selected text/gold focus -> supported start or explicit unsupported guidance
Multi-object AR -> add/select/transform/reset/exit controls
Admin -> account/job actions remain permission-gated
Browser Back -> no history loop and no stale route state
```

If authenticated browser state is unavailable, verify protected and admin presentation through the existing jsdom DOM tests and report the live-browser authentication limitation explicitly; do not create an external account or weaken auth for screenshots.

- [ ] **Step 5: Perform accessibility and design critique**

Check visible focus, keyboard order, Escape behavior, dialog backdrop layering above the header, `200%` zoom, minimum `44x44px` actionable rects, reduced-motion mode, long account/model/status text, and light/dark contrast. Confirm:

- one WebXR Aperture Stage or selected gold focus dominates each route;
- violet appears only for agentic/generation state;
- gold is not used for ordinary primary buttons;
- logos sit only on Reality Mist or white and are not filtered, cropped, shadowed, or recolored;
- there are no generic decorative gradients, fictional telemetry, or non-functional motion;
- the first mobile viewport shows the current task before supporting explanation.

Remove any presentation-only decoration that fails these checks.

- [ ] **Step 6: Re-run the full regression gate after visual corrections**

```powershell
npx.cmd vitest run --dir tests
npx.cmd tsc --noEmit --pretty false
npm.cmd run build
$env:GITHUB_PAGES='true'; npm.cmd run build; Remove-Item Env:GITHUB_PAGES
git diff --check
```

Expected: `27/259` tests, typecheck, both builds, and whitespace validation all pass after the final correction.

- [ ] **Step 7: Commit only audit-driven presentation corrections**

```powershell
git add -- src index.html package.json package-lock.json tests/ui
git diff --cached --name-only
git commit -m "fix: complete the WebXRify responsive audit"
```

Before committing, confirm the staged list contains no `worker/`, service, capture, interaction, WebXR, user documentation, handoff, temporary, or unrelated dirty-worktree paths.

---

## Plan self-review

- **Spec coverage:** Tasks 1-5 cover identity, exact assets, local fonts, canonical tokens, shared shell, all route families, semantic state colors, motion, responsive behavior, accessibility, and the functional boundary. Task 6 covers every acceptance criterion and the required viewport/behavior matrix.
- **Placeholder scan:** Every task has concrete files, commands, assertions, implementation content, expected results, and named interfaces; no unresolved marker or generic implementation instruction remains.
- **Type consistency:** `apertureLogoUrl` and `arveniloLockupUrl` are defined once in Task 1 and consumed with the same names in Tasks 2-6. Existing handler, route, class, data, input, and ARIA contracts are preserved by name throughout.
- **Baseline evidence:** `npx.cmd vitest run --dir tests` passed `26/257` before implementation; `npx.cmd tsc --noEmit --pretty false` exited `0`. One new brand-assets test and one new shell-identity test establish the expected final `27/259` count.
