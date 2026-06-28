import { describe, expect, it, vi } from 'vitest';
import { blobToBase64, getCaptureDimensions, startCameraPreview } from '../../src/capture/cameraCapture';

describe('cameraCapture', () => {
  it('converts a Blob to base64 without the data URL prefix', async () => {
    const blob = new Blob(['hello'], { type: 'image/jpeg' });

    await expect(blobToBase64(blob)).resolves.toBe('aGVsbG8=');
  });

  it('requests the rear camera and attaches the stream to the preview video', async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const video = document.createElement('video');
    vi.spyOn(video, 'play').mockResolvedValue(undefined);

    await startCameraPreview(video, {
      mediaDevices: { getUserMedia },
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { ideal: 'environment' },
      },
      audio: false,
    });
    expect(video.srcObject).toBe(stream);
    expect(video.playsInline).toBe(true);
  });

  it('downscales large camera frames before upload', () => {
    expect(getCaptureDimensions(1920, 1080, 768)).toEqual({
      width: 768,
      height: 432,
    });
    expect(getCaptureDimensions(640, 480, 768)).toEqual({
      width: 640,
      height: 480,
    });
  });
});
