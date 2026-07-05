import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/styles.css');
const styles = readFileSync(stylesPath, 'utf8');

function cssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return styles.match(new RegExp(`${escapedSelector} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
}

describe('AR overlay styles', () => {
  it('keeps the model rail close above the bottom AR controls', () => {
    expect(styles).toContain('bottom: calc(max(18px, env(safe-area-inset-bottom)) + 118px);');
  });

  it('keeps AR action controls compact with a scrollable rotation slider', () => {
    const hudActionsRule = cssRule('.hud-actions');
    const chipRule = cssRule('.hud-actions button.hud-action-chip');
    const rotateRule = cssRule('.rotate-control');

    expect(hudActionsRule).toContain('gap: 6px;');
    expect(chipRule).toContain('min-height: 44px;');
    expect(chipRule).toContain('padding: 0 12px;');
    expect(rotateRule).toContain('flex: 1 0 100%;');
    expect(rotateRule).toContain('grid-template-columns: auto minmax(0, 1fr);');
  });

  it('keeps the AR model search controls in the page flow above model cards', () => {
    const pickerRule = cssRule('.ar-model-picker');
    const controlsRule = cssRule('.ar-model-picker .model-library-controls');

    expect(pickerRule).toContain(
      'padding: calc(max(18px, env(safe-area-inset-top)) + 72px) 20px calc(max(18px, env(safe-area-inset-bottom)) + 104px);',
    );
    expect(controlsRule).not.toContain('position: fixed;');
    expect(controlsRule).not.toContain('position: sticky;');
    expect(controlsRule).not.toContain('transform: translateX(-50%);');
    expect(controlsRule).toContain('width: 100%;');
    expect(controlsRule).toContain('margin: 0 0 14px;');
  });
});
