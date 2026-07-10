import { describe, expect, it } from 'vitest';
import { MODEL_OPTIONS } from '../../src/app/models';

describe('MODEL_OPTIONS', () => {
  it('does not ship built-in model assets', () => {
    expect(MODEL_OPTIONS).toEqual([]);
  });
});
