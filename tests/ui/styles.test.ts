import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/styles.css'),
  'utf8',
).replace(/\r\n/g, '\n');

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

  it('makes semantic hidden state and keyboard focus reliable', () => {
    expect(styles).toContain('[hidden] {\n  display: none !important;\n}');
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('outline: 3px solid var(--color-signal-mint);');
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

  it('defines explicit selection and mobile layouts for model collections', () => {
    expect(styles).toContain(
      '.ar-model-card[aria-pressed="true"],\n.model-manager-row.is-selected {',
    );
    expect(styles).toContain('.selection-label {');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(styles).toContain('grid-template-columns: repeat(3, 44px);');
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

  it('separates immersive inspector, model rail, and actions across viewports', () => {
    expect(styles).toContain('.immersive-inspector {');
    expect(styles).toContain('.immersive-actions {');
    expect(styles).toContain('.immersive-actions .rotate-control,');
    expect(styles).toContain('bottom: calc(108px + env(safe-area-inset-bottom));');
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
