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

  it('keeps the AR model search controls fixed at the top while model cards scroll', () => {
    const pickerRule = cssRule('.ar-model-picker');
    const controlsRule = cssRule('.ar-model-picker .model-library-controls');

    expect(pickerRule).toContain(
      'padding: calc(max(18px, env(safe-area-inset-top)) + 150px) 20px calc(max(18px, env(safe-area-inset-bottom)) + 104px);',
    );
    expect(controlsRule).toContain('position: fixed;');
    expect(controlsRule).toContain('top: calc(max(14px, env(safe-area-inset-top)) + 54px);');
    expect(controlsRule).toContain('left: 50%;');
    expect(controlsRule).toContain('width: min(1040px, calc(100% - 40px));');
    expect(controlsRule).not.toContain('position: sticky;');
  });
});
