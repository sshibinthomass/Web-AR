import { describe, expect, it, vi } from 'vitest';
import worker, { handleGenerateModelRequest, handleScheduledPendingJobs, type WorkerEnv } from '../../worker/src/index';

function createEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    AUTH_SECRET: 'unit-test-auth-secret',
    ADMIN_EMAIL: 'sshibinthomass@gmail.com',
    MODAL_KEY: 'modal-key',
    MODAL_SECRET: 'modal-secret',
    MODAL_IMAGE_TO_3D_START_URL: 'https://modal.example/start',
    MODAL_IMAGE_TO_3D_RESULT_URL: 'https://modal.example/result',
    MODAL_OPENAI_TO_3D_START_URL: 'https://modal.example/openai-start',
    MODAL_OPENAI_TO_3D_RESULT_URL: 'https://modal.example/openai-result',
    MODAL_OBJECT_PREPROCESS_QUALITY_URL: 'https://modal.example/quality-preprocess',
    MODAL_OBJECT_SEGMENTATION_URL: 'https://modal.example/segment',
    OPENAI_API_KEY: 'openai-key',
    PUBLIC_MODEL_ORIGIN: 'https://web-ar-model-assets.pages.dev',
    MODEL_BUCKET: createMemoryBucket().bucket,
    ...overrides,
  };
}

function createMemoryBucket(initialObjects: Record<string, string | ArrayBuffer> = {}) {
  const objects = new Map<string, string | ArrayBuffer>(Object.entries(initialObjects));
  const bucket = {
    get: vi.fn((key: string) => {
      const value = objects.get(key);
      if (!value) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        body: value,
        httpMetadata: { contentType: typeof value === 'string' ? 'application/json' : 'application/octet-stream' },
        text: () => Promise.resolve(typeof value === 'string' ? value : new TextDecoder().decode(value)),
        arrayBuffer: () => Promise.resolve(typeof value === 'string' ? new TextEncoder().encode(value).buffer : value),
      });
    }),
    put: vi.fn((key: string, value: ArrayBuffer | ReadableStream | string) => {
      if (typeof value === 'string' || value instanceof ArrayBuffer) {
        objects.set(key, value);
      }
      return Promise.resolve(undefined);
    }),
    delete: vi.fn((key: string) => {
      objects.delete(key);
      return Promise.resolve(undefined);
    }),
  };

  return { bucket, objects };
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

function dynamicGenerationRequest(body: unknown): Request {
  return new Request('https://worker.example/generate-3d/dynamic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function speechGenerationRequest(body: unknown): Request {
  return new Request('https://worker.example/generate-3d/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function textGenerationRequest(body: unknown): Request {
  return new Request('https://worker.example/generate-3d/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function createAdminToken(
  env: WorkerEnv,
  deps: { fetch: typeof fetch; now: () => Date } = {
    fetch: vi.fn(),
    now: () => new Date('2026-07-04T12:00:00Z'),
  },
): Promise<string> {
  const response = await handleGenerateModelRequest(
    new Request('https://worker.example/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sshibinthomass@gmail.com', password: 'admin-password-123' }),
    }),
    env,
    deps,
  );
  const body = (await response.json()) as { token?: string };
  if (!body.token) {
    throw new Error('Admin token was not returned.');
  }
  return body.token;
}

function withAuth(request: Request, token: string): Request {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(request, { headers });
}

async function createApprovedUserToken(
  env: WorkerEnv,
  deps: { fetch: typeof fetch; now: () => Date },
  adminToken: string,
  email = 'maker@example.com',
): Promise<string> {
  await handleGenerateModelRequest(
    new Request('https://worker.example/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'maker-password-123', name: 'Maker' }),
    }),
    env,
    deps,
  );
  await handleGenerateModelRequest(
    new Request(`https://worker.example/auth/users/${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'active' }),
    }),
    env,
    deps,
  );
  const loginResponse = await handleGenerateModelRequest(
    new Request('https://worker.example/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'maker-password-123' }),
    }),
    env,
    deps,
  );
  const loginBody = (await loginResponse.json()) as { token?: string };
  if (!loginBody.token) {
    throw new Error('Approved user token was not returned.');
  }
  return loginBody.token;
}

describe('handleGenerateModelRequest', () => {
  describe('segment-image', () => {
    const now = () => new Date('2026-07-17T12:00:00Z');
    const validMaskBase64 = 'iVBORw0KGgo=';

    async function createSegmentationToken(env: WorkerEnv, modalFetch: typeof fetch): Promise<string> {
      const deps = { fetch: modalFetch, now };
      const adminToken = await createAdminToken(env, deps);
      const token = await createApprovedUserToken(env, deps, adminToken);
      vi.mocked(env.MODEL_BUCKET.put).mockClear();
      return token;
    }

    function segmentImageRequest(token: string, body: unknown = {
      image_base64: 'aGVsbG8=',
      image_mime_type: 'image/jpeg',
    }): Request {
      return new Request('https://worker.example/segment-image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    }

    it('requires an approved session before proxying segment-image requests', async () => {
      const modalFetch = vi.fn();
      const response = await handleGenerateModelRequest(
        segmentImageRequest('not-a-session'),
        createEnv(),
        { fetch: modalFetch, now },
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Login required.' });
      expect(modalFetch).not.toHaveBeenCalled();
    });

    it('proxies a validated segment-image request and reconstructs a detected response without R2 writes', async () => {
      const modalFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
        detected: true,
        mask_base64: validMaskBase64,
        mask_mime_type: 'image/png',
        bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
        confidence: 0.91,
        ignored_upstream_field: 'not forwarded',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      const env = createEnv();
      const token = await createSegmentationToken(env, modalFetch as typeof fetch);

      const response = await handleGenerateModelRequest(
        segmentImageRequest(token),
        env,
        { fetch: modalFetch as typeof fetch, now },
      );

      expect(response.status).toBe(200);
      expect(modalFetch).toHaveBeenCalledWith('https://modal.example/segment', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': 'modal-key',
          'Modal-Secret': 'modal-secret',
        },
      }));
      const forwardedInit = modalFetch.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(String(forwardedInit.body))).toEqual({
        image_base64: 'aGVsbG8=',
        image_mime_type: 'image/jpeg',
      });
      expect(await response.json()).toEqual({
        detected: true,
        mask_base64: validMaskBase64,
        mask_mime_type: 'image/png',
        bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
        confidence: 0.91,
      });
      expect(env.MODEL_BUCKET.put).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty payload', ''],
      ['non-base64 characters', 'not/base64*'],
      ['non-canonical padding', 'aGVsbG8'],
      ['non-canonical padding bits', 'aGVsbG9='],
    ])('rejects %s in segment-image input', async (_description, imageBase64) => {
      const modalFetch = vi.fn();
      const env = createEnv();
      const token = await createSegmentationToken(env, modalFetch as typeof fetch);

      const response = await handleGenerateModelRequest(
        segmentImageRequest(token, { image_base64: imageBase64, image_mime_type: 'image/jpeg' }),
        env,
        { fetch: modalFetch as typeof fetch, now },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid segmentation image payload.' });
      expect(modalFetch).not.toHaveBeenCalled();
    });

    it('rejects a null segment-image JSON value', async () => {
      const modalFetch = vi.fn();
      const env = createEnv();
      const token = await createSegmentationToken(env, modalFetch as typeof fetch);

      const response = await handleGenerateModelRequest(
        segmentImageRequest(token, null),
        env,
        { fetch: modalFetch as typeof fetch, now },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid segmentation image payload.' });
      expect(modalFetch).not.toHaveBeenCalled();
    });

    it.each(['image/jpg', 'image/JPEG', 'image/jpeg; charset=binary']) (
      'rejects non-exact segment-image MIME type %s',
      async (imageMimeType) => {
        const modalFetch = vi.fn();
        const env = createEnv();
        const token = await createSegmentationToken(env, modalFetch as typeof fetch);

        const response = await handleGenerateModelRequest(
          segmentImageRequest(token, { image_base64: 'aGVsbG8=', image_mime_type: imageMimeType }),
          env,
          { fetch: modalFetch as typeof fetch, now },
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid segmentation image payload.' });
        expect(modalFetch).not.toHaveBeenCalled();
      },
    );

    it('rejects segment-image input larger than 5 MiB before proxying', async () => {
      const modalFetch = vi.fn();
      const env = createEnv();
      const token = await createSegmentationToken(env, modalFetch as typeof fetch);
      const oversizedBase64 = Buffer.alloc((5 * 1024 * 1024) + 1).toString('base64');

      const response = await handleGenerateModelRequest(
        segmentImageRequest(token, { image_base64: oversizedBase64, image_mime_type: 'image/png' }),
        env,
        { fetch: modalFetch as typeof fetch, now },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid segmentation image payload.' });
      expect(modalFetch).not.toHaveBeenCalled();
    });

    it('returns a safe unavailable response when the segment-image endpoint is not configured', async () => {
      const modalFetch = vi.fn();
      const env = createEnv({
        MODAL_OBJECT_SEGMENTATION_URL: '',
        OPENAI_API_KEY: '',
      });
      const token = await createSegmentationToken(env, modalFetch as typeof fetch);
      const request = new Request('https://worker.example/segment-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{invalid-json',
      });

      const response = await handleGenerateModelRequest(request, env, { fetch: modalFetch as typeof fetch, now });

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'Object segmentation service is unavailable.' });
      expect(modalFetch).not.toHaveBeenCalled();
      expect(env.MODEL_BUCKET.put).not.toHaveBeenCalled();
    });

    it('returns an explicit detected-false segment-image response without forwarding extra fields', async () => {
      const modalFetch = vi.fn(async () => new Response(JSON.stringify({
        detected: false,
        confidence: 0.42,
        mask_base64: validMaskBase64,
        mask_mime_type: 'image/png',
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      })));
      const env = createEnv();
      const token = await createSegmentationToken(env, modalFetch as typeof fetch);

      const response = await handleGenerateModelRequest(
        segmentImageRequest(token),
        env,
        { fetch: modalFetch as typeof fetch, now },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ detected: false, confidence: 0.42 });
      expect(env.MODEL_BUCKET.put).not.toHaveBeenCalled();
    });

    it.each([
      ['invalid JSON', 'not-json'],
      ['null JSON', 'null'],
      ['invalid confidence', JSON.stringify({ detected: false, confidence: 1.1 })],
      ['non-PNG MIME', JSON.stringify({
        detected: true,
        confidence: 0.9,
        mask_base64: validMaskBase64,
        mask_mime_type: 'image/jpeg',
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      })],
      ['invalid mask base64', JSON.stringify({
        detected: true,
        confidence: 0.9,
        mask_base64: '***',
        mask_mime_type: 'image/png',
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      })],
      ['missing PNG signature', JSON.stringify({
        detected: true,
        confidence: 0.9,
        mask_base64: 'bWFzaw==',
        mask_mime_type: 'image/png',
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      })],
      ['non-positive bounds', JSON.stringify({
        detected: true,
        confidence: 0.9,
        mask_base64: validMaskBase64,
        mask_mime_type: 'image/png',
        bounds: { x: 0, y: 0, width: 0, height: 1 },
      })],
      ['out-of-range bounds', JSON.stringify({
        detected: true,
        confidence: 0.9,
        mask_base64: validMaskBase64,
        mask_mime_type: 'image/png',
        bounds: { x: 0.6, y: 0, width: 0.5, height: 1 },
      })],
    ])('returns a sanitized 502 for malformed segment-image success: %s', async (_description, responseBody) => {
      const modalFetch = vi.fn(async () => new Response(responseBody));
      const env = createEnv();
      const token = await createSegmentationToken(env, modalFetch as typeof fetch);

      const response = await handleGenerateModelRequest(
        segmentImageRequest(token),
        env,
        { fetch: modalFetch as typeof fetch, now },
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Object segmentation service returned an invalid response.' });
    });

    it('returns a sanitized 502 for a non-success segment-image upstream response', async () => {
      const modalFetch = vi.fn(async () => new Response('upstream secret details', { status: 500 }));
      const env = createEnv();
      const token = await createSegmentationToken(env, modalFetch as typeof fetch);

      const response = await handleGenerateModelRequest(
        segmentImageRequest(token),
        env,
        { fetch: modalFetch as typeof fetch, now },
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Object segmentation service request failed.' });
    });

    it('returns a sanitized 502 when the segment-image upstream request fails', async () => {
      const modalFetch = vi.fn(async () => {
        throw new Error('network secret details');
      });
      const env = createEnv();
      const token = await createSegmentationToken(env, modalFetch as typeof fetch);

      const response = await handleGenerateModelRequest(
        segmentImageRequest(token),
        env,
        { fetch: modalFetch as typeof fetch, now },
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Object segmentation service request failed.' });
    });

    it('aborts segment-image proxy requests after 60 seconds and returns 504', async () => {
      const env = createEnv();
      const setupFetch = vi.fn();
      const token = await createSegmentationToken(env, setupFetch as typeof fetch);
      let notifyFetchStarted: (() => void) | undefined;
      const fetchStarted = new Promise<void>((resolve) => {
        notifyFetchStarted = resolve;
      });
      const modalFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        notifyFetchStarted?.();
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }));

      vi.useFakeTimers();
      try {
        const responsePromise = handleGenerateModelRequest(
          segmentImageRequest(token),
          env,
          { fetch: modalFetch as typeof fetch, now },
        );
        await fetchStarted;
        await vi.advanceTimersByTimeAsync(60_000);
        const response = await responsePromise;

        expect(response.status).toBe(504);
        expect(await response.json()).toEqual({ error: 'Object segmentation service timed out.' });
        expect(modalFetch).toHaveBeenCalledWith('https://modal.example/segment', expect.objectContaining({
          signal: expect.any(AbortSignal),
        }));
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps the segment-image timeout active while reading the upstream response body', async () => {
      const env = createEnv();
      const setupFetch = vi.fn();
      const token = await createSegmentationToken(env, setupFetch as typeof fetch);
      let notifyBodyReadStarted: (() => void) | undefined;
      const bodyReadStarted = new Promise<void>((resolve) => {
        notifyBodyReadStarted = resolve;
      });
      const modalFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            notifyBodyReadStarted?.();
            init?.signal?.addEventListener('abort', () => {
              controller.error(new DOMException('aborted', 'AbortError'));
            });
          },
        }),
      ));

      vi.useFakeTimers();
      try {
        const responsePromise = handleGenerateModelRequest(
          segmentImageRequest(token),
          env,
          { fetch: modalFetch as typeof fetch, now },
        );
        await bodyReadStarted;
        await vi.advanceTimersByTimeAsync(60_000);
        const response = await responsePromise;

        expect(response.status).toBe(504);
        expect(await response.json()).toEqual({ error: 'Object segmentation service timed out.' });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('creates the requested admin account as active and returns a reusable session', async () => {
    const { bucket } = createMemoryBucket();
    const env = createEnv({ MODEL_BUCKET: bucket });

    const signupResponse = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ' sshibinthomass@gmail.com ',
          password: 'admin-password-123',
          name: 'Shibin',
        }),
      }),
      env,
      { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') },
    );

    expect(signupResponse.status).toBe(201);
    const signupBody = (await signupResponse.json()) as {
      token?: string;
      user?: { email: string; role: string; status: string; name: string };
    };
    expect(signupBody.user).toEqual({
      email: 'sshibinthomass@gmail.com',
      name: 'Shibin',
      role: 'admin',
      status: 'active',
    });
    expect(signupBody.token).toEqual(expect.any(String));

    const sessionResponse = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/session', {
        headers: { Authorization: `Bearer ${signupBody.token}` },
      }),
      env,
      { fetch: vi.fn(), now: () => new Date('2026-07-04T12:01:00Z') },
    );

    expect(sessionResponse.status).toBe(200);
    expect(await sessionResponse.json()).toEqual({
      user: {
        email: 'sshibinthomass@gmail.com',
        name: 'Shibin',
        role: 'admin',
        status: 'active',
      },
    });
  });

  it('uses a Cloudflare-compatible PBKDF2 iteration count during signup', async () => {
    const originalDeriveBits = crypto.subtle.deriveBits.bind(crypto.subtle);
    const deriveBitsSpy = vi.spyOn(crypto.subtle, 'deriveBits').mockImplementation((algorithm, baseKey, length) => {
      if (
        typeof algorithm === 'object' &&
        'iterations' in algorithm &&
        typeof algorithm.iterations === 'number' &&
        algorithm.iterations > 100_000
      ) {
        return Promise.reject(
          new DOMException(
            `Pbkdf2 failed: iteration counts above 100000 are not supported (requested ${algorithm.iterations}).`,
            'NotSupportedError',
          ),
        );
      }

      return originalDeriveBits(algorithm, baseKey, length);
    });

    try {
      const { bucket } = createMemoryBucket();
      const response = await handleGenerateModelRequest(
        new Request('https://worker.example/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'worker-compatible@example.com',
            password: 'password123',
            name: 'Compatible User',
          }),
        }),
        createEnv({ MODEL_BUCKET: bucket }),
        { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') },
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        user: {
          email: 'worker-compatible@example.com',
          name: 'Compatible User',
          role: 'user',
          status: 'pending',
        },
      });
    } finally {
      deriveBitsSpy.mockRestore();
    }
  });

  it('keeps new user accounts pending until the admin approves them and allows removal', async () => {
    const { bucket } = createMemoryBucket();
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') };

    const adminSignup = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'sshibinthomass@gmail.com', password: 'admin-password-123' }),
      }),
      env,
      deps,
    );
    const adminToken = ((await adminSignup.json()) as { token: string }).token;

    const userSignup = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'maker@example.com', password: 'maker-password-123', name: 'Maker' }),
      }),
      env,
      deps,
    );

    expect(userSignup.status).toBe(201);
    expect(await userSignup.json()).toEqual({
      user: {
        email: 'maker@example.com',
        name: 'Maker',
        role: 'user',
        status: 'pending',
      },
    });

    const pendingLogin = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'maker@example.com', password: 'maker-password-123' }),
      }),
      env,
      deps,
    );

    expect(pendingLogin.status).toBe(403);
    expect(await pendingLogin.json()).toEqual({ error: 'Account pending admin approval.' });

    const listResponse = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/users', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      env,
      deps,
    );

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      users: [
        expect.objectContaining({ email: 'sshibinthomass@gmail.com', role: 'admin', status: 'active' }),
        expect.objectContaining({ email: 'maker@example.com', role: 'user', status: 'pending' }),
      ],
    });

    const approveResponse = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/users/maker%40example.com', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'active' }),
      }),
      env,
      deps,
    );

    expect(approveResponse.status).toBe(200);
    expect(await approveResponse.json()).toEqual({
      user: expect.objectContaining({ email: 'maker@example.com', role: 'user', status: 'active' }),
    });

    const approvedLogin = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'maker@example.com', password: 'maker-password-123' }),
      }),
      env,
      deps,
    );

    expect(approvedLogin.status).toBe(200);
    expect(await approvedLogin.json()).toMatchObject({
      token: expect.any(String),
      user: { email: 'maker@example.com', name: 'Maker', role: 'user', status: 'active' },
    });

    const removeResponse = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/users/maker%40example.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      env,
      deps,
    );

    expect(removeResponse.status).toBe(200);
    expect(await removeResponse.json()).toEqual({ deleted: true, email: 'maker@example.com' });
  });

  it('requires an approved session for generation and upload writes while leaving model reads public', async () => {
    const { bucket } = createMemoryBucket({
      'models/generated/index.json': JSON.stringify({ models: [] }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') };

    const generateResponse = await handleGenerateModelRequest(
      jsonRequest({ image_base64: 'aW1hZ2U=', image_mime_type: 'image/png' }),
      env,
      deps,
    );
    const uploadResponse = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/models/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: 'chair.glb', model_base64: 'Z2xURg==' }),
      }),
      env,
      deps,
    );
    const publicModelsResponse = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/models'),
      env,
      deps,
    );

    expect(generateResponse.status).toBe(401);
    expect(await generateResponse.json()).toEqual({ error: 'Login required.' });
    expect(uploadResponse.status).toBe(401);
    expect(await uploadResponse.json()).toEqual({ error: 'Login required.' });
    expect(publicModelsResponse.status).toBe(200);
    expect(await publicModelsResponse.json()).toEqual({ models: [] });
  });

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
    const env = createEnv({
      PUBLIC_MODEL_ORIGIN: '',
    });
    const deps = {
      fetch: vi.fn().mockResolvedValue(new Response(glbBytes, { status: 200 })),
      now: () => new Date('2026-06-28T12:00:00Z'),
    };
    const token = await createAdminToken(env, deps);
    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/jobs/fc-123'), token),
      env,
      deps,
    );

    expect(await response.json()).toMatchObject({
      model_url: 'https://worker.example/models/generated/capture-20260628-120000-fc-123.glb',
    });
  });

  it('requires image_base64', async () => {
    const env = createEnv();
    const deps = { fetch: vi.fn(), now: () => new Date('2026-06-28T12:00:00Z') };
    const token = await createAdminToken(env, deps);
    const response = await handleGenerateModelRequest(
      withAuth(jsonRequest({ image_mime_type: 'image/jpeg' }), token),
      env,
      deps,
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
    const deps = { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') };
    const token = await createAdminToken(env, deps);

    const response = await handleGenerateModelRequest(
      withAuth(extractRequest({
        image_base64: 'abc123',
        image_mime_type: 'image/jpeg',
        target_object: ' laptop ',
      }), token),
      env,
      deps,
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
    const deps = { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') };
    const token = await createAdminToken(env, deps);

    const response = await handleGenerateModelRequest(
      withAuth(jsonRequest({
        image_base64: 'aW1hZ2U=',
        image_mime_type: 'image/png',
        target_object: ' laptop ',
      }), token),
      env,
      deps,
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
    const deps = { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') };
    const token = await createAdminToken(env, deps);

    const response = await handleGenerateModelRequest(
      withAuth(extractRequest({
        image_base64: 'abc123',
        image_mime_type: 'image/jpeg',
        target_object: '   ',
      }), token),
      env,
      deps,
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
    const deps = { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') };
    const token = await createAdminToken(env, deps);

    const response = await handleGenerateModelRequest(
      withAuth(directOpenAiTo3DRequest({
        image_base64: 'captured-image-base64',
        image_mime_type: 'image/jpeg',
        target_object: ' laptop ',
      }), token),
      env,
      deps,
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

  it('starts a Dynamic Modal job by preprocessing the image before TRELLIS generation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            image_base64: 'dynamic-image-base64',
            image_format: 'png',
            used_image_gen: true,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ call_id: 'dynamic-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const env = createEnv();
    const deps = { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') };
    const token = await createAdminToken(env, deps);

    const response = await handleGenerateModelRequest(
      withAuth(dynamicGenerationRequest({
        image_base64: 'captured-image-base64',
        image_mime_type: 'image/jpeg',
        target_object: ' chair ',
      }), token),
      env,
      deps,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://modal.example/quality-preprocess',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': 'modal-key',
          'Modal-Secret': 'modal-secret',
        },
        body: JSON.stringify({
          image_base64: 'captured-image-base64',
          target_text: 'chair',
          force_image_gen: true,
          return_debug_images: false,
          validate_output: true,
          auto_image_gen_on_validation_fail: true,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://modal.example/start',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': 'modal-key',
          'Modal-Secret': 'modal-secret',
        },
        body: JSON.stringify({
          image_base64: 'dynamic-image-base64',
          seed: 42,
          pipeline_type: '512',
          decimation_target: 100000,
          texture_size: 1024,
        }),
      }),
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/dynamic-123.json',
      expect.stringContaining('"pipeline":"dynamic"'),
      { httpMetadata: { contentType: 'application/json' } },
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      job_id: 'dynamic-123',
      label: 'chair - 2026-06-28 12:00:00 UTC',
      status: 'running',
      status_url: 'https://worker.example/generate-3d/jobs/dynamic-123',
    });
  });

  it('requires an approved session before accepting speech-to-3D audio', async () => {
    const response = await handleGenerateModelRequest(
      speechGenerationRequest({
        audio_base64: 'YXVkaW8=',
        audio_mime_type: 'audio/webm',
      }),
      createEnv(),
      { fetch: vi.fn(), now: () => new Date('2026-06-28T12:00:00Z') },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Login required.' });
  });

  it('queues approved text as a background job, then optimizes it and starts a TRELLIS job', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              object: 'small walnut desk',
              prompt:
                'Single centered small walnut desk with rounded corners, full object visible, clean silhouette, white background, studio lighting, no text, optimized for image-to-3D reconstruction.',
            }),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: 'text-image-base64' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ call_id: 'text-modal-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const env = createEnv();
    const deps = { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') };
    const token = await createAdminToken(env, deps);
    const waitUntilPromises: Promise<unknown>[] = [];

    const response = await handleGenerateModelRequest(
      withAuth(textGenerationRequest({
        text: 'Make a small walnut desk with rounded corners.',
      }), token),
      env,
      deps,
      {
        waitUntil: (promise) => {
          waitUntilPromises.push(promise);
        },
      },
    );

    expect(response.status).toBe(202);
    const queuedJob = (await response.json()) as {
      job_id: string;
      label: string;
      status: string;
      stage: string;
      status_url: string;
      transcript: string;
    };
    expect(queuedJob).toEqual({
      job_id: 'text-20260628120000-3b9f3d84',
      label: 'Text object - 2026-06-28 12:00:00 UTC',
      status: 'running',
      stage: 'detecting_speech',
      status_url: 'https://worker.example/generate-3d/jobs/text-20260628120000-3b9f3d84',
      transcript: 'Make a small walnut desk with rounded corners.',
    });
    expect(waitUntilPromises).toHaveLength(1);

    await waitUntilPromises[0];

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
    const promptBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(promptBody.model).toBe('gpt-5.5');
    expect(JSON.stringify(promptBody)).toContain('image-to-3D');
    expect(JSON.stringify(promptBody)).toContain('Make a small walnut desk with rounded corners.');

    expect(fetchMock.mock.calls[1][0]).toBe('https://api.openai.com/v1/images/generations');
    const imageBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(imageBody.prompt).toContain('small walnut desk');

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://modal.example/start',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': 'modal-key',
          'Modal-Secret': 'modal-secret',
        },
        body: JSON.stringify({
          image_base64: 'text-image-base64',
          seed: 42,
          pipeline_type: '512',
          decimation_target: 100000,
          texture_size: 1024,
        }),
      }),
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/text-20260628120000-3b9f3d84.json',
      expect.stringContaining('"pipeline":"text"'),
      { httpMetadata: { contentType: 'application/json' } },
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/text-20260628120000-3b9f3d84.json',
      expect.stringContaining('"source_transcript":"Make a small walnut desk with rounded corners."'),
      { httpMetadata: { contentType: 'application/json' } },
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/text-20260628120000-3b9f3d84.json',
      expect.stringContaining('"modal_call_id":"text-modal-123"'),
      { httpMetadata: { contentType: 'application/json' } },
    );
  });

  it('queues approved speech as a background job, then updates stages and starts a TRELLIS job', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: 'Generate a red modern chair with curved wooden legs.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              object: 'red modern chair',
              prompt:
                'Single centered red modern chair with curved wooden legs, full object visible, clean silhouette, white background, studio lighting, no text, optimized for image-to-3D reconstruction.',
            }),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: 'speech-image-base64' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ call_id: 'speech-modal-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const env = createEnv();
    const deps = { fetch: fetchMock, now: () => new Date('2026-06-28T12:00:00Z') };
    const token = await createAdminToken(env, deps);
    const waitUntilPromises: Promise<unknown>[] = [];

    const response = await handleGenerateModelRequest(
      withAuth(speechGenerationRequest({
        audio_base64: 'YXVkaW8=',
        audio_mime_type: 'audio/webm',
      }), token),
      env,
      deps,
      {
        waitUntil: (promise) => {
          waitUntilPromises.push(promise);
        },
      },
    );

    expect(response.status).toBe(202);
    const queuedJob = (await response.json()) as {
      job_id: string;
      label: string;
      status: string;
      stage: string;
      status_url: string;
    };
    expect(queuedJob).toEqual({
      job_id: 'speech-20260628120000-8bc60b68',
      label: 'Speech object - 2026-06-28 12:00:00 UTC',
      status: 'running',
      stage: 'detecting_speech',
      status_url: 'https://worker.example/generate-3d/jobs/speech-20260628120000-8bc60b68',
    });
    expect(waitUntilPromises).toHaveLength(1);

    await waitUntilPromises[0];

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions');
    const transcriptionInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(transcriptionInit).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer openai-key' },
    });
    const transcriptionForm = transcriptionInit.body as FormData;
    expect(transcriptionForm.get('model')).toBe('gpt-4o-transcribe');
    expect(String(transcriptionForm.get('prompt'))).toContain('3D model');
    expect(transcriptionForm.get('file')).toBeInstanceOf(Blob);

    expect(fetchMock.mock.calls[1][0]).toBe('https://api.openai.com/v1/responses');
    const promptBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(promptBody.model).toBe('gpt-5.5');
    expect(JSON.stringify(promptBody)).toContain('image-to-3D');
    expect(JSON.stringify(promptBody)).toContain('Generate a red modern chair');

    expect(fetchMock.mock.calls[2][0]).toBe('https://api.openai.com/v1/images/generations');
    const imageBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(imageBody).toMatchObject({
      model: 'gpt-image-2',
      prompt:
        'Single centered red modern chair with curved wooden legs, full object visible, clean silhouette, white background, studio lighting, no text, optimized for image-to-3D reconstruction.',
      n: 1,
      size: '1024x1024',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://modal.example/start',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': 'modal-key',
          'Modal-Secret': 'modal-secret',
        },
        body: JSON.stringify({
          image_base64: 'speech-image-base64',
          seed: 42,
          pipeline_type: '512',
          decimation_target: 100000,
          texture_size: 1024,
        }),
      }),
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/speech-20260628120000-8bc60b68.json',
      expect.stringContaining('"pipeline":"speech"'),
      { httpMetadata: { contentType: 'application/json' } },
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/speech-20260628120000-8bc60b68.json',
      expect.stringContaining('"source_transcript":"Generate a red modern chair with curved wooden legs."'),
      { httpMetadata: { contentType: 'application/json' } },
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/speech-20260628120000-8bc60b68.json',
      expect.stringContaining('"modal_call_id":"speech-modal-123"'),
      { httpMetadata: { contentType: 'application/json' } },
    );
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(
      'models/generated/jobs/speech-20260628120000-8bc60b68.json',
      expect.stringContaining('"stage":"generating_3d"'),
      { httpMetadata: { contentType: 'application/json' } },
    );

    const glbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer;
    const pollFetch = vi.fn().mockResolvedValue(new Response(glbBytes, { status: 200 }));
    const completedResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/jobs/speech-20260628120000-8bc60b68'), token),
      env,
      { fetch: pollFetch, now: () => new Date('2026-06-28T12:02:00Z') },
    );

    expect(pollFetch.mock.calls[0][0]).toBe('https://modal.example/result?call_id=speech-modal-123');
    expect(completedResponse.status).toBe(200);
    expect(await completedResponse.json()).toMatchObject({
      id: 'speech-20260628120000-8bc60b68',
      status: 'completed',
      stage: 'completed',
      model_url:
        'https://web-ar-model-assets.pages.dev/models/generated/capture-20260628-120000-speech-20260628120000-8bc60b68.glb',
      source_transcript: 'Generate a red modern chair with curved wooden legs.',
    });
  });

  it('polls a running Modal job', async () => {
    const env = createEnv();
    const deps = {
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'running' }), { status: 202 })),
      now: () => new Date('2026-06-28T12:00:00Z'),
    };
    const token = await createAdminToken(env, deps);
    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/jobs/fc-123'), token),
      env,
      deps,
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      id: 'fc-123',
      status: 'running',
      pipeline: 'trellis',
    });
  });

  it('stores completed Modal job GLB bytes and returns the public URL', async () => {
    const glbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer;
    const env = createEnv();
    const deps = {
      fetch: vi.fn().mockResolvedValue(
        new Response(glbBytes, {
          status: 200,
          headers: { 'Content-Type': 'model/gltf-binary' },
        }),
      ),
      now: () => new Date('2026-06-28T12:00:00Z'),
    };
    const token = await createAdminToken(env, deps);
    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/jobs/fc-123'), token),
      env,
      deps,
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
        put: vi.fn((key: string, value: ArrayBuffer | ReadableStream | string) => {
          if (typeof value === 'string') {
            storedObjects.set(key, value);
          }
          return Promise.resolve(undefined);
        }),
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer, {
        status: 200,
        headers: { 'Content-Type': 'model/gltf-binary' },
      }),
    );

    const deps = { fetch: fetchMock, now: () => new Date('2026-06-28T12:05:00Z') };
    const token = await createAdminToken(env, deps);
    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/jobs/openai-123'), token),
      env,
      deps,
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

  it('stores uploaded GLB bytes and indexes them permanently', async () => {
    const storedObjects = new Map<string, string | ArrayBuffer>();
    storedObjects.set('models/generated/index.json', JSON.stringify({ models: [] }));
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn((key: string) => {
          const value = storedObjects.get(key);
          return Promise.resolve(
            value
              ? {
                  body: value,
                  httpMetadata: {
                    contentType: typeof value === 'string' ? 'application/json' : 'model/gltf-binary',
                  },
                }
              : null,
          );
        }),
        put: vi.fn((key: string, value: ArrayBuffer | ReadableStream | string) => {
          if (typeof value === 'string' || value instanceof ArrayBuffer) {
            storedObjects.set(key, value);
          }
          return Promise.resolve(undefined);
        }),
      },
    });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') };
    const token = await createAdminToken(env, deps);

    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/models/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: 'Living Room Chair.glb',
          label: '  Living Room Chair  ',
          model_mime_type: 'model/gltf-binary',
          model_base64: 'Z2xURg==',
        }),
      }), token),
      env,
      deps,
    );

    const objectKey = 'models/generated/uploads/upload-20260704-120000-living-room-chair.glb';
    expect(response.status).toBe(201);
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(objectKey, expect.any(ArrayBuffer), {
      httpMetadata: { contentType: 'model/gltf-binary' },
    });
    expect(await response.json()).toEqual({
      id: 'upload-20260704-120000-living-room-chair',
      label: 'Living Room Chair',
      model_url: `https://web-ar-model-assets.pages.dev/${objectKey}`,
      object_key: objectKey,
      completed_at: '2026-07-04T12:00:00.000Z',
      bytes: 4,
      owner_email: 'sshibinthomass@gmail.com',
      visibility: 'private',
      source: 'uploaded',
    });
    expect(JSON.parse(storedObjects.get('models/generated/index.json') as string)).toEqual({
      models: [
        {
          id: 'upload-20260704-120000-living-room-chair',
          label: 'Living Room Chair',
          model_url: `https://web-ar-model-assets.pages.dev/${objectKey}`,
          object_key: objectKey,
          completed_at: '2026-07-04T12:00:00.000Z',
          bytes: 4,
          owner_email: 'sshibinthomass@gmail.com',
          visibility: 'private',
          source: 'uploaded',
        },
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
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:30:00Z') };
    const token = await createAdminToken(env, deps);

    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/models/fc-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: '  Living room chair  ' }),
      }), token),
      env,
      deps,
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

  it('updates a generated model thumbnail in the model index and job metadata', async () => {
    const storedObjects = new Map<string, string | ArrayBuffer>();
    storedObjects.set(
      'models/generated/index.json',
      JSON.stringify({
        models: [
          {
            id: 'fc-123',
            label: 'Living room chair',
            model_url: 'https://assets.example/generated-chair.glb',
            object_key: 'models/generated/generated-chair.glb',
            preview_url: 'https://assets.example/previews/old-chair.png',
            preview_object_key: 'models/generated/previews/old-chair.png',
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
        label: 'Living room chair',
        status: 'completed',
        preview_url: 'https://assets.example/previews/old-chair.png',
        preview_object_key: 'models/generated/previews/old-chair.png',
        completed_at: '2026-07-04T12:00:00.000Z',
        updated_at: '2026-07-04T12:00:00.000Z',
      }),
    );
    const deleteMock = vi.fn((key: string) => {
      storedObjects.delete(key);
      return Promise.resolve(undefined);
    });
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn((key: string) => {
          const value = storedObjects.get(key);
          return Promise.resolve(
            value
              ? {
                  body: value,
                  httpMetadata: {
                    contentType: typeof value === 'string' ? 'application/json' : 'image/webp',
                  },
                }
              : null,
          );
        }),
        put: vi.fn((key: string, value: ArrayBuffer | ReadableStream | string) => {
          if (typeof value === 'string' || value instanceof ArrayBuffer) {
            storedObjects.set(key, value);
          }
          return Promise.resolve(undefined);
        }),
        delete: deleteMock,
      },
    });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:30:00Z') };
    const token = await createAdminToken(env, deps);

    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/models/fc-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview_base64: 'dGh1bWI=',
          preview_mime_type: 'image/webp',
        }),
      }), token),
      env,
      deps,
    );

    const thumbnailKey = 'models/generated/previews/thumbnail-20260704-123000-fc-123.webp';
    const thumbnailUrl = `https://web-ar-model-assets.pages.dev/${thumbnailKey}`;
    expect(response.status).toBe(200);
    expect(env.MODEL_BUCKET.put).toHaveBeenCalledWith(thumbnailKey, expect.any(ArrayBuffer), {
      httpMetadata: { contentType: 'image/webp' },
    });
    expect(await response.json()).toMatchObject({
      id: 'fc-123',
      preview_url: thumbnailUrl,
      preview_object_key: thumbnailKey,
    });
    expect(JSON.parse(storedObjects.get('models/generated/index.json') as string)).toEqual({
      models: [
        expect.objectContaining({
          id: 'fc-123',
          preview_url: thumbnailUrl,
          preview_object_key: thumbnailKey,
        }),
      ],
    });
    expect(JSON.parse(storedObjects.get('models/generated/jobs/fc-123.json') as string)).toMatchObject({
      preview_url: thumbnailUrl,
      preview_object_key: thumbnailKey,
      updated_at: '2026-07-04T12:30:00.000Z',
    });
    expect(deleteMock).toHaveBeenCalledWith('models/generated/previews/old-chair.png');
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
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:30:00Z') };
    const token = await createAdminToken(env, deps);

    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/models/fc-123', {
        method: 'DELETE',
      }), token),
      env,
      deps,
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

  it('scheduled polling resumes a speech job that was interrupted while generating the image', async () => {
    const { bucket, objects } = createMemoryBucket({
      'models/generated/jobs/index.json': JSON.stringify({ pending: ['speech-stuck'] }),
      'models/generated/jobs/speech-stuck.json': JSON.stringify({
        id: 'speech-stuck',
        label: 'sofa with two pillows - 2026-07-06 23:17:47 UTC',
        status: 'running',
        stage: 'generating_image',
        created_at: '2026-07-06T23:17:37.409Z',
        updated_at: '2026-07-06T23:20:04.635Z',
        pipeline: 'speech',
        owner_email: 'sshibinthomass@gmail.com',
        visibility: 'private',
        source_transcript: 'A sofa with two pillows.',
        target_object: 'sofa with two pillows',
        generation_prompt:
          'A centered sofa with two pillows, full object visible, clean silhouette, plain background, optimized for image-to-3D reconstruction.',
      }),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: 'resumed-speech-image' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ call_id: 'speech-modal-resumed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const processed = await handleScheduledPendingJobs(createEnv({ MODEL_BUCKET: bucket }), {
      fetch: fetchMock,
      now: () => new Date('2026-07-06T23:25:00Z'),
    });

    expect(processed).toEqual({ completed: 0, failed: 0, stillRunning: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/images/generations');
    expect(fetchMock.mock.calls[1][0]).toBe('https://modal.example/start');
    expect(JSON.parse(objects.get('models/generated/jobs/speech-stuck.json') as string)).toMatchObject({
      id: 'speech-stuck',
      status: 'running',
      stage: 'generating_3d',
      modal_call_id: 'speech-modal-resumed',
    });
    expect(JSON.parse(objects.get('models/generated/jobs/index.json') as string)).toEqual({
      pending: ['speech-stuck'],
    });
  });

  it('scheduled polling resumes a speech job from stored audio when speech detection was interrupted', async () => {
    const audioObjectKey = 'models/generated/speech-audio/speech-detecting.wav';
    const { bucket, objects } = createMemoryBucket({
      'models/generated/jobs/index.json': JSON.stringify({ pending: ['speech-detecting'] }),
      'models/generated/jobs/speech-detecting.json': JSON.stringify({
        id: 'speech-detecting',
        label: 'Speech object - 2026-07-06 23:17:37 UTC',
        status: 'running',
        stage: 'detecting_speech',
        created_at: '2026-07-06T23:17:37.409Z',
        updated_at: '2026-07-06T23:17:37.409Z',
        pipeline: 'speech',
        owner_email: 'sshibinthomass@gmail.com',
        visibility: 'private',
        audio_object_key: audioObjectKey,
        audio_mime_type: 'audio/wav',
      }),
      [audioObjectKey]: new TextEncoder().encode('wav-bytes').buffer,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: 'A small round coffee table.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      object: 'small round coffee table',
                      prompt:
                        'A small round coffee table, full object visible, clean silhouette, plain background, optimized for image-to-3D reconstruction.',
                    }),
                  },
                ],
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ b64_json: 'coffee-table-image' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ call_id: 'speech-modal-detecting' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const processed = await handleScheduledPendingJobs(createEnv({ MODEL_BUCKET: bucket }), {
      fetch: fetchMock,
      now: () => new Date('2026-07-06T23:25:00Z'),
    });

    expect(processed).toEqual({ completed: 0, failed: 0, stillRunning: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(fetchMock.mock.calls[3][0]).toBe('https://modal.example/start');
    expect(JSON.parse(objects.get('models/generated/jobs/speech-detecting.json') as string)).toMatchObject({
      id: 'speech-detecting',
      status: 'running',
      stage: 'generating_3d',
      source_transcript: 'A small round coffee table.',
      modal_call_id: 'speech-modal-detecting',
    });
    expect(objects.has(audioObjectKey)).toBe(false);
  });

  it('queues speech jobs immediately so cron can resume the background pipeline', async () => {
    const { bucket, objects } = createMemoryBucket({
      'models/generated/jobs/index.json': JSON.stringify({ pending: [] }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-06-28T12:00:00Z') };
    const token = await createAdminToken(env, deps);

    const response = await handleGenerateModelRequest(
      withAuth(speechGenerationRequest({
        audio_base64: 'UklGRg==',
        audio_mime_type: 'audio/wav',
      }), token),
      env,
      deps,
      { waitUntil: vi.fn() } as unknown as Parameters<typeof handleGenerateModelRequest>[3],
    );

    expect(response.status).toBe(202);
    const body = (await response.json()) as { job_id: string };
    expect(JSON.parse(objects.get('models/generated/jobs/index.json') as string)).toEqual({
      pending: [body.job_id],
    });
    expect(objects.has(`models/generated/speech-audio/${body.job_id}.wav`)).toBe(true);
  });

  it('returns a gateway error when Modal fails', async () => {
    const env = createEnv();
    const deps = {
      fetch: vi.fn().mockResolvedValueOnce(new Response('Modal exploded', { status: 500 })),
      now: () => new Date('2026-06-28T12:00:00Z'),
    };
    const token = await createAdminToken(env, deps);
    const response = await handleGenerateModelRequest(
      withAuth(jsonRequest({
        image_base64: 'abc123',
        image_mime_type: 'image/jpeg',
      }), token),
      env,
      deps,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Modal job start failed: Modal exploded' });
  });

  it('filters model listing by public visibility, owner, and admin access', async () => {
    const { bucket } = createMemoryBucket({
      'models/generated/index.json': JSON.stringify({
        models: [
          {
            id: 'public-chair',
            label: 'Public chair',
            model_url: 'https://assets.example/public-chair.glb',
            object_key: 'models/generated/public-chair.glb',
            completed_at: '2026-07-04T12:00:00.000Z',
            bytes: 4,
            owner_email: 'maker@example.com',
            visibility: 'public',
          },
          {
            id: 'private-chair',
            label: 'Private chair',
            model_url: 'https://assets.example/private-chair.glb',
            object_key: 'models/generated/private-chair.glb',
            completed_at: '2026-07-04T12:01:00.000Z',
            bytes: 4,
            owner_email: 'maker@example.com',
            visibility: 'private',
          },
          {
            id: 'other-private-table',
            label: 'Other private table',
            model_url: 'https://assets.example/other-private-table.glb',
            object_key: 'models/generated/other-private-table.glb',
            completed_at: '2026-07-04T12:02:00.000Z',
            bytes: 4,
            owner_email: 'other@example.com',
            visibility: 'private',
          },
        ],
      }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const guestResponse = await handleGenerateModelRequest(new Request('https://worker.example/generate-3d/models'), env, deps);
    const ownerResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/models'), ownerToken),
      env,
      deps,
    );
    const adminResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/models'), adminToken),
      env,
      deps,
    );

    expect(((await guestResponse.json()) as { models: Array<{ id: string }> }).models.map((model) => model.id)).toEqual([
      'public-chair',
    ]);
    expect(((await ownerResponse.json()) as { models: Array<{ id: string }> }).models.map((model) => model.id)).toEqual([
      'private-chair',
      'public-chair',
    ]);
    expect(((await adminResponse.json()) as { models: Array<{ id: string }> }).models.map((model) => model.id)).toEqual([
      'other-private-table',
      'private-chair',
      'public-chair',
    ]);
  });

  it('allows only owners or admins to update generated model metadata', async () => {
    const { bucket } = createMemoryBucket({
      'models/generated/index.json': JSON.stringify({
        models: [
          {
            id: 'private-chair',
            label: 'Private chair',
            model_url: 'https://assets.example/private-chair.glb',
            object_key: 'models/generated/private-chair.glb',
            completed_at: '2026-07-04T12:01:00.000Z',
            bytes: 4,
            owner_email: 'maker@example.com',
            visibility: 'private',
          },
        ],
      }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    const otherToken = await createApprovedUserToken(env, deps, adminToken, 'other@example.com');

    const otherResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/models/private-chair', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Nope' }),
      }), otherToken),
      env,
      deps,
    );
    const ownerResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/models/private-chair', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'public' }),
      }), ownerToken),
      env,
      deps,
    );
    const adminResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/models/private-chair', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Admin renamed chair' }),
      }), adminToken),
      env,
      deps,
    );

    expect(otherResponse.status).toBe(403);
    expect(await otherResponse.json()).toEqual({ error: 'Only the owner or an admin can manage this model.' });
    expect(ownerResponse.status).toBe(200);
    expect(await ownerResponse.json()).toMatchObject({ id: 'private-chair', visibility: 'public' });
    expect(adminResponse.status).toBe(200);
    expect(await adminResponse.json()).toMatchObject({ id: 'private-chair', label: 'Admin renamed chair' });
  });

  it('stores owner and private visibility metadata when starting jobs and uploading GLBs', async () => {
    const { bucket, objects } = createMemoryBucket({
      'models/generated/index.json': JSON.stringify({ models: [] }),
      'models/generated/jobs/index.json': JSON.stringify({ pending: [] }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ call_id: 'fc-owned' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
      now: () => new Date('2026-07-04T12:00:00Z'),
    };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const jobResponse = await handleGenerateModelRequest(
      withAuth(jsonRequest({ image_base64: 'aW1hZ2U=', image_mime_type: 'image/png' }), ownerToken),
      env,
      deps,
    );
    const uploadResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/models/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: 'chair.glb', model_base64: 'Z2xURg==' }),
      }), ownerToken),
      env,
      deps,
    );

    expect(jobResponse.status).toBe(202);
    expect(JSON.parse(objects.get('models/generated/jobs/fc-owned.json') as string)).toMatchObject({
      owner_email: 'maker@example.com',
      visibility: 'private',
    });
    expect(uploadResponse.status).toBe(201);
    expect(await uploadResponse.json()).toMatchObject({
      owner_email: 'maker@example.com',
      visibility: 'private',
    });
  });

  it('exposes an admin job dashboard, retry, and failed-preview cleanup', async () => {
    const { bucket, objects } = createMemoryBucket({
      'models/generated/jobs/history.json': JSON.stringify({ jobs: ['failed-job'] }),
      'models/generated/jobs/index.json': JSON.stringify({ pending: [] }),
      'models/generated/jobs/failed-job.json': JSON.stringify({
        id: 'failed-job',
        label: 'Failed chair',
        status: 'failed',
        error: 'Modal exploded',
        created_at: '2026-07-04T12:00:00.000Z',
        updated_at: '2026-07-04T12:05:00.000Z',
        failed_at: '2026-07-04T12:05:00.000Z',
        owner_email: 'maker@example.com',
        preview_url: 'https://assets.example/preview.png',
        preview_object_key: 'models/generated/previews/failed-job.png',
      }),
      'models/generated/previews/failed-job.png': new Uint8Array([1, 2, 3]).buffer,
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:10:00Z') };
    const adminToken = await createAdminToken(env, deps);

    const listResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/jobs'), adminToken),
      env,
      deps,
    );
    const retryResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/jobs/failed-job/retry', { method: 'POST' }), adminToken),
      env,
      deps,
    );
    const cleanupResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/jobs/cleanup', { method: 'POST' }), adminToken),
      env,
      deps,
    );

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      jobs: [
        expect.objectContaining({
          id: 'failed-job',
          status: 'failed',
          error: 'Modal exploded',
          owner_email: 'maker@example.com',
        }),
      ],
    });
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.json()).toMatchObject({ id: 'failed-job', status: 'running' });
    expect(JSON.parse(objects.get('models/generated/jobs/index.json') as string)).toEqual({ pending: ['failed-job'] });
    expect(cleanupResponse.status).toBe(200);
    expect(await cleanupResponse.json()).toEqual({ cleaned: 1 });
    expect(objects.has('models/generated/previews/failed-job.png')).toBe(false);
  });

  it('does not expose saved AR layout persistence routes', async () => {
    const { bucket } = createMemoryBucket();
    const env = createEnv({ MODEL_BUCKET: bucket });
    const now = new Date('2026-07-05T09:15:00Z');
    const deps = { fetch: vi.fn(), now: () => now };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const listResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/layouts'), ownerToken),
      env,
      deps,
    );
    const createResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Living room', objects: [] }),
      }), ownerToken),
      env,
      deps,
    );

    expect(listResponse.status).toBe(405);
    expect(await listResponse.json()).toEqual({ error: 'Only POST requests are supported.' });
    expect(createResponse.status).toBe(404);
    expect(await createResponse.json()).toEqual({ error: 'Not found.' });
  });

  it('revokes a session token after logout', async () => {
    const env = createEnv();
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') };
    const token = await createAdminToken(env, deps);

    const logoutResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/logout', { method: 'POST' }), token),
      env,
      deps,
    );
    const sessionResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/session'), token),
      env,
      deps,
    );

    expect(logoutResponse.status).toBe(200);
    expect(await logoutResponse.json()).toEqual({ ok: true });
    expect(sessionResponse.status).toBe(401);
  });

  it('rate-limits repeated invalid login attempts', async () => {
    const env = createEnv();
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') };

    let response = new Response(null);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      response = await handleGenerateModelRequest(
        new Request('https://worker.example/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'missing@example.com', password: 'bad-password' }),
        }),
        env,
        deps,
      );
    }

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Too many login attempts. Try again later.' });
  });

  it('uses the configured allowed CORS origin instead of a wildcard', async () => {
    const env = createEnv({ ALLOWED_ORIGINS: 'https://sshibinthomass.github.io,http://127.0.0.1:5173' });
    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/models', {
        headers: { Origin: 'https://sshibinthomass.github.io' },
      }),
      env,
      { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') },
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://sshibinthomass.github.io');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('allows the local 5182 Vite origin by default for local visual checks', async () => {
    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/models', {
        headers: { Origin: 'http://127.0.0.1:5182' },
      }),
      createEnv(),
      { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') },
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:5182');
    expect(response.headers.get('Vary')).toBe('Origin');
  });
});
