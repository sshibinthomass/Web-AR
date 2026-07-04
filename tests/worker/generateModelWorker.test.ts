import { describe, expect, it, vi } from 'vitest';
import worker, { handleGenerateModelRequest, handleScheduledPendingJobs, type WorkerEnv } from '../../worker/src/index';

function createEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    MODAL_KEY: 'modal-key',
    MODAL_SECRET: 'modal-secret',
    MODAL_IMAGE_TO_3D_URL: 'https://modal.example/generate',
    MODAL_IMAGE_TO_3D_START_URL: 'https://modal.example/start',
    MODAL_IMAGE_TO_3D_RESULT_URL: 'https://modal.example/result',
    MODAL_OPENAI_TO_3D_URL: 'https://modal.example/openai-generate',
    MODAL_OPENAI_TO_3D_START_URL: 'https://modal.example/openai-start',
    MODAL_OPENAI_TO_3D_RESULT_URL: 'https://modal.example/openai-result',
    OPENAI_API_KEY: 'openai-key',
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

function extractRequest(body: unknown): Request {
  return new Request('https://worker.example/extract-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function directOpenAiTo3DRequest(body: unknown): Request {
  return new Request('https://worker.example/generate-3d/openai', {
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
      model_url: 'https://worker.example/models/generated/capture-20260628-120000-fc-123.glb',
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

  it('extracts an image with OpenAI and returns it to the app', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: 'extracted-image-base64' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const env = createEnv();

    const response = await handleGenerateModelRequest(
      extractRequest({
        image_base64: 'abc123',
        image_mime_type: 'image/jpeg',
        target_object: ' laptop ',
      }),
      env,
      { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.openai.com/v1/images/edits',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer openai-key',
        },
      }),
    );
    const openAiBody = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(openAiBody.get('model')).toBe('gpt-image-2-2026-04-21');
    expect(openAiBody.get('prompt')).toBe(
      'Extract the laptop from the image. Place the laptop in a frontal-side position suitable for 3D generation, and make the background solid pure white. The final output must contain only a single laptop, in high quality (HQ), extremely sharp, with clear details and studio lighting, optimized for 3D reconstruction.',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      image_base64: 'extracted-image-base64',
      image_mime_type: 'image/png',
      target_object: 'laptop',
    });
  });

  it('starts a Modal job with the submitted image and target-aware label', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ call_id: 'fc-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const env = createEnv();

    const response = await handleGenerateModelRequest(
      jsonRequest({
        image_base64: 'aW1hZ2U=',
        image_mime_type: 'image/png',
        target_object: ' laptop ',
      }),
      env,
      { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://modal.example/start',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': 'modal-key',
          'Modal-Secret': 'modal-secret',
        },
        body: JSON.stringify({
          image_base64: 'aW1hZ2U=',
          seed: 42,
          pipeline_type: '512',
          decimation_target: 100000,
          texture_size: 1024,
        }),
      }),
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/previews/capture-20260628-120000-fc-123.png',
      expect.any(ArrayBuffer),
      { httpMetadata: { contentType: 'image/png' } },
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/fc-123.json',
      expect.stringContaining('"label":"laptop - 2026-06-28 12:00:00 UTC"'),
      { httpMetadata: { contentType: 'application/json' } },
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/fc-123.json',
      expect.stringContaining(
        '"preview_url":"https://web-ar-model-assets.pages.dev/models/generated/previews/capture-20260628-120000-fc-123.png"',
      ),
      { httpMetadata: { contentType: 'application/json' } },
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/index.json',
      JSON.stringify({ pending: ['fc-123'] }),
      { httpMetadata: { contentType: 'application/json' } },
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      job_id: 'fc-123',
      label: 'laptop - 2026-06-28 12:00:00 UTC',
      status: 'running',
      status_url: 'https://worker.example/generate-3d/jobs/fc-123',
    });
  });

  it('uses the main object prompt when extracting with empty target object', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ b64_json: 'main-object-image-base64' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const env = createEnv();

    const response = await handleGenerateModelRequest(
      extractRequest({
        image_base64: 'abc123',
        image_mime_type: 'image/jpeg',
        target_object: '   ',
      }),
      env,
      { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') },
    );

    const openAiBody = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(openAiBody.get('prompt')).toBe(
      'Extract the main, most prominent object from the image. Place it in a frontal-side position suitable for 3D generation, and make the background solid pure white. The final output must contain only a single object, in high quality (HQ), extremely sharp, with clear details and studio lighting, optimized for 3D reconstruction.',
    );
    expect(await response.json()).toMatchObject({
      image_base64: 'main-object-image-base64',
      target_object: null,
    });
  });

  it('starts a direct OpenAI-to-3D Modal job in the background', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ call_id: 'openai-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const env = createEnv();

    const response = await handleGenerateModelRequest(
      directOpenAiTo3DRequest({
        image_base64: 'captured-image-base64',
        image_mime_type: 'image/jpeg',
        target_object: ' laptop ',
      }),
      env,
      { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://modal.example/openai-start',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': 'modal-key',
          'Modal-Secret': 'modal-secret',
        },
        body: JSON.stringify({
          image_base64: 'captured-image-base64',
          prompt: 'laptop',
          seed: 42,
          pipeline_type: '512',
          decimation_target: 300000,
          texture_size: 1024,
        }),
      }),
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/openai-123.json',
      expect.stringContaining('"pipeline":"openai-to-3d"'),
      { httpMetadata: { contentType: 'application/json' } },
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      job_id: 'openai-123',
      label: 'laptop - 2026-06-28 12:00:00 UTC',
      status: 'running',
      status_url: 'https://worker.example/generate-3d/jobs/openai-123',
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
      'models/generated/capture-20260628-120000-fc-123.glb',
      expect.any(ArrayBuffer),
      { httpMetadata: { contentType: 'model/gltf-binary' } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'fc-123',
      label: '2026-06-28 12:00:00 UTC',
      status: 'completed',
      model_url: 'https://web-ar-model-assets.pages.dev/models/generated/capture-20260628-120000-fc-123.glb',
      object_key: 'models/generated/capture-20260628-120000-fc-123.glb',
      bytes: 4,
    });
  });

  it('polls stored OpenAI-to-3D jobs from the matching Modal result endpoint', async () => {
    const storedObjects = new Map<string, string>();
    storedObjects.set(
      'models/generated/jobs/openai-123.json',
      JSON.stringify({
        id: 'openai-123',
        label: 'laptop - 2026-06-28 12:00:00 UTC',
        status: 'running',
        pipeline: 'openai-to-3d',
        created_at: '2026-06-28T12:00:00.000Z',
        updated_at: '2026-06-28T12:00:00.000Z',
      }),
    );
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn((key: string) => {
          const value = storedObjects.get(key);
          return Promise.resolve(value ? { body: value, httpMetadata: { contentType: 'application/json' } } : null);
        }),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer, {
        status: 200,
        headers: { 'Content-Type': 'model/gltf-binary' },
      }),
    );

    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/jobs/openai-123'),
      env,
      { fetch: fetchMock, now: () => new Date('2026-06-28T12:05:00Z') },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://modal.example/openai-result?call_id=openai-123',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(response.status).toBe(200);
  });

  it('uses a Worker runtime fetch wrapper instead of passing fetch as a method', async () => {
    const source = worker.fetch.toString();

    expect(source).not.toContain('fetch,');
    expect(source).toContain('fetch(input, init)');
  });

  it('lists permanently generated models from R2 newest first', async () => {
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn().mockResolvedValue({
          body: JSON.stringify({
            models: [
              {
                id: 'older',
                label: '2026-06-28 11:00:00 UTC',
                model_url: 'https://assets.example/older.glb',
                object_key: 'models/generated/older.glb',
                completed_at: '2026-06-28T11:00:00.000Z',
                bytes: 4,
              },
              {
                id: 'newer',
                label: '2026-06-28 12:00:00 UTC',
                model_url: 'https://assets.example/newer.glb',
                object_key: 'models/generated/newer.glb',
                completed_at: '2026-06-28T12:00:00.000Z',
                bytes: 4,
              },
            ],
          }),
          httpMetadata: { contentType: 'application/json' },
        }),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });

    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/models'),
      env,
      { fetch: vi.fn(), now: () => new Date('2026-06-28T12:00:00Z') },
    );

    expect(env.MODEL_BUCKET.get).toHaveBeenCalledWith('models/generated/index.json');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      models: [
        expect.objectContaining({ id: 'newer', label: '2026-06-28 12:00:00 UTC' }),
        expect.objectContaining({ id: 'older', label: '2026-06-28 11:00:00 UTC' }),
      ],
    });
  });

  it('renames a permanently generated model in the model index and job metadata', async () => {
    const storedObjects = new Map<string, string>();
    storedObjects.set(
      'models/generated/index.json',
      JSON.stringify({
        models: [
          {
            id: 'fc-123',
            label: 'chair - 2026-07-04 12:00:00 UTC',
            model_url: 'https://assets.example/generated-chair.glb',
            object_key: 'models/generated/generated-chair.glb',
            preview_url: 'https://assets.example/previews/generated-chair.png',
            preview_object_key: 'models/generated/previews/generated-chair.png',
            completed_at: '2026-07-04T12:00:00.000Z',
            bytes: 4,
          },
        ],
      }),
    );
    storedObjects.set(
      'models/generated/jobs/fc-123.json',
      JSON.stringify({
        id: 'fc-123',
        label: 'chair - 2026-07-04 12:00:00 UTC',
        status: 'completed',
        completed_at: '2026-07-04T12:00:00.000Z',
        updated_at: '2026-07-04T12:00:00.000Z',
      }),
    );
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn((key: string) => {
          const value = storedObjects.get(key);
          return Promise.resolve(value ? { body: value, httpMetadata: { contentType: 'application/json' } } : null);
        }),
        put: vi.fn((key: string, value: ArrayBuffer | ReadableStream | string) => {
          if (typeof value === 'string') {
            storedObjects.set(key, value);
          }
          return Promise.resolve(undefined);
        }),
      },
    });

    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/models/fc-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: '  Living room chair  ' }),
      }),
      env,
      { fetch: vi.fn(), now: () => new Date('2026-07-04T12:30:00Z') },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'fc-123', label: 'Living room chair' });
    expect(JSON.parse(storedObjects.get('models/generated/index.json')!)).toEqual({
      models: [expect.objectContaining({ id: 'fc-123', label: 'Living room chair' })],
    });
    expect(JSON.parse(storedObjects.get('models/generated/jobs/fc-123.json')!)).toMatchObject({
      label: 'Living room chair',
      updated_at: '2026-07-04T12:30:00.000Z',
    });
  });

  it('deletes a permanently generated model from the dropdown index and stored objects', async () => {
    const storedObjects = new Map<string, string>();
    storedObjects.set(
      'models/generated/index.json',
      JSON.stringify({
        models: [
          {
            id: 'fc-123',
            label: 'Living room chair',
            model_url: 'https://assets.example/generated-chair.glb',
            object_key: 'models/generated/generated-chair.glb',
            preview_url: 'https://assets.example/previews/generated-chair.png',
            preview_object_key: 'models/generated/previews/generated-chair.png',
            completed_at: '2026-07-04T12:00:00.000Z',
            bytes: 4,
          },
        ],
      }),
    );
    storedObjects.set('models/generated/jobs/fc-123.json', JSON.stringify({ id: 'fc-123' }));
    const deleteMock = vi.fn((key: string) => {
      storedObjects.delete(key);
      return Promise.resolve(undefined);
    });
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn((key: string) => {
          const value = storedObjects.get(key);
          return Promise.resolve(value ? { body: value, httpMetadata: { contentType: 'application/json' } } : null);
        }),
        put: vi.fn((key: string, value: ArrayBuffer | ReadableStream | string) => {
          if (typeof value === 'string') {
            storedObjects.set(key, value);
          }
          return Promise.resolve(undefined);
        }),
        delete: deleteMock,
      },
    });

    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/models/fc-123', {
        method: 'DELETE',
      }),
      env,
      { fetch: vi.fn(), now: () => new Date('2026-07-04T12:30:00Z') },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, id: 'fc-123' });
    expect(JSON.parse(storedObjects.get('models/generated/index.json')!)).toEqual({ models: [] });
    expect(deleteMock).toHaveBeenCalledWith('models/generated/generated-chair.glb');
    expect(deleteMock).toHaveBeenCalledWith('models/generated/previews/generated-chair.png');
    expect(deleteMock).toHaveBeenCalledWith('models/generated/jobs/fc-123.json');
  });

  it('scheduled polling completes pending Modal jobs and indexes them permanently', async () => {
    const storedObjects = new Map<string, string>();
    storedObjects.set('models/generated/jobs/index.json', JSON.stringify({ pending: ['fc-123'] }));
    storedObjects.set(
      'models/generated/jobs/fc-123.json',
      JSON.stringify({
        id: 'fc-123',
        label: '2026-06-28 12:00:00 UTC',
        status: 'running',
        created_at: '2026-06-28T12:00:00.000Z',
        updated_at: '2026-06-28T12:00:00.000Z',
        preview_url: 'https://web-ar-model-assets.pages.dev/models/generated/previews/capture-20260628-120000-fc-123.jpeg',
        preview_object_key: 'models/generated/previews/capture-20260628-120000-fc-123.jpeg',
      }),
    );
    storedObjects.set('models/generated/index.json', JSON.stringify({ models: [] }));
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn((key: string) => {
          const value = storedObjects.get(key);
          return Promise.resolve(
            value
              ? {
                  body: value,
                  httpMetadata: { contentType: 'application/json' },
                }
              : null,
          );
        }),
        put: vi.fn((key: string, value: ArrayBuffer | ReadableStream | string) => {
          if (typeof value === 'string') {
            storedObjects.set(key, value);
          }
          return Promise.resolve(undefined);
        }),
      },
    });

    const processed = await handleScheduledPendingJobs(env, {
      fetch: vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'model/gltf-binary' },
        }),
      ),
      now: () => new Date('2026-06-28T12:05:00Z'),
    });

    expect(processed).toEqual({ completed: 1, failed: 0, stillRunning: 0 });
    expect(JSON.parse(storedObjects.get('models/generated/jobs/index.json')!)).toEqual({ pending: [] });
    expect(JSON.parse(storedObjects.get('models/generated/index.json')!)).toEqual({
      models: [
        expect.objectContaining({
          id: 'fc-123',
          label: '2026-06-28 12:00:00 UTC',
          model_url: 'https://web-ar-model-assets.pages.dev/models/generated/capture-20260628-120000-fc-123.glb',
          preview_url: 'https://web-ar-model-assets.pages.dev/models/generated/previews/capture-20260628-120000-fc-123.jpeg',
          preview_object_key: 'models/generated/previews/capture-20260628-120000-fc-123.jpeg',
        }),
      ],
    });
  });

  it('returns a gateway error when Modal fails', async () => {
    const response = await handleGenerateModelRequest(
      jsonRequest({
        image_base64: 'abc123',
        image_mime_type: 'image/jpeg',
      }),
      createEnv(),
      {
        fetch: vi.fn().mockResolvedValueOnce(new Response('Modal exploded', { status: 500 })),
        now: () => new Date('2026-06-28T12:00:00Z'),
      },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Modal job start failed: Modal exploded' });
  });
});
