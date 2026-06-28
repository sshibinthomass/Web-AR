import { describe, expect, it, vi } from 'vitest';
import worker, { handleGenerateModelRequest, type WorkerEnv } from '../../worker/src/index';

function createEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    MODAL_KEY: 'modal-key',
    MODAL_SECRET: 'modal-secret',
    MODAL_IMAGE_TO_3D_URL: 'https://modal.example/generate',
    MODAL_IMAGE_TO_3D_START_URL: 'https://modal.example/start',
    MODAL_IMAGE_TO_3D_RESULT_URL: 'https://modal.example/result',
    PUBLIC_MODEL_ORIGIN: 'https://web-ar-model-assets.pages.dev',
    MODEL_BUCKET: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function jsonRequest(body: unknown): Request {
  return new Request('https://worker.example/generate-3d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('handleGenerateModelRequest', () => {
  it('responds to CORS preflight', async () => {
    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d', {
        method: 'OPTIONS',
      }),
      createEnv(),
      { fetch: vi.fn(), now: () => new Date('2026-06-28T12:00:00Z') },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('rejects non-POST requests', async () => {
    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d'),
      createEnv(),
      { fetch: vi.fn(), now: () => new Date('2026-06-28T12:00:00Z') },
    );

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: 'Only POST requests are supported.' });
  });

  it('serves generated GLBs from R2', async () => {
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn().mockResolvedValue({
          body: new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer,
          httpMetadata: { contentType: 'model/gltf-binary' },
        }),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });

    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/models/generated/capture.glb'),
      env,
      { fetch: vi.fn(), now: () => new Date('2026-06-28T12:00:00Z') },
    );

    expect(env.MODEL_BUCKET.get).toHaveBeenCalledWith('models/generated/capture.glb');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('model/gltf-binary');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
  });

  it('uses the Worker origin for completed job model URLs when no public origin is configured', async () => {
    const glbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer;
    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/jobs/fc-123'),
      createEnv({
        PUBLIC_MODEL_ORIGIN: '',
      }),
      {
        fetch: vi.fn().mockResolvedValue(new Response(glbBytes, { status: 200 })),
        now: () => new Date('2026-06-28T12:00:00Z'),
      },
    );

    expect(await response.json()).toMatchObject({
      model_url: 'https://worker.example/models/generated/capture-20260628-120000.glb',
    });
  });

  it('requires image_base64', async () => {
    const response = await handleGenerateModelRequest(
      jsonRequest({ image_mime_type: 'image/jpeg' }),
      createEnv(),
      { fetch: vi.fn(), now: () => new Date('2026-06-28T12:00:00Z') },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'image_base64 is required.' });
  });

  it('starts a Modal job with secure headers and fast generation settings', async () => {
    const modalFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ call_id: 'fc-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const env = createEnv();

    const response = await handleGenerateModelRequest(
      jsonRequest({
        image_base64: 'abc123',
        image_mime_type: 'image/jpeg',
      }),
      env,
      { fetch: modalFetch, now: () => new Date('2026-06-28T12:00:00Z') },
    );

    expect(modalFetch).toHaveBeenCalledWith(
      'https://modal.example/start',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': 'modal-key',
          'Modal-Secret': 'modal-secret',
        },
        body: JSON.stringify({
          image_base64: 'abc123',
          seed: 42,
          pipeline_type: '512',
          decimation_target: 100000,
          texture_size: 1024,
        }),
      }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      job_id: 'fc-123',
      status_url: 'https://worker.example/generate-3d/jobs/fc-123',
    });
  });

  it('polls a running Modal job', async () => {
    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/jobs/fc-123'),
      createEnv(),
      {
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'running' }), { status: 202 })),
        now: () => new Date('2026-06-28T12:00:00Z'),
      },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: 'running' });
  });

  it('stores completed Modal job GLB bytes and returns the public URL', async () => {
    const glbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer;
    const env = createEnv();
    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/jobs/fc-123'),
      env,
      {
        fetch: vi.fn().mockResolvedValue(
          new Response(glbBytes, {
            status: 200,
            headers: { 'Content-Type': 'model/gltf-binary' },
          }),
        ),
        now: () => new Date('2026-06-28T12:00:00Z'),
      },
    );

    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/capture-20260628-120000.glb',
      expect.any(ArrayBuffer),
      { httpMetadata: { contentType: 'model/gltf-binary' } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      model_url: 'https://web-ar-model-assets.pages.dev/models/generated/capture-20260628-120000.glb',
      object_key: 'models/generated/capture-20260628-120000.glb',
      bytes: 4,
    });
  });

  it('uses a Worker runtime fetch wrapper instead of passing fetch as a method', async () => {
    const source = worker.fetch.toString();

    expect(source).not.toContain('fetch,');
    expect(source).toContain('fetch(input, init)');
  });

  it('returns a gateway error when Modal fails', async () => {
    const response = await handleGenerateModelRequest(
      jsonRequest({
        image_base64: 'abc123',
        image_mime_type: 'image/jpeg',
      }),
      createEnv(),
      {
        fetch: vi.fn().mockResolvedValue(new Response('Modal exploded', { status: 500 })),
        now: () => new Date('2026-06-28T12:00:00Z'),
      },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Modal job start failed: Modal exploded' });
  });
});
