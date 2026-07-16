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
});
