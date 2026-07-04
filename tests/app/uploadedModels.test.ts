import { describe, expect, it } from 'vitest';
import { createUploadedModelOption } from '../../src/app/uploadedModels';

describe('createUploadedModelOption', () => {
  it('creates a selectable uploaded model option from a GLB file', () => {
    const file = new File(['glb bytes'], 'Living Room Chair.glb', { type: 'model/gltf-binary' });

    expect(createUploadedModelOption(file, 'blob:chair', 123)).toEqual({
      id: 'uploaded-123-living-room-chair',
      label: 'Living Room Chair',
      url: 'blob:chair',
    });
  });

  it('rejects non-GLB files', () => {
    const file = new File(['not glb'], 'chair.png', { type: 'image/png' });

    expect(() => createUploadedModelOption(file, 'blob:chair', 123)).toThrow('Choose a .glb model file.');
  });
});
