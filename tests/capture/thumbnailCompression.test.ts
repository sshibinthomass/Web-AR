import { describe, expect, it, vi } from 'vitest';
import { compressThumbnailImage } from '../../src/capture/thumbnailCompression';

describe('compressThumbnailImage', () => {
  it('resizes a selected image and exports a compressed thumbnail blob', async () => {
    const drawImage = vi.fn();
    const close = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback, mimeType?: string, quality?: number) => {
      callback(new Blob([new Uint8Array(256)], { type: mimeType }));
      expect(quality).toBe(0.72);
    });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob,
    } as unknown as HTMLCanvasElement;

    const thumbnail = await compressThumbnailImage(
      new File([new Uint8Array(4096)], 'large-chair.png', { type: 'image/png' }),
      {
        createImageBitmapImpl: vi.fn().mockResolvedValue({ width: 2000, height: 1000, close }),
        createCanvas: vi.fn(() => canvas),
      },
    );

    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(256);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 512, 256);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.72);
    expect(close).toHaveBeenCalledTimes(1);
    expect(thumbnail).toEqual({
      base64: expect.any(String),
      bytes: 256,
      height: 256,
      mimeType: 'image/webp',
      width: 512,
    });
  });
});
