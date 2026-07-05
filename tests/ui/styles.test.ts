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
    expect(styles).toContain('bottom: calc(max(18px, env(safe-area-inset-bottom)) + 72px);');
    expect(styles).not.toContain('+ 112px');
    expect(styles).not.toContain('+ 116px');
  });

  it('keeps AR action buttons compact enough for a phone-width icon tray', () => {
    const hudActionsRule = cssRule('.hud-actions');
    const iconRule = cssRule('.hud-actions button.hud-action-icon');

    expect(hudActionsRule).toContain('gap: 6px;');
    expect(iconRule).toContain('flex: 0 0 44px;');
    expect(iconRule).toContain('width: 44px;');
    expect(iconRule).toContain('min-height: 44px;');
    expect(iconRule).toContain('padding: 0;');
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
