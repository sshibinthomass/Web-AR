import { describe, expect, it, vi } from 'vitest';
import {
  OBJECT_SEGMENTATION_CONFIDENCE_THRESHOLD,
  segmentObject,
  type ObjectSegmentationResult,
} from '../../src/services/objectSegmentationClient';

describe('segmentObject', () => {
  it('posts the image to the segmentation endpoint with auth and cancellation support', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detected: true,
          mask_base64: 'iVBORw0KGgo=',
          mask_mime_type: 'image/png',
          bounds: { x: 0.18, y: 0.12, width: 0.64, height: 0.73 },
          confidence: 0.94,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      segmentObject({
        apiUrl: 'https://worker.example/generate-3d/?stage=beta#ignored-fragment',
        imageBase64: 'cGhvdG8=',
        imageMimeType: 'image/webp',
        authToken: 'signed-token',
        signal: controller.signal,
        fetchImpl,
      }),
    ).resolves.toEqual({
      detected: true,
      maskBase64: 'iVBORw0KGgo=',
      maskMimeType: 'image/png',
      bounds: { x: 0.18, y: 0.12, width: 0.64, height: 0.73 },
      confidence: 0.94,
    } satisfies ObjectSegmentationResult);

    expect(fetchImpl).toHaveBeenCalledWith('https://worker.example/segment-image?stage=beta', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer signed-token',
      },
      body: JSON.stringify({ image_base64: 'cGhvdG8=', image_mime_type: 'image/webp' }),
      signal: controller.signal,
    });
  });

  it('maps a low-confidence detection to a no-object result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detected: true,
          mask_base64: 'bWFzaw==',
          mask_mime_type: 'image/png',
          bounds: { x: 0, y: 0, width: 1, height: 1 },
          confidence: OBJECT_SEGMENTATION_CONFIDENCE_THRESHOLD - 0.01,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      segmentObject({
        apiUrl: 'https://worker.example/generate-3d/',
        imageBase64: 'cGhvdG8=',
        imageMimeType: 'image/jpeg',
        fetchImpl,
      }),
    ).resolves.toEqual({ detected: false, confidence: 0.64 });
  });

  it('preserves an explicit no-object response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detected: false, confidence: 0.31 }), { status: 200 }),
    );

    await expect(
      segmentObject({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'cGhvdG8=',
        imageMimeType: 'image/jpeg',
        fetchImpl,
      }),
    ).resolves.toEqual({ detected: false, confidence: 0.31 });
  });

  it.each([
    ['missing', { confidence: 0.2 }],
    ['non-boolean', { detected: 'false', confidence: 0.2 }],
  ])('rejects a %s detection discriminator even below the confidence threshold', async (_label, body) => {
    await expect(
      segmentObject({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'cGhvdG8=',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
      }),
    ).rejects.toThrow('Worker returned an invalid segmentation detection result.');
  });

  it.each([
    ['non-PNG mask data', 'bm90LWEtcG5n'],
    ['noncanonical mask base64', 'iVBORw0KGgo'],
  ])('rejects %s', async (_label, maskBase64) => {
    await expect(
      segmentObject({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'cGhvdG8=',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              detected: true,
              mask_base64: maskBase64,
              mask_mime_type: 'image/png',
              bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
              confidence: 0.9,
            }),
            { status: 200 },
          ),
        ),
      }),
    ).rejects.toThrow('Worker returned an invalid object segmentation mask.');
  });

  it.each([
    ['invalid confidence', { detected: false, confidence: 2 }, 'Worker returned an invalid segmentation confidence.'],
    [
      'malformed bounds',
      {
        detected: true,
        mask_base64: 'bWFzaw==',
        mask_mime_type: 'image/png',
        bounds: { x: 0.8, y: 0.2, width: 0.3, height: 0.4 },
        confidence: 0.9,
      },
      'Worker returned an invalid object segmentation mask.',
    ],
    [
      'invalid mask',
      {
        detected: true,
        mask_base64: '',
        mask_mime_type: 'image/jpeg',
        bounds: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        confidence: 0.9,
      },
      'Worker returned an invalid object segmentation mask.',
    ],
  ])('rejects a %s response', async (_label, body, error) => {
    await expect(
      segmentObject({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'cGhvdG8=',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
      }),
    ).rejects.toThrow(error);
  });

  it('surfaces a Worker error message', async () => {
    await expect(
      segmentObject({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'cGhvdG8=',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Object segmentation failed.' }), { status: 502 })),
      }),
    ).rejects.toThrow('Object segmentation failed.');
  });

  it('preserves AbortError raised while reading the Worker response', async () => {
    const abortError = Object.assign(new Error('request cancelled'), { name: 'AbortError' });
    const response = {
      ok: false,
      status: 502,
      json: vi.fn().mockRejectedValue(abortError),
    } as unknown as Response;

    await expect(
      segmentObject({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'cGhvdG8=',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi.fn().mockResolvedValue(response),
      }),
    ).rejects.toBe(abortError);
  });

  it('normalizes malformed Worker error bodies without leaking parser failures', async () => {
    const response = {
      ok: false,
      status: 502,
      json: vi.fn().mockRejectedValue(new Error('internal parser detail')),
    } as unknown as Response;

    await expect(
      segmentObject({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'cGhvdG8=',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi.fn().mockResolvedValue(response),
      }),
    ).rejects.toThrow('Object segmentation failed with HTTP 502.');
  });
});
