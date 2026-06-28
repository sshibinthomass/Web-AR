import { describe, expect, it } from 'vitest';
import { MODEL_OPTIONS } from '../../src/app/models';

describe('MODEL_OPTIONS', () => {
  it('offers all three Cloudflare-hosted GLB models', () => {
    expect(MODEL_OPTIONS).toHaveLength(3);
    expect(MODEL_OPTIONS.map((model) => model.id)).toEqual([
      'trellis-fast-output',
      'img4-output',
      'img-fast-output',
    ]);
  });

  it('keeps every selectable model on Cloudflare Pages', () => {
    expect(MODEL_OPTIONS.every((model) => model.url.startsWith('https://web-ar-model-assets.pages.dev/'))).toBe(true);
    expect(MODEL_OPTIONS.every((model) => model.url.endsWith('.glb'))).toBe(true);
  });
});
