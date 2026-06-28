import { describe, expect, it, vi } from 'vitest';
import { generateModelFromImage } from '../../src/services/generatedModelClient';

describe('generateModelFromImage', () => {
  it('posts the captured image to the Worker and returns the generated model result', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job_id: 'fc-123',
            status_url: 'https://worker.example/generate-3d/jobs/fc-123',
          }),
          {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'running' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model_url: 'https://assets.example/models/generated/capture.glb',
            object_key: 'models/generated/capture.glb',
            bytes: 4,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    const result = await generateModelFromImage({
      apiUrl: 'https://worker.example/generate-3d',
      imageBase64: 'abc123',
      imageMimeType: 'image/jpeg',
      fetchImpl,
      pollIntervalMs: 0,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://worker.example/generate-3d',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: 'abc123',
          image_mime_type: 'image/jpeg',
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://worker.example/generate-3d/jobs/fc-123');
    expect(fetchImpl).toHaveBeenNthCalledWith(3, 'https://worker.example/generate-3d/jobs/fc-123');
    expect(result).toEqual({
      modelUrl: 'https://assets.example/models/generated/capture.glb',
      objectKey: 'models/generated/capture.glb',
      bytes: 4,
    });
  });

  it('throws the Worker error message when generation fails', async () => {
    await expect(
      generateModelFromImage({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'abc123',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: 'Modal job start failed: nope' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      }),
    ).rejects.toThrow('Modal job start failed: nope');
  });

  it('stops polling when the generated model is not ready in time', async () => {
    await expect(
      generateModelFromImage({
        apiUrl: 'https://worker.example/generate-3d',
        imageBase64: 'abc123',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi
          .fn()
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                job_id: 'fc-123',
                status_url: 'https://worker.example/generate-3d/jobs/fc-123',
              }),
              {
                status: 202,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          )
          .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ status: 'running' }), { status: 202 }))),
        maxPolls: 2,
        pollIntervalMs: 0,
      }),
    ).rejects.toThrow('Generation is still running. Try again in a moment.');
  });

  it('requires a configured Worker API URL', async () => {
    await expect(
      generateModelFromImage({
        apiUrl: '',
        imageBase64: 'abc123',
        imageMimeType: 'image/jpeg',
        fetchImpl: vi.fn(),
      }),
    ).rejects.toThrow('Worker API URL is not configured.');
  });
});
