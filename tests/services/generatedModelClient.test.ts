import { describe, expect, it, vi } from 'vitest';
import { generateModelFromImage } from '../../src/services/generatedModelClient';

describe('generateModelFromImage', () => {
  it('posts the captured image to the Worker and returns the generated model result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
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
    });

    expect(fetchImpl).toHaveBeenCalledWith(
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
          new Response(JSON.stringify({ error: 'Modal generation failed: nope' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      }),
    ).rejects.toThrow('Modal generation failed: nope');
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
