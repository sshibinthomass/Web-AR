import { describe, expect, it, vi } from 'vitest';
import { prepareSegmentationImage } from '../../src/capture/segmentationImage';

describe('prepareSegmentationImage', () => {
  it('resizes a request image to its 1024-pixel long edge and closes the decoded bitmap', async () => {
    const drawImage = vi.fn();
    const close = vi.fn();
    const source = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const toBlob = vi.fn((callback: BlobCallback, mimeType?: string, quality?: number) => {
      callback(new Blob([new Uint8Array(256)], { type: mimeType }));
      expect(quality).toBe(0.82);
    });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob,
    } as unknown as HTMLCanvasElement;

    const prepared = await prepareSegmentationImage(source, {
      createImageBitmapImpl: vi.fn().mockResolvedValue({ width: 1600, height: 900, close }),
      createCanvas: vi.fn(() => canvas),
    });

    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(576);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 576);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.82);
    expect(close).toHaveBeenCalledTimes(1);
    expect(source.type).toBe('image/png');
    expect(await source.arrayBuffer()).toEqual(await new Blob([new Uint8Array([1, 2, 3])]).arrayBuffer());
    expect(prepared).toEqual({
      imageBase64: expect.any(String),
      imageMimeType: 'image/webp',
      width: 1024,
      height: 576,
      bytes: 256,
    });
  });

  it('falls back to JPEG when WebP canvas encoding is unavailable', async () => {
    const toBlob = vi
      .fn()
      .mockImplementationOnce((callback: BlobCallback) => callback(null))
      .mockImplementationOnce((callback: BlobCallback, mimeType?: string) =>
        callback(new Blob([new Uint8Array(12)], { type: mimeType })),
      );
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob,
    } as unknown as HTMLCanvasElement;

    const prepared = await prepareSegmentationImage(new Blob(['image'], { type: 'image/png' }), {
      createImageBitmapImpl: vi.fn().mockResolvedValue({ width: 100, height: 80, close: vi.fn() }),
      createCanvas: vi.fn(() => canvas),
    });

    expect(toBlob).toHaveBeenNthCalledWith(1, expect.any(Function), 'image/webp', 0.82);
    expect(toBlob).toHaveBeenNthCalledWith(2, expect.any(Function), 'image/jpeg', 0.82);
    expect(prepared.imageMimeType).toBe('image/jpeg');
  });

  it('closes the decoded bitmap when canvas creation throws', async () => {
    const close = vi.fn();

    await expect(
      prepareSegmentationImage(new Blob(['image'], { type: 'image/png' }), {
        createImageBitmapImpl: vi.fn().mockResolvedValue({ width: 100, height: 80, close }),
        createCanvas: vi.fn(() => {
          throw new Error('canvas unavailable');
        }),
      }),
    ).rejects.toThrow('canvas unavailable');

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('revokes a fallback object URL when image decoding fails', async () => {
    const createObjectURL = vi.fn(() => 'blob:failed-image');
    const revokeObjectURL = vi.fn();
    class FailingImage {
      onerror: ((event: Event | string) => void) | null = null;
      onload: (() => void) | null = null;
      height = 0;
      naturalHeight = 0;
      naturalWidth = 0;
      width = 0;

      set src(_value: string) {
        this.onerror?.(new Event('error'));
      }
    }

    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('Image', FailingImage);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    try {
      await expect(prepareSegmentationImage(new Blob(['image'], { type: 'image/png' }))).rejects.toThrow(
        'Could not read segmentation image.',
      );
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:failed-image');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['nonfinite decoded width', { width: Number.POSITIVE_INFINITY, height: 100 }, {}, 'Could not determine segmentation image dimensions.'],
    ['nonpositive decoded height', { width: 100, height: 0 }, {}, 'Could not determine segmentation image dimensions.'],
    ['nonpositive maximum dimension', { width: 100, height: 80 }, { maxDimension: 0 }, 'Invalid segmentation image options.'],
    ['nonfinite quality', { width: 100, height: 80 }, { quality: Number.POSITIVE_INFINITY }, 'Invalid segmentation image options.'],
  ])('rejects a %s', async (_label, bitmap, options, error) => {
    await expect(
      prepareSegmentationImage(new Blob(['image'], { type: 'image/png' }), {
        createImageBitmapImpl: vi.fn().mockResolvedValue({ ...bitmap, close: vi.fn() }),
        createCanvas: vi.fn(),
        ...options,
      }),
    ).rejects.toThrow(error);
  });
});
