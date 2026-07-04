import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/styles.css');
const styles = readFileSync(stylesPath, 'utf8');

describe('AR overlay styles', () => {
  it('keeps the model rail close above the bottom AR controls', () => {
    expect(styles).toContain('bottom: calc(max(18px, env(safe-area-inset-bottom)) + 72px);');
    expect(styles).not.toContain('+ 112px');
    expect(styles).not.toContain('+ 116px');
  });
});
