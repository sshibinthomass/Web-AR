import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/styles.css');
const styles = readFileSync(stylesPath, 'utf8').replace(/\r\n/g, '\n');

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
    const controlRule = cssRule('.rotate-control,\n.animation-control');

    expect(hudActionsRule).toContain('gap: 6px;');
    expect(chipRule).toContain('min-height: 38px;');
    expect(chipRule).toContain('padding: 0 10px;');
    expect(controlRule).toContain('flex: 1 0 100%;');
    expect(controlRule).toContain('grid-template-columns: auto minmax(0, 1fr);');
  });

  it('raises the compact model rail when Animation is visible', () => {
    const animatedRailRule = cssRule('.model-rail.has-animation-control');
    const itemRule = cssRule('.model-rail-item');
    const thumbRule = cssRule('.model-rail-thumb');
    const labelRule = cssRule('.model-rail-label');

    expect(animatedRailRule).toContain(
      'bottom: calc(max(18px, env(safe-area-inset-bottom)) + 160px);',
    );
    expect(itemRule).toContain('flex: 0 0 76px;');
    expect(itemRule).toContain('grid-template-rows: 48px 2.5em;');
    expect(itemRule).toContain('min-height: 88px;');
    expect(thumbRule).toContain('height: 48px;');
    expect(labelRule).toContain('font-size: 10px;');
  });

  it('uses one compact light surface for placed-object controls', () => {
    const chipRule = cssRule('.hud-actions button.hud-action-chip');
    const controlRule = cssRule('.rotate-control,\n.animation-control');
    const selectRule = cssRule('.animation-control select');

    expect(chipRule).toContain('min-height: 38px;');
    expect(chipRule).toContain('padding: 0 10px;');
    expect(chipRule).toContain('font-size: 12px;');
    expect(controlRule).toContain('min-height: 38px;');
    expect(controlRule).toContain('color: #102326;');
    expect(controlRule).toContain('background: rgba(255, 255, 255, 0.86);');
    expect(selectRule).toContain('color: #102326;');
    expect(selectRule).toContain('background: rgba(255, 255, 255, 0.88);');
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
