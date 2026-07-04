import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATE_MODEL_API_URL, getGenerateModelApiUrl } from '../../src/app/config';

describe('getGenerateModelApiUrl', () => {
  it('uses the public Worker model API when no Vite env URL is configured', () => {
    expect(getGenerateModelApiUrl()).toBe(DEFAULT_GENERATE_MODEL_API_URL);
    expect(getGenerateModelApiUrl('')).toBe(DEFAULT_GENERATE_MODEL_API_URL);
  });

  it('keeps an explicit Worker API override', () => {
    expect(getGenerateModelApiUrl(' http://127.0.0.1:8787/generate-3d ')).toBe(
      'http://127.0.0.1:8787/generate-3d',
    );
  });
});
