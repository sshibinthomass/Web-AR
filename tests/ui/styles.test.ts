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
