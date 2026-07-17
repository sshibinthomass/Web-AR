import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/styles.css'),
  'utf8',
).replace(/\r\n/g, '\n');

const declarationsFor = (selector: string): string[] => (
  [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1].split(',').some((part) => part.trim() === selector))
    .map((match) => match[2])
);

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

  it('keeps every active primary action override on canonical mint and spatial ink', () => {
    const primaryRules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => {
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

  it('keeps every standard-workspace control family at least 44px tall', () => {
    const contracts = [
      ['.shell-account .account-menu-trigger', 'min-height: 44px;'],
      ['.route-bar .route-back', 'min-height: 44px;'],
      ['.landing .auth-actions button', 'min-height: 44px;'],
      ['.model-manager .model-library-search input', 'min-height: var(--control-height);'],
      ['.model-manager .model-library-filter select', 'min-height: var(--control-height);'],
      ['.ar-model-picker .model-library-search input', 'min-height: var(--control-height);'],
      ['.ar-model-picker .model-library-filter select', 'min-height: var(--control-height);'],
      ['.creation-workspace .upload-drop-zone input', 'min-height: var(--control-height);'],
      ['.creation-workspace .target-object-field input', 'min-height: var(--control-height);'],
      ['.model-edit-field input', 'min-height: var(--control-height);'],
    ] as const;

    for (const [selector, declaration] of contracts) {
      const declarations = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((match) => match[1].split(',').some((part) => part.trim() === selector))
        .map((match) => match[2])
        .join('\n');
      expect({ selector, declaration, declarations }).toMatchObject({
        selector,
        declaration,
        declarations: expect.stringContaining(declaration),
      });
    }
  });

  it('keeps the immersive exit action at least 44px tall', () => {
    const declarations = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((match) => match[1].split(',').some((part) => part.trim() === '.immersive-exit'))
      .map((match) => match[2])
      .join('\n');

    expect(declarations).toContain('min-height: 44px;');
  });

  it('uses canonical palette tokens for visible standard-workspace descendants', () => {
    const contracts = [
      ['.account-menu-email', 'color: var(--color-context-slate);'],
      ['.account-menu button.account-menu-logout', 'color: var(--color-error-dark);'],
      ['.landing-copy > p:not(.landing-kicker)', 'color: var(--color-context-slate);'],
      ['.mode-group h2', 'color: var(--color-spatial-ink);'],
      ['.mode-group p', 'color: var(--color-context-slate);'],
      ['.mode-action button', 'border-color: var(--color-border-light);'],
      ['.home-route-groups .mode-action button.primary', 'background: var(--color-signal-mint);'],
      ['.auth-identity', 'color: var(--color-context-slate);'],
      ['.auth-panel-header h2', 'color: var(--color-spatial-ink);'],
      ['.auth-message', 'color: var(--color-context-slate);'],
      ['.auth-panel input', 'border-color: var(--color-border-light);'],
      ['.speech-text-field', 'color: var(--color-spatial-ink);'],
      ['.field-hint', 'color: var(--color-context-slate);'],
      ['.speech-actions button', 'border-color: var(--color-border-light);'],
      ['.admin-dashboard-header h2', 'color: var(--color-spatial-ink);'],
      ['.admin-account-email', 'color: var(--color-spatial-ink);'],
      ['.admin-account-meta', 'color: var(--color-context-slate);'],
      ['.admin-job-actions a', 'border-color: var(--color-border-light);'],
      ['.model-manager-header h2', 'color: var(--color-spatial-ink);'],
      ['.ar-picker-heading h2', 'color: var(--color-spatial-ink);'],
      ['.model-library-search', 'color: var(--color-context-slate);'],
      ['.model-library-search input', 'border-color: var(--color-border-light);'],
      ['.model-manager-name', 'color: var(--color-spatial-ink);'],
      ['.ar-model-card-label', 'color: var(--color-spatial-ink);'],
      ['.ar-model-card-meta', 'color: var(--color-context-slate);'],
      ['.model-manager-owner', 'color: var(--color-context-slate);'],
      ['.model-edit-field', 'color: var(--color-context-slate);'],
      ['.model-edit-field input', 'border-color: var(--color-border-light);'],
      ['.model-edit-status', 'color: var(--color-context-slate);'],
      ['.model-preview-control', 'color: var(--color-context-slate);'],
      ['.model-preview-control select', 'border-color: var(--color-border-light);'],
      ['.model-preview-title', 'color: var(--color-spatial-ink);'],
      ['.model-preview-status', 'color: var(--color-context-slate);'],
      ['.creation-stage .camera-label', 'color: var(--color-context-slate);'],
      ['.upload-drop-zone > small', 'color: var(--color-context-slate);'],
      ['.creation-guidance .camera-status', 'color: var(--color-context-slate);'],
      ['.creation-workspace.fullscreen .upload-drop-zone', 'border-color: var(--color-border-light);'],
      ['.creation-workspace.fullscreen .upload-drop-zone input', 'border-color: var(--color-border-light);'],
      ['.creation-workspace.fullscreen .target-object-field', 'color: var(--color-context-slate);'],
      ['.creation-workspace.fullscreen .target-object-field input', 'border-color: var(--color-border-light);'],
      ['.creation-workspace.fullscreen .creation-stage .camera-preview', 'border-color: var(--color-border-light);'],
      ['.creation-workspace.fullscreen .creation-stage video.camera-preview', 'background: var(--color-spatial-void);'],
      ['.creation-workspace.fullscreen .creation-guidance .camera-status', 'color: var(--color-context-slate);'],
      ['.creation-workspace.fullscreen .creation-guidance .camera-actions button', 'border-color: var(--color-border-light);'],
      ['.creation-workspace.fullscreen .creation-guidance .camera-actions button.primary', 'background: var(--color-signal-mint);'],
    ] as const;

    for (const [selector, declaration] of contracts) {
      const declarations = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((match) => match[1].split(',').some((part) => part.trim() === selector))
        .map((match) => match[2])
        .join('\n');
      expect({ selector, declaration, declarations }).toMatchObject({
        selector,
        declaration,
        declarations: expect.stringContaining(declaration),
      });
    }
  });

  it('stacks and constrains the Arvenilo endorsement at the 320px layout', () => {
    const workspaceStart = styles.indexOf('/* Core responsive workspaces */');
    const creationStart = styles.indexOf('/* Camera, upload, and photo-to-AR workspaces */');
    const workspaceStyles = styles.slice(workspaceStart, creationStart);
    const mobileStyles = workspaceStyles.slice(
      workspaceStyles.lastIndexOf('@media (max-width: 767px)'),
    );

    expect(mobileStyles).toContain(
      '.brand-endorsement-panel {\n    grid-template-columns: minmax(0, 1fr);',
    );
    expect(mobileStyles).toContain(
      '.arvenilo-lockup {\n    width: min(280px, 100%);\n    max-width: 100%;\n    justify-self: start;',
    );
  });

  it('makes semantic hidden state and keyboard focus reliable', () => {
    expect(styles).toContain('[hidden] {\n  display: none !important;\n}');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('outline: 3px solid var(--color-signal-mint);');
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
    expect(styles).toContain(
      '.camera-media-layer {\n' +
      '  position: relative;\n' +
      '  grid-row: 2;\n' +
      '  grid-column: 1;\n' +
      '  min-width: 0;\n' +
      '  min-height: 0;\n' +
      '  pointer-events: none;\n' +
      '  overflow: hidden;\n' +
      '  border-radius: var(--radius-control);',
    );
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

  it('defines explicit selection and mobile layouts for model collections', () => {
    expect(styles).toContain(
      '.ar-model-card[aria-pressed="true"],\n.model-manager-row.is-selected {',
    );
    expect(styles).toContain('.selection-label {');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(44px, 1fr));');
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
    expect(styles).toContain('bottom: calc(108px + env(safe-area-inset-bottom));');
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
        '.model-manager-row.is-generated .model-manager-badge.visibility-public',
        'border-color: color-mix(in srgb, var(--color-signal-mint) 70%, var(--color-border-light));',
        'color: var(--color-spatial-ink);',
        'background: var(--color-mint-wash);',
      ],
      [
        '.model-manager-row.is-uploaded .model-manager-badge.visibility-public',
        'border-color: color-mix(in srgb, var(--color-signal-mint) 70%, var(--color-border-light));',
        'color: var(--color-spatial-ink);',
        'background: var(--color-mint-wash);',
      ],
      [
        '.model-manager-row.is-generated .model-manager-badge.visibility-private',
        'border-color: var(--color-border-light);',
        'color: var(--color-context-slate);',
        'background: var(--color-reality-mist);',
      ],
      [
        '.model-manager-row.is-uploaded .model-manager-badge.visibility-private',
        'border-color: var(--color-border-light);',
        'color: var(--color-context-slate);',
        'background: var(--color-reality-mist);',
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
    const declarations = declarationsFor('.landing-preview.webxr-aperture-stage').at(-1) ?? '';

    expect(declarations).toContain('min-height: 300px;');
  });

  it('keeps mobile account, upload, and admin controls compact and aligned', () => {
    expect(styles).toContain('.mobile-account-link.is-concealed {');
    expect(styles).toContain(
      '  .app-shell[data-route="upload"] .creation-workspace.fullscreen,\n' +
      '  .app-shell[data-route="upload-model"] .creation-workspace.fullscreen {',
    );
    expect(styles).toContain('grid-template-rows: auto auto;');
    expect(styles).toContain(
      '.admin-dashboard-section-header .admin-dashboard-actions {',
    );
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(styles).toContain(
      '  .admin-account-row,\n' +
      '  .admin-job-row {\n' +
      '    grid-template-columns: 1fr;',
    );
  });

  it('keeps the responsive signed-in account menu visible, touchable, and above page content', () => {
    expect(styles).toContain('.account-menu-trigger {');
    expect(styles).toContain('.account-status-dot {');
    expect(styles).toContain('.account-menu {');
    expect(styles).toContain('z-index: 75;');
    expect(styles).toContain('.account-menu button {');
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
      '    top: calc(56px + env(safe-area-inset-top) + 8px);',
    );
    expect(styles).toContain(
      '  .mobile-account-link {\n' +
      '    max-width: min(34vw, 150px);',
    );
  });
});
