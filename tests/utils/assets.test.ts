import { describe, expect, it } from 'vitest';
import { resolvePublicAssetUrl } from '../../src/utils/assets';

describe('resolvePublicAssetUrl', () => {
  it('prefixes public assets with the Vite base path for GitHub Pages', () => {
    expect(resolvePublicAssetUrl('models/trellis-2-4b-fast-output.glb', '/Web-AR/')).toBe(
      '/Web-AR/models/trellis-2-4b-fast-output.glb',
    );
  });

  it('keeps local public asset paths rooted at slash', () => {
    expect(resolvePublicAssetUrl('models/trellis-2-4b-fast-output.glb', '/')).toBe(
      '/models/trellis-2-4b-fast-output.glb',
    );
  });
});
