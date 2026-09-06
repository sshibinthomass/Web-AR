import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/styles.css'),
  'utf8',
).replace(/\r\n/g, '\n');

// Rule matching ignores comments, so a documented rule does not read as though
// its selector included the comment written above it.
const rules = styles.replace(/\/\*[\s\S]*?\*\//g, '');

const declarationsFor = (selector: string): string[] => (
  [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1].split(',').some((part) => part.trim() === selector))
    .map((match) => match[2])
);

const declarationsJoined = (selector: string): string => declarationsFor(selector).join('\n');

describe('layout contracts', () => {
  const bands = ['.landing', '.auth-panel', '.speech-panel', '.admin-dashboard', '.model-manager', '.ar-model-picker'];

  it('routes every page gutter through one token so the shell shares a left edge', () => {
    // The stepped values stay as the token's definition; nothing else may read
    // them directly, or two bands can end up on different edges again.
    expect(styles).toContain('--gutter: var(--gutter-mobile);');
    for (const step of ['tablet', 'desktop', 'wide']) {
      expect(styles).toContain(`--gutter: var(--gutter-${step});`);
    }
    const consumers = rules.replace(/--gutter[a-z-]*:[^;]*;/g, '');
    expect(consumers).not.toContain('var(--gutter-mobile)');
    expect(consumers).not.toContain('var(--gutter-tablet)');
    expect(consumers).not.toContain('var(--gutter-desktop)');
    expect(consumers).not.toContain('var(--gutter-wide)');
  });

  it('keeps the document as the only scroller for standard routes', () => {
    for (const band of bands) {
      const declarations = declarationsJoined(band);
      // A band that positions itself out of flow and scrolls internally gives
      // the page two scroll surfaces and lets its scrollbar eat one gutter.
      expect(declarations).not.toContain('position: fixed;');
      expect(declarations).not.toContain('overflow-y: auto;');
      expect(declarations).not.toContain('overflow: auto;');
    }
  });

  it('reserves fixed chrome from tokens rather than magic numbers', () => {
    expect(styles).toContain('--mobile-top-bar-height: 56px;');
    expect(styles).toContain('--bottom-nav-height: 68px;');
    expect(styles).toContain('--hud-inset: 10px;');
    expect(declarationsJoined('.app-shell')).toContain(
      'padding-top: calc(var(--mobile-top-bar-height) + env(safe-area-inset-top));',
    );
    // 168px stood in for header + route bar and broke when either changed.
    expect(styles).not.toContain('padding-top: 168px;');
  });

  it('never hides the affordance for controls that overflow the AR dock', () => {
    const dock = declarationsJoined('.immersive-actions');
    expect(dock).toContain('flex-wrap: wrap;');
    expect(dock).not.toContain('flex-wrap: nowrap;');
    expect(dock).not.toContain('overflow-x: auto;');
    expect(dock).not.toContain('scrollbar-width: none;');
    // Rotate took a non-shrinking 260px and pushed Add model off a phone.
    expect(declarationsJoined('.immersive-actions .rotate-control')).not.toContain('flex: 0 0');
  });

  it('gives the inspection and camera stages a fixed shape', () => {
    expect(declarationsJoined('.model-preview-viewport')).toContain('aspect-ratio: 4 / 3;');
    expect(declarationsJoined('.camera-media-layer')).toContain('aspect-ratio: 3 / 4;');
  });
});

describe('application design system', () => {
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

  it('carries the design system type, space, veil and motion scales', () => {
    for (const declaration of [
      '--text-display-lg: clamp(2.3rem, 4.6vw, 4.4rem);',
      '--text-heading-2: clamp(1.65rem, 2.8vw, 2.7rem);',
      '--text-body: 1rem;',
      '--text-label: 0.75rem;',
      '--space-4: 1rem;',
      '--space-9: 6rem;',
      '--section-space: clamp(4.5rem, 8vw, 8rem);',
      '--veil-card: color-mix(in srgb, var(--color-spatial-surface-raised) 93%, transparent);',
      '--color-line: rgba(29, 69, 74, 0.9);',
      '--color-line-strong: rgba(94, 234, 212, 0.34);',
      '--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);',
      '--ease-enter: cubic-bezier(0.16, 1, 0.3, 1);',
    ]) {
      expect(styles).toContain(declaration);
    }
  });

  it('resolves the semantic roles onto the dark-first spatial ground', () => {
    for (const semanticRole of [
      '--color-canvas: var(--color-spatial-void);',
      '--color-ink: var(--color-reality-mist);',
      '--color-ink-muted: var(--color-mist-slate);',
      '--color-border: var(--color-line);',
      '--color-error: var(--color-error-light);',
    ]) {
      expect(styles).toContain(semanticRole);
    }
    expect(declarationsJoined('body')).toContain('background: var(--color-spatial-void);');
    expect(declarationsJoined('body')).toContain('color: var(--color-ink);');
  });

  it('keeps every active primary action override on canonical mint and spatial ink', () => {
    const primaryRules = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => {
      const selector = match[1];
      const declarations = match[2];
      const selectorParts = selector.split(',').map((part) => part.trim());
      return (
        selectorParts.every((part) => (
          /\.primary(?![-\w])|#ARButton|\.ar-model-place-button/.test(part)
        ))
        && !selector.includes(':disabled')
        && !selector.includes('::before')
        && /(?:^|\n)\s*(?:color|background):/.test(declarations)
      );
    });

    expect(primaryRules.length).toBeGreaterThan(0);
    for (const [, selector, declarations] of primaryRules) {
      expect({
        selector: selector.trim(),
        text: declarations.includes('color: var(--color-spatial-ink);'),
        background: declarations.includes('background: var(--color-signal-mint);'),
      }).toEqual({
        selector: selector.trim(),
        text: true,
        background: true,
      });
    }
  });

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

  it('inverts the dark-ink brand artwork onto the spatial ground', () => {
    expect(declarationsJoined('.brand-aperture')).toContain('filter: invert(1) hue-rotate(180deg);');
    expect(declarationsJoined('.arvenilo-lockup')).toContain('filter: invert(1) hue-rotate(180deg);');
  });

  it('keeps every standard-workspace control family at least 44px tall', () => {
    // Two tokens carry every control height: the standard family matches the
    // input height, and icon trays and the HUD dock use the compact one.
    expect(styles).toContain('--control-height: 48px;');
    expect(styles).toContain('--control-height-compact: 44px;');

    const contracts = [
      ['.shell-account .account-menu-trigger', 'min-height: var(--control-height);'],
      ['.route-bar .route-back', 'min-height: var(--control-height);'],
      ['.landing .auth-actions button', 'min-height: var(--control-height);'],
      ['.model-manager .model-library-search input', 'min-height: var(--control-height);'],
      ['.model-manager .model-library-filter select', 'min-height: var(--control-height);'],
      ['.ar-model-picker .model-library-search input', 'min-height: var(--control-height);'],
      ['.ar-model-picker .model-library-filter select', 'min-height: var(--control-height);'],
      ['.upload-drop-zone-cue', 'min-height: var(--control-height);'],
      ['.creation-workspace .target-object-field input', 'min-height: var(--control-height);'],
      ['.model-edit-field input', 'min-height: var(--control-height);'],
      ['.model-manager-actions button', 'min-height: var(--control-height-compact);'],
      ['.hud-actions button', 'min-height: var(--control-height-compact);'],
    ] as const;

    for (const [selector, declaration] of contracts) {
      const declarations = declarationsJoined(selector);
      expect({ selector, declaration, declarations }).toMatchObject({
        selector,
        declaration,
        declarations: expect.stringContaining(declaration),
      });
    }
  });

  it('keeps the immersive exit action at least 44px tall', () => {
    expect(declarationsJoined('.immersive-exit')).toContain('min-height: var(--control-height-compact);');
  });

  it('uses canonical dark-ground palette tokens for visible standard-workspace descendants', () => {
    const contracts = [
      ['.account-menu-email', 'color: var(--color-ink-muted);'],
      ['.account-menu button.account-menu-logout', 'color: var(--color-error-light);'],
      ['.landing-copy > p:not(.landing-kicker)', 'color: var(--color-ink-muted);'],
      ['.mode-group h2', 'color: var(--color-interface-white);'],
      ['.mode-group p', 'color: var(--color-ink-muted);'],
      ['.mode-action button', 'border: 1px solid var(--color-line);'],
      ['.auth-identity', 'color: var(--color-ink-muted);'],
      ['.auth-brand-context h2', 'color: var(--color-interface-white);'],
      ['.auth-panel label', 'color: var(--color-ink-muted);'],
      ['.field-hint', 'color: var(--color-ink-muted);'],
      ['.admin-job-actions a', 'border: 1px solid var(--color-border);'],
      ['.model-edit-field', 'color: var(--color-ink-muted);'],
      ['.model-edit-status', 'color: var(--color-ink-muted);'],
      ['.model-preview-control', 'color: var(--color-ink-muted);'],
      ['.model-preview-title', 'color: var(--color-interface-white);'],
      ['.model-preview-status', 'color: var(--color-ink-muted);'],
      ['.creation-stage .camera-label', 'color: var(--color-signal-mint);'],
      ['.upload-drop-zone > small', 'color: var(--color-ink-muted);'],
      ['.target-object-field', 'color: var(--color-ink-muted);'],
      ['.upload-drop-zone', 'border: 1px dashed var(--color-line-strong);'],
      ['.camera-preview', 'background: var(--color-spatial-void);'],
      ['.creation-workspace.fullscreen', 'background: var(--color-spatial-void);'],
      ['.speech-transcript-card', 'color: var(--color-ink);'],
      ['.speech-stage-list li.is-active', 'background: var(--wash-violet);'],
      ['.model-manager-empty', 'color: var(--color-ink-muted);'],
      ['.ar-model-empty', 'color: var(--color-ink-muted);'],
    ] as const;

    for (const [selector, declaration] of contracts) {
      const declarations = declarationsJoined(selector);
      expect({ selector, declaration, declarations }).toMatchObject({
        selector,
        declaration,
        declarations: expect.stringContaining(declaration),
      });
    }
  });

  it('keeps grouped headings, names and metadata legible on the dark ground', () => {
    const contracts = [
      ['.admin-account-email', 'color: var(--color-interface-white);'],
      ['.admin-job-title', 'color: var(--color-interface-white);'],
      ['.admin-account-meta', 'color: var(--color-ink-muted);'],
      ['.admin-job-meta', 'color: var(--color-ink-muted);'],
      ['.model-manager-header h2', 'color: var(--color-interface-white);'],
      ['.ar-picker-heading h2', 'color: var(--color-interface-white);'],
      ['.model-library-search', 'color: var(--color-ink-muted);'],
      ['.model-library-filter', 'color: var(--color-ink-muted);'],
      ['.ar-model-card-label', 'color: var(--color-interface-white);'],
      ['.model-manager-name', 'color: var(--color-interface-white);'],
      ['.ar-model-card-meta', 'color: var(--color-ink-muted);'],
      ['.model-manager-owner', 'color: var(--color-ink-muted);'],
      ['.camera-status', 'color: var(--color-ink-muted);'],
      ['.generated-model-status', 'color: var(--color-ink-muted);'],
      ['.auth-message', 'color: var(--color-ink-muted);'],
      ['.admin-dashboard-message', 'color: var(--color-ink-muted);'],
      ['.auth-panel-header h2', 'color: var(--color-interface-white);'],
      ['.admin-dashboard-header h2', 'color: var(--color-interface-white);'],
      ['input', 'border: 1px solid var(--color-border);'],
      ['textarea', 'line-height: 1.5;'],
    ] as const;

    for (const [selector, declaration] of contracts) {
      const declarations = declarationsJoined(selector);
      expect({ selector, declaration, declarations }).toMatchObject({
        selector,
        declaration,
        declarations: expect.stringContaining(declaration),
      });
    }
  });

  it('stacks and constrains the Arvenilo endorsement at the 320px layout', () => {
    // Mobile-first: the stacked, width-capped lockup is the base rule, and the
    // side-by-side grid is the addition above 768px.
    expect(declarationsFor('.brand-endorsement-panel').at(0) ?? '').toContain(
      'grid-template-columns: minmax(0, 1fr);',
    );
    const lockup = declarationsFor('.arvenilo-lockup').at(0) ?? '';
    expect(lockup).toContain('width: min(280px, 100%);');
    expect(lockup).toContain('justify-self: start;');
  });

  it('makes semantic hidden state and keyboard focus reliable', () => {
    expect(styles).toContain('[hidden],\n.hidden {\n  display: none !important;\n}');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('outline: 3px solid var(--color-signal-mint);');
  });

  it('keeps the full-screen WebGL canvas from intercepting page controls', () => {
    expect(declarationsJoined('canvas')).toContain('pointer-events: none;');
  });

  it('keeps the persistent spatial field behind the shell and out of the way', () => {
    const field = declarationsJoined('.spatial-field');
    expect(field).toContain('position: fixed;');
    expect(field).toContain('z-index: 0;');
    expect(field).toContain('pointer-events: none;');
    expect(declarationsJoined('.app-shell')).toContain('z-index: 1;');
    // Scoped canvases opt out of the fixed full-page layer.
    expect(declarationsJoined('.spatial-field canvas')).toContain('position: absolute;');
    expect(declarationsJoined('.webxr-aperture-stage canvas')).toContain('position: absolute;');
    // A static composition stands in wherever WebGL is unavailable.
    expect(styles).toContain('.spatial-field[data-mode="static"] {');
  });

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

  it('defines separate mobile, intermediate, and desktop behavior', () => {
    expect(styles).toContain('@media (max-width: 767px)');
    expect(styles).toContain('@media (min-width: 768px) and (max-width: 1023px)');
    expect(styles).toContain('@media (min-width: 1024px)');
  });

  it('honors reduced motion and mobile safe areas', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('env(safe-area-inset-bottom)');
  });

  it('layers the reconstruction canvas exactly over the cover-cropped camera preview', () => {
    const cameraLayer = declarationsJoined('.camera-media-layer');
    expect(cameraLayer).toContain('position: relative;');
    expect(cameraLayer).toContain('overflow: hidden;');
    expect(cameraLayer).toContain('border-radius: var(--radius-control);');
    // A camera frame keeps a sensible shape instead of stretching to the panel.
    expect(cameraLayer).toContain('aspect-ratio: 3 / 4;');
    expect(styles).toContain(
      '.camera-media-layer > .camera-preview,\n' +
      '.object-reconstruction-overlay {\n' +
      '  position: absolute;\n' +
      '  inset: 0;\n' +
      '  width: 100%;\n' +
      '  height: 100%;',
    );
    expect(styles).toContain(
      '.object-reconstruction-overlay {\n' +
      '  z-index: 2;\n' +
      '  pointer-events: none;',
    );
    expect(styles).toContain(
      '.creation-stage > .upload-drop-zone {\n' +
      '  grid-row: 2;\n' +
      '  grid-column: 1;',
    );
  });

  it('uses a restrained segmentation pulse and removes it for reduced motion', () => {
    expect(styles).toContain('.camera-media-layer.is-object-segmentation-pending {');
    expect(styles).toContain('animation: object-segmentation-pending 1.8s ease-in-out infinite;');
    expect(styles).toContain('@keyframes object-segmentation-pending');
    expect(styles).toContain(
      '@media (prefers-reduced-motion: reduce) {\n' +
      '  .camera-media-layer.is-object-segmentation-pending {\n' +
      '    animation: none;',
    );
    expect(styles).not.toContain('.object-segmentation-spinner');
  });

  it('provides a dedicated responsive canvas stage for reconstruction during generation', () => {
    expect(styles).toContain('.full-flow-reconstruction-stage {');
    expect(styles).toContain('width: min(72vw, 560px);');
    expect(styles).toContain('height: min(58dvh, 680px);');
    expect(styles).toContain('.full-flow-reconstruction-preview {');
    expect(styles).toContain('object-fit: cover;');
    expect(styles).toContain('.full-flow-reconstruction-stage .object-reconstruction-overlay {');
  });

  it('makes only the Photo to AR camera workspace edge to edge with safe-area overlays', () => {
    expect(styles).toContain('.creation-workspace.fullscreen.photo-to-ar-immersive {');
    expect(styles).toContain('padding: 0;');
    expect(styles).toContain('.photo-to-ar-immersive .camera-media-layer {');
    expect(styles).toContain('.photo-to-ar-immersive .camera-media-layer > .camera-preview {');
    expect(styles).toContain('object-fit: cover;');
    expect(styles).toContain('.photo-to-ar-immersive .creation-guidance {');
    expect(styles).toContain('padding-bottom: max(16px, env(safe-area-inset-bottom));');
    expect(styles).toContain('backdrop-filter: blur(18px);');
    expect(styles).toContain('.photo-to-ar-immersive .creation-step-list {');
    const progressDeclarations = declarationsJoined('.photo-to-ar-immersive .creation-step-list');
    expect(progressDeclarations).toContain('display: none;');
    expect(styles).not.toContain('.app-shell[data-route="upload"] .photo-to-ar-immersive');
  });

  it('defines explicit selection and mobile layouts for model collections', () => {
    expect(styles).toContain('.ar-model-card[aria-pressed="true"],\n.model-manager-row.is-selected,');
    expect(styles).toContain('.selection-label {');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(declarationsJoined('.model-manager-actions')).toContain('display: flex;');
    expect(styles).toContain('.model-manager-overflow-menu {');
  });

  it('uses one modal layer for preview, edit, and confirmation dialogs', () => {
    expect(styles).toContain(
      '.model-preview,\n.model-edit-dialog,\n.confirmation-dialog {',
    );
    expect(styles).toContain(
      '.model-preview-panel,\n.model-edit-panel,\n.confirmation-panel {',
    );
    expect(styles).toContain('.confirmation-actions {');
  });

  it('elevates the modal host above the shared header while a dialog is open', () => {
    const selector = '.model-manager:has(> .model-preview:not(.hidden), > .model-edit-dialog, > .confirmation-dialog)';
    expect(styles).toContain(`${selector} {\n  z-index: 100;`);
  });

  it('separates immersive inspector, model rail, and actions across viewports', () => {
    expect(styles).toContain('.immersive-inspector {');
    expect(styles).toContain('.immersive-actions {');
    expect(styles).toContain('.immersive-actions .rotate-control,');
    expect(declarationsJoined('.immersive-actions')).toContain('flex-wrap: wrap;');
    expect(declarationsJoined('.model-rail')).toContain(
      'bottom: calc(var(--hud-dock-height, 118px) + var(--space-3) + env(safe-area-inset-bottom));',
    );
  });

  it('shows single-object AR status only as compact transparent error feedback', () => {
    const hiddenSelector = '.app-shell[data-route="ar"] .status-panel.immersive-inspector:not(.is-error)';
    const errorSelector = '.app-shell[data-route="ar"] .status-panel.immersive-inspector.is-error';

    expect(declarationsJoined(hiddenSelector)).toContain('display: none;');
    const errorDeclarations = declarationsJoined(errorSelector);
    expect(errorDeclarations).toContain('top: max(12px, env(safe-area-inset-top));');
    expect(errorDeclarations).toContain(
      'background: color-mix(in srgb, var(--color-spatial-void) 72%, transparent);',
    );
    expect(styles).toContain(`${errorSelector} > .status-label,`);
    expect(styles).toContain(`${errorSelector} > .status-source {`);
  });

  it('uses a solid Anchor Gold selected treatment for immersive model rail items', () => {
    const selector = '.app-shell[data-shell="immersive"] .model-rail-item.is-selected';
    const declarations = declarationsFor(selector).at(-1) ?? '';

    expect(declarations).toContain('border-color: var(--color-anchor-gold);');
    expect(declarations).toContain('background: var(--color-spatial-surface);');
    expect(declarations).toMatch(/box-shadow:[\s\S]*var\(--color-anchor-gold\)/);
    expect(declarations).not.toContain('gradient(');
  });

  it('keeps generated and uploaded visibility badges on the canonical palette', () => {
    const contracts = [
      [
        '.model-manager-badge.visibility-public',
        'border-color: var(--color-line-strong);',
        'color: var(--color-signal-mint);',
        'background: var(--wash-mint);',
      ],
      [
        '.model-manager-row.is-generated .model-manager-badge',
        'border-color: var(--color-line-strong);',
        'color: var(--color-signal-mint);',
        'background: var(--wash-mint);',
      ],
      [
        '.model-manager-row.is-uploaded .model-manager-badge',
        'border-color: var(--color-line-strong);',
        'color: var(--color-signal-mint);',
        'background: var(--wash-mint);',
      ],
      [
        '.model-manager-badge.visibility-private',
        'border-color: var(--color-line);',
        'color: var(--color-ink-muted);',
        'background: var(--veil-void);',
      ],
    ] as const;

    for (const [selector, ...declarations] of contracts) {
      const effectiveDeclarations = declarationsFor(selector).at(-1) ?? '';
      for (const declaration of declarations) {
        expect({ selector, effectiveDeclarations }).toMatchObject({
          selector,
          effectiveDeclarations: expect.stringContaining(declaration),
        });
      }
    }
  });

  it('keeps the mobile WebXR aperture stage at least 300px tall', () => {
    const declarations = declarationsFor('.webxr-aperture-stage').at(0) ?? '';

    expect(declarations).toContain('min-height: 300px;');
  });

  it('keeps mobile account, upload, and admin controls compact and aligned', () => {
    expect(styles).toContain('.mobile-account-link.is-concealed {');
    expect(styles).toContain(
      '  .app-shell[data-route="upload"] .creation-workspace.fullscreen,\n' +
      '  .app-shell[data-route="upload-model"] .creation-workspace.fullscreen {',
    );
    expect(styles).toContain('grid-template-rows: auto auto;');
    expect(declarationsJoined('.admin-dashboard-actions'))
      .toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(declarationsFor('.admin-account-row').at(0) ?? '')
      .toContain('grid-template-columns: minmax(0, 1fr);');
    expect(declarationsFor('.admin-account-actions').at(0) ?? '')
      .toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('keeps the responsive signed-in account menu visible, touchable, and above page content', () => {
    expect(styles).toContain('.account-menu-trigger {');
    expect(styles).toContain('.account-status-dot {');
    expect(styles).toContain('.account-menu {');
    expect(styles).toContain('z-index: 75;');
    expect(styles).toContain('min-height: 44px;');
    expect(styles).toContain('.session-notice {');
    expect(styles).toContain(
      'grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);',
    );
    expect(styles).toContain(
      '.mobile-top-bar .route-back {\n' +
      '  grid-column: 1;',
    );
    expect(styles).toContain(
      '.mobile-route-title {\n' +
      '  grid-column: 2;',
    );
    expect(styles).toContain(
      '.mobile-account-link {\n' +
      '  grid-column: 3;',
    );
    expect(styles).toContain(
      '  .account-menu {\n' +
      '    top: calc(var(--mobile-top-bar-height) + env(safe-area-inset-top) + var(--space-2));',
    );
    expect(styles).toContain(
      '  .mobile-account-link {\n' +
      '    max-width: min(34vw, 150px);',
    );
  });
});
