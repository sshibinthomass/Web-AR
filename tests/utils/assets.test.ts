import { describe, expect, it } from 'vitest';
import { resolveModelUrl, resolvePublicAssetUrl } from '../../src/utils/assets';

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

describe('resolveModelUrl', () => {
  it('uses the configured Cloudflare model URL when one is provided', () => {
    expect(
      resolveModelUrl({
        configuredUrl: 'https://assets.example.workers.dev/models/trellis-2-4b-fast-output.glb',
        fallbackAssetPath: 'models/trellis-2-4b-fast-output.glb',
        baseUrl: '/Web-AR/',
      }),
    ).toBe('https://assets.example.workers.dev/models/trellis-2-4b-fast-output.glb');
  });

  it('falls back to the public model asset when no external URL is configured', () => {
    expect(
      resolveModelUrl({
        configuredUrl: '',
        fallbackAssetPath: 'models/trellis-2-4b-fast-output.glb',
        baseUrl: '/Web-AR/',
      }),
    ).toBe('/Web-AR/models/trellis-2-4b-fast-output.glb');
  });
});
