import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CAPTURE_IMAGE_MIME_TYPE,
  DEFAULT_CAPTURE_MAX_DIMENSION,
  blobToBase64,
  getCaptureDimensions,
  startCameraPreview,
  stopCameraPreview,
} from '../../src/capture/cameraCapture';

describe('cameraCapture', () => {
  it('converts a Blob to base64 without the data URL prefix', async () => {
    const blob = new Blob(['hello'], { type: 'image/jpeg' });

    await expect(blobToBase64(blob)).resolves.toBe('aGVsbG8=');
  });

  it('requests an HD rear camera stream and attaches it to the preview video', async () => {
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
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    expect(video.srcObject).toBe(stream);
    expect(video.playsInline).toBe(true);
  });

  it('downscales large camera frames before upload', () => {
    expect(DEFAULT_CAPTURE_IMAGE_MIME_TYPE).toBe('image/png');
    expect(DEFAULT_CAPTURE_MAX_DIMENSION).toBe(1536);
    expect(getCaptureDimensions(1920, 1080, DEFAULT_CAPTURE_MAX_DIMENSION)).toEqual({
      width: 1536,
      height: 864,
    });
    expect(getCaptureDimensions(640, 480, DEFAULT_CAPTURE_MAX_DIMENSION)).toEqual({
      width: 640,
      height: 480,
    });
    expect(getCaptureDimensions(641, 479, DEFAULT_CAPTURE_MAX_DIMENSION)).toEqual({
      width: 640,
      height: 464,
    });
  });

  it('stops every track in the active camera stream', () => {
    const firstTrack = { stop: vi.fn() };
    const secondTrack = { stop: vi.fn() };
    const stream = {
      getTracks: () => [firstTrack, secondTrack],
    } as unknown as MediaStream;

    stopCameraPreview(stream);

    expect(firstTrack.stop).toHaveBeenCalledTimes(1);
    expect(secondTrack.stop).toHaveBeenCalledTimes(1);
  });
});
