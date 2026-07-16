import { describe, expect, it, vi } from 'vitest';
import worker, {
  handleGenerateModelRequest,
  handleScheduledPendingJobs,
  MutationCoordinator,
  type DurableObjectNamespace,
  type WorkerEnv,
} from '../../worker/src/index';

function createEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    AUTH_SECRET: 'unit-test-auth-secret',
    ADMIN_EMAIL: 'sshibinthomass@gmail.com',
    MODAL_KEY: 'modal-key',
    MODAL_SECRET: 'modal-secret',
    MODAL_IMAGE_TO_3D_URL: 'https://modal.example/generate',
    MODAL_IMAGE_TO_3D_START_URL: 'https://modal.example/start',
    MODAL_IMAGE_TO_3D_RESULT_URL: 'https://modal.example/result',
    MODAL_OPENAI_TO_3D_URL: 'https://modal.example/openai-generate',
    MODAL_OPENAI_TO_3D_START_URL: 'https://modal.example/openai-start',
    MODAL_OPENAI_TO_3D_RESULT_URL: 'https://modal.example/openai-result',
    MODAL_OBJECT_PREPROCESS_QUALITY_URL: 'https://modal.example/quality-preprocess',
    OPENAI_API_KEY: 'openai-key',
    PUBLIC_MODEL_ORIGIN: 'https://web-ar-model-assets.pages.dev',
    MODEL_BUCKET: createMemoryBucket().bucket,
    MUTATION_COORDINATOR: createMemoryMutationCoordinatorNamespace(),
    ...overrides,
  };
}

function createMemoryMutationCoordinatorNamespace(): DurableObjectNamespace {
  const coordinators = new Map<string, MutationCoordinator>();
  return {
    idFromName: (name: string) => name,
    get: (id: unknown) => {
      const key = String(id);
      let coordinator = coordinators.get(key);
      if (!coordinator) {
        const values = new Map<string, unknown>();
        let queue = Promise.resolve();
        coordinator = new MutationCoordinator({
          storage: {
            get: async <T>(storageKey: string) => values.get(storageKey) as T | undefined,
            put: async (storageKey: string, value: unknown) => {
              values.set(storageKey, value);
            },
            delete: async (storageKey: string) => {
              values.delete(storageKey);
            },
          },
          blockConcurrencyWhile: <T>(operation: () => Promise<T>) => {
            const result = queue.then(operation);
            queue = result.then(() => undefined, () => undefined);
            return result;
          },
        });
        coordinators.set(key, coordinator);
      }
      return coordinator;
    },
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

async function setUserPlan(
  env: WorkerEnv,
  deps: { fetch: typeof fetch; now: () => Date },
  adminToken: string,
  email: string,
  plan: 'starter' | 'creator' | 'studio',
): Promise<void> {
  const response = await handleGenerateModelRequest(
    withAuth(new Request(`https://worker.example/auth/users/${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    }), adminToken),
    env,
    deps,
  );
  if (!response.ok) {
    throw new Error(`Could not assign ${plan} to ${email}.`);
  }
}

describe('handleGenerateModelRequest', () => {
  it('fails closed when the auth mutation coordinator binding is missing', async () => {
    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'maker@example.com',
          password: 'maker-password-123',
          name: 'Maker',
        }),
      }),
      createEnv({ MUTATION_COORDINATOR: undefined }),
      { fetch: vi.fn(), now: () => new Date('2026-07-16T12:00:00Z') },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Secure mutation coordination is unavailable.',
    });
  });

  it('does not trust an admin role stored on a non-configured account', async () => {
    const { bucket, objects } = createMemoryBucket();
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-16T12:00:00Z') };
    await createAdminToken(env, deps);
    await handleGenerateModelRequest(
      new Request('https://worker.example/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'impostor@example.com',
          password: 'impostor-password-123',
          name: 'Impostor',
        }),
      }),
      env,
      deps,
    );
    const usersIndex = JSON.parse(objects.get('auth/users/index.json') as string) as {
      users: Array<{ email: string; role: string; status: string }>;
    };
    const impostor = usersIndex.users.find((user) => user.email === 'impostor@example.com');
    if (!impostor) {
      throw new Error('Test account was not stored.');
    }
    impostor.role = 'admin';
    impostor.status = 'active';
    objects.set('auth/users/index.json', JSON.stringify(usersIndex));

    const loginResponse = await handleGenerateModelRequest(
      new Request('https://worker.example/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'impostor@example.com',
          password: 'impostor-password-123',
        }),
      }),
      env,
      deps,
    );
    const loginBody = await loginResponse.json() as { token?: string };
    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/users'), loginBody.token ?? ''),
      env,
      deps,
    );

    expect(loginResponse.status).toBe(200);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Admin access required.' });
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
      user: expect.objectContaining({
        email: 'sshibinthomass@gmail.com',
        name: 'Shibin',
        role: 'admin',
        status: 'active',
        plan: 'admin',
        account_access: expect.objectContaining({ state: 'operational', locked: false }),
      }),
    });
  });

  it('returns Starter access, usage, and calculated account state for an approved user session', async () => {
    const { bucket } = createMemoryBucket();
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-16T12:00:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const userToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/session'), userToken),
      env,
      deps,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: expect.objectContaining({
        email: 'maker@example.com',
        role: 'user',
        status: 'active',
        plan: 'starter',
        effective_entitlements: expect.objectContaining({
          plan: 'starter',
          max_targets: 3,
          max_objects_per_target: 1,
          features: expect.objectContaining({
            scan: true,
            groups: false,
            animations: false,
          }),
        }),
        usage: expect.objectContaining({
          targets: 0,
          objects: 0,
          model_objects: 0,
          text_objects: 0,
          groups: 0,
        }),
        account_access: {
          state: 'operational',
          locked: false,
          target_count: 0,
          max_targets: 3,
          excess_targets: 0,
        },
      }),
    });
  });

  it('lets the configured admin assign plans and independent overrides with detailed usage', async () => {
    const { bucket } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({
        targets: [
          {
            id: 'maker-target',
            label: 'Maker target',
            image_url: 'https://worker.example/image-targets/images/maker-target.jpg',
            image_object_key: 'image-targets/images/maker-target.jpg',
            objects: [
              {
                id: 'model-one',
                kind: 'model',
                model: { id: 'chair', label: 'Chair', url: 'https://worker.example/chair.glb' },
                placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
              },
              {
                id: 'text-one',
                kind: 'text',
                text: { value: 'Hello', language: 'english', font: 'studio-sans' },
                placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
              },
            ],
            groups: [],
            owner_email: 'maker@example.com',
            scan_id: 'maker-scan',
            access_mode: 'anyone_with_link',
            allowed_emails: [],
            created_at: '2026-07-15T10:00:00.000Z',
            updated_at: '2026-07-15T10:00:00.000Z',
          },
        ],
      }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-16T12:00:00Z') };
    const adminToken = await createAdminToken(env, deps);
    await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const updateResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/users/maker%40example.com', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'active',
          plan: 'creator',
          entitlement_overrides: {
            features: {
              floor_placement: false,
              groups: false,
            },
            maxTargets: 7,
            maxObjectsPerTarget: 4,
          },
          role: 'admin',
          usage: { targets: 0 },
          account_access: { state: 'operational', locked: false },
        }),
      }), adminToken),
      env,
      deps,
    );
    const listResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/users'), adminToken),
      env,
      deps,
    );

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({
      user: expect.objectContaining({
        email: 'maker@example.com',
        role: 'user',
        status: 'active',
        plan: 'creator',
        entitlement_overrides: {
          features: {
            floor_placement: false,
            groups: false,
          },
          maxTargets: 7,
          maxObjectsPerTarget: 4,
        },
        effective_entitlements: expect.objectContaining({
          plan: 'creator',
          max_targets: 7,
          max_objects_per_target: 4,
          features: expect.objectContaining({
            floor_placement: false,
            groups: false,
            animations: true,
          }),
        }),
        usage: expect.objectContaining({
          targets: 1,
          objects: 2,
          model_objects: 1,
          text_objects: 1,
          groups: 0,
          links: expect.objectContaining({
            anyone_with_link: 1,
          }),
        }),
      }),
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json() as { users: Array<Record<string, unknown>> };
    expect(listBody.users.find((user) => user.email === 'maker@example.com')).toEqual(expect.objectContaining({
      role: 'user',
      plan: 'creator',
      created_at: '2026-07-16T12:00:00.000Z',
      updated_at: '2026-07-16T12:00:00.000Z',
      last_activity_at: '2026-07-16T12:00:00.000Z',
    }));
  });

  it('supports disabled accounts and protects the configured administrator record', async () => {
    const { bucket } = createMemoryBucket();
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-16T12:00:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const userToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const disableResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/users/maker%40example.com', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'disabled' }),
      }), adminToken),
      env,
      deps,
    );
    const disabledSession = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/session'), userToken),
      env,
      deps,
    );
    const selfChange = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/users/sshibinthomass%40gmail.com', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'disabled', plan: 'starter' }),
      }), adminToken),
      env,
      deps,
    );

    expect(disableResponse.status).toBe(200);
    expect(await disableResponse.json()).toEqual({
      user: expect.objectContaining({
        email: 'maker@example.com',
        status: 'disabled',
        account_access: expect.objectContaining({ state: 'disabled', locked: true }),
      }),
    });
    expect(disabledSession.status).toBe(403);
    expect(await disabledSession.json()).toEqual({ error: 'Account disabled by admin.' });
    expect(selfChange.status).toBe(400);
    expect(await selfChange.json()).toEqual({
      error: 'The configured administrator account cannot be disabled or assigned a user plan.',
    });
  });

  it('pauses scan URLs when their owner account is deleted while preserving admin inspection', async () => {
    const targetId = 'deleted-owner-target';
    const { bucket } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({
        targets: [{
          id: targetId,
          label: 'Deleted owner target',
          image_url: `https://worker.example/image-targets/images/${targetId}.jpg`,
          image_object_key: `image-targets/images/${targetId}.jpg`,
          objects: [{
            kind: 'model',
            id: 'model-1',
            model: { id: 'chair', label: 'Chair', url: 'https://worker.example/chair.glb' },
            placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
          }],
          groups: [],
          owner_email: 'maker@example.com',
          scan_id: 'deleted-owner-scan',
          access_mode: 'anyone_with_link',
          allowed_emails: [],
          created_at: '2026-07-15T12:00:00.000Z',
          updated_at: '2026-07-15T12:00:00.000Z',
        }],
      }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-16T12:00:00Z') };
    const adminToken = await createAdminToken(env, deps);
    await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const deleteAccount = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/users/maker%40example.com', {
        method: 'DELETE',
      }), adminToken),
      env,
      deps,
    );
    const guestScan = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/image-targets/scan/deleted-owner-scan'),
      env,
      deps,
    );
    const adminScan = await handleGenerateModelRequest(
      withAuth(
        new Request('https://worker.example/generate-3d/image-targets/scan/deleted-owner-scan'),
        adminToken,
      ),
      env,
      deps,
    );

    expect(deleteAccount.status).toBe(200);
    expect(guestScan.status).toBe(423);
    await expect(guestScan.json()).resolves.toMatchObject({
      code: 'owner_account_missing',
    });
    expect(guestScan.headers.get('Cache-Control')).toBe('no-store');
    expect(adminScan.status).toBe(200);
  });

  it('records administrator changes and exposes audit events only to the configured admin', async () => {
    const { bucket } = createMemoryBucket();
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-16T12:00:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const userToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/users/maker%40example.com', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'studio' }),
      }), adminToken),
      env,
      deps,
    );
    const adminAudit = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/audit'), adminToken),
      env,
      deps,
    );
    const userAudit = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/audit'), userToken),
      env,
      deps,
    );

    expect(adminAudit.status).toBe(200);
    expect(await adminAudit.json()).toEqual({
      events: expect.arrayContaining([
        expect.objectContaining({
          actor: 'sshibinthomass@gmail.com',
          action: 'admin.user.update',
          target: 'maker@example.com',
          status: 'ok',
          metadata: expect.objectContaining({ plan: 'studio' }),
        }),
      ]),
    });
    expect(userAudit.status).toBe(403);
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

  it('creates a private image target for an approved user and stores the uploaded image', async () => {
    const { bucket, objects } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({ targets: [] }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket, PUBLIC_MODEL_ORIGIN: '' });
    const deps = {
      fetch: vi.fn(),
      now: () => new Date('2026-07-05T18:00:00Z'),
      randomUUID: () => '11111111-2222-4333-8444-555555555555',
    };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const response = await handleGenerateModelRequest(
      withAuth(
        new Request('https://worker.example/generate-3d/image-targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: ' Product box ',
            image_base64: 'aW1hZ2U=',
            image_mime_type: 'image/jpeg',
            model: {
              id: 'generated-fc-123',
              label: 'Chair',
              url: 'https://worker.example/models/generated/chair.glb',
              preview_url: 'https://worker.example/models/generated/previews/chair.png',
            },
            placement: { scale: 1.2, offset_x: 0.1, offset_y: -0.2, height: 0.16 },
          }),
        }),
        ownerToken,
      ),
      env,
      deps,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      id: 'target-20260705-180000-product-box',
      label: 'Product box',
      image_url: 'https://worker.example/image-targets/images/target-20260705-180000-product-box.jpg',
      image_object_key: 'image-targets/images/target-20260705-180000-product-box.jpg',
      model: {
        id: 'generated-fc-123',
        label: 'Chair',
        url: 'https://worker.example/models/generated/chair.glb',
        preview_url: 'https://worker.example/models/generated/previews/chair.png',
      },
      placement: { scale: 1.2, offset_x: 0.1, offset_y: -0.2, height: 0.16 },
      owner_email: 'maker@example.com',
      visibility: 'private',
      scan_id: '11111111-2222-4333-8444-555555555555',
      access_mode: 'owner_only',
      allowed_emails: [],
      created_at: '2026-07-05T18:00:00.000Z',
      updated_at: '2026-07-05T18:00:00.000Z',
    });
    expect(objects.get('image-targets/images/target-20260705-180000-product-box.jpg')).toEqual(
      new Uint8Array([105, 109, 97, 103, 101]).buffer,
    );
    expect(JSON.parse(objects.get('image-targets/index.json') as string)).toEqual({
      targets: [expect.objectContaining({ id: 'target-20260705-180000-product-box' })],
    });
    expect(JSON.parse(objects.get('image-targets/records/target-20260705-180000-product-box.json') as string)).toEqual(
      expect.objectContaining({ id: 'target-20260705-180000-product-box' }),
    );
  });

  it('locks an over-quota account to listing and deletion and pauses its scan URLs until cleanup', async () => {
    const target = (index: number) => ({
      id: `maker-target-${index}`,
      label: `Maker target ${index}`,
      image_url: `https://worker.example/image-targets/images/maker-target-${index}.jpg`,
      image_object_key: `image-targets/images/maker-target-${index}.jpg`,
      model: { id: `model-${index}`, label: 'Chair', url: `https://worker.example/model-${index}.glb` },
      placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
      objects: [{
        id: `object-${index}`,
        kind: 'model',
        model: { id: `model-${index}`, label: 'Chair', url: `https://worker.example/model-${index}.glb` },
        placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
      }],
      groups: [],
      owner_email: 'maker@example.com',
      visibility: 'private',
      scan_id: `scan-${index}`,
      access_mode: 'anyone_with_link',
      allowed_emails: [],
      created_at: `2026-07-15T10:0${index}:00.000Z`,
      updated_at: `2026-07-15T10:0${index}:00.000Z`,
    });
    const targets = [1, 2, 3, 4].map(target);
    const initialObjects: Record<string, string | ArrayBuffer> = {
      'image-targets/index.json': JSON.stringify({ targets }),
    };
    for (const storedTarget of targets) {
      initialObjects[`image-targets/records/${storedTarget.id}.json`] = JSON.stringify(storedTarget);
      initialObjects[storedTarget.image_object_key] = new Uint8Array([1, 2, 3]).buffer;
    }
    const { bucket } = createMemoryBucket(initialObjects);
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = {
      fetch: vi.fn(),
      now: () => new Date('2026-07-16T12:00:00Z'),
      randomUUID: () => 'replacement-scan-id',
    };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const sessionBefore = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/session'), ownerToken),
      env,
      deps,
    );
    const listResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets'), ownerToken),
      env,
      deps,
    );
    const createResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Blocked target',
          image_base64: 'aW1hZ2U=',
          image_mime_type: 'image/jpeg',
          model: { id: 'new-model', label: 'New model', url: 'https://worker.example/new.glb' },
          placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
        }),
      }), ownerToken),
      env,
      deps,
    );
    const updateResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets/maker-target-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Blocked rename' }),
      }), ownerToken),
      env,
      deps,
    );
    const guestScanWhileLocked = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/image-targets/scan/scan-2'),
      env,
      deps,
    );
    const adminScanWhileLocked = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets/scan/scan-2'), adminToken),
      env,
      deps,
    );
    const deleteResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets/maker-target-1', {
        method: 'DELETE',
      }), ownerToken),
      env,
      deps,
    );
    const sessionAfter = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/session'), ownerToken),
      env,
      deps,
    );
    const guestScanAfterCleanup = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/image-targets/scan/scan-2'),
      env,
      deps,
    );
    const createAtLimit = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Fourth target again',
          image_base64: 'aW1hZ2U=',
          image_mime_type: 'image/jpeg',
          model: { id: 'new-model', label: 'New model', url: 'https://worker.example/new.glb' },
          placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
        }),
      }), ownerToken),
      env,
      deps,
    );

    expect(sessionBefore.status).toBe(200);
    await expect(sessionBefore.json()).resolves.toEqual({
      user: expect.objectContaining({
        account_access: expect.objectContaining({
          state: 'over_quota',
          locked: true,
          target_count: 4,
          max_targets: 3,
          excess_targets: 1,
        }),
      }),
    });
    expect(listResponse.status).toBe(200);
    expect(((await listResponse.json()) as { targets: unknown[] }).targets).toHaveLength(4);
    expect(createResponse.status).toBe(423);
    await expect(createResponse.json()).resolves.toMatchObject({ code: 'account_over_quota' });
    expect(updateResponse.status).toBe(423);
    await expect(updateResponse.json()).resolves.toMatchObject({ code: 'account_over_quota' });
    expect(guestScanWhileLocked.status).toBe(423);
    await expect(guestScanWhileLocked.json()).resolves.toMatchObject({ code: 'owner_account_locked' });
    expect(adminScanWhileLocked.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(sessionAfter.status).toBe(200);
    await expect(sessionAfter.json()).resolves.toEqual({
      user: expect.objectContaining({
        account_access: expect.objectContaining({
          state: 'operational',
          locked: false,
          target_count: 3,
          max_targets: 3,
          excess_targets: 0,
        }),
      }),
    });
    expect(guestScanAfterCleanup.status).toBe(200);
    expect(guestScanAfterCleanup.headers.get('Cache-Control')).toBe('no-store');
    expect(createAtLimit.status).toBe(403);
    await expect(createAtLimit.json()).resolves.toMatchObject({ code: 'target_quota_reached' });
  });

  it('enforces object quotas and each disabled authoring or sharing feature independently', async () => {
    const env = createEnv();
    const deps = {
      fetch: vi.fn(),
      now: () => new Date('2026-07-16T13:00:00Z'),
      randomUUID: () => 'feature-scan-id',
    };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    const modelObject = (id: string, extra: Record<string, unknown> = {}) => ({
      kind: 'model',
      id,
      model: { id: `model-${id}`, label: `Model ${id}`, url: `https://worker.example/${id}.glb` },
      placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
      ...extra,
    });
    const createTarget = (body: Record<string, unknown>) => handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Feature target',
          image_base64: 'aW1hZ2U=',
          image_mime_type: 'image/jpeg',
          ...body,
        }),
      }), ownerToken),
      env,
      deps,
    );

    const overObjectLimit = await createTarget({
      objects: ['one', 'two'].map((id) => modelObject(id)),
    });
    const grouped = await createTarget({
      groups: [{
        id: 'group-1',
        label: 'Group 1',
        placement: {},
        animation: { preset: 'none', tracks: [] },
      }],
      objects: [modelObject('grouped', {
        group_id: 'group-1',
        local_placement: {},
      })],
    });
    const animated = await createTarget({
      objects: [modelObject('animated', {
        animation: {
          preset: 'custom',
          tracks: [{ property: 'rotation_y', motion: 'spin', amount: 360, speed: 0.25, phase: 0 }],
        },
      })],
    });
    const signedInSharing = await createTarget({
      access_mode: 'any_signed_in',
      objects: [modelObject('shared')],
    });

    await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/users/maker%40example.com', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entitlement_overrides: {
            features: {
              model_objects: false,
              text_objects: false,
            },
          },
        }),
      }), adminToken),
      env,
      deps,
    );
    const modelDisabled = await createTarget({
      objects: [modelObject('disabled-model')],
    });
    const textDisabled = await createTarget({
      objects: [{
        kind: 'text',
        id: 'disabled-text',
        text: { value: 'Disabled text' },
        placement: {},
      }],
    });

    expect(overObjectLimit.status).toBe(403);
    await expect(overObjectLimit.json()).resolves.toMatchObject({
      code: 'object_quota_exceeded',
      max_objects_per_target: 1,
    });
    expect(grouped.status).toBe(403);
    await expect(grouped.json()).resolves.toMatchObject({ code: 'feature_disabled', feature: 'groups' });
    expect(animated.status).toBe(403);
    await expect(animated.json()).resolves.toMatchObject({ code: 'feature_disabled', feature: 'animations' });
    expect(signedInSharing.status).toBe(403);
    await expect(signedInSharing.json()).resolves.toMatchObject({
      code: 'feature_disabled',
      feature: 'share_signed_in',
    });
    expect(modelDisabled.status).toBe(403);
    await expect(modelDisabled.json()).resolves.toMatchObject({
      code: 'feature_disabled',
      feature: 'model_objects',
    });
    expect(textDisabled.status).toBe(403);
    await expect(textDisabled.json()).resolves.toMatchObject({
      code: 'feature_disabled',
      feature: 'text_objects',
    });
  });

  it('requires an over-limit target to reduce its object count before other edits', async () => {
    const targetId = 'over-object-limit';
    const existingObjects = ['one', 'two', 'three', 'four'].map((id) => ({
      kind: 'model',
      id,
      model: { id: `model-${id}`, label: `Model ${id}`, url: `https://worker.example/${id}.glb` },
      placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
    }));
    const { bucket } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({
        targets: [{
          id: targetId,
          label: 'Legacy large target',
          image_url: `https://worker.example/image-targets/images/${targetId}.jpg`,
          image_object_key: `image-targets/images/${targetId}.jpg`,
          objects: existingObjects,
          groups: [],
          owner_email: 'maker@example.com',
          scan_id: 'legacy-large-scan',
          access_mode: 'owner_only',
          allowed_emails: [],
          created_at: '2026-07-15T12:00:00.000Z',
          updated_at: '2026-07-15T12:00:00.000Z',
        }],
      }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-16T13:10:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    const update = (body: Record<string, unknown>) => handleGenerateModelRequest(
      withAuth(new Request(`https://worker.example/generate-3d/image-targets/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }), ownerToken),
      env,
      deps,
    );

    const blockedRename = await update({ label: 'Still too large' });
    const cleanup = await update({ objects: existingObjects.slice(0, 1) });
    const blockedIncrease = await update({ objects: existingObjects.slice(0, 2) });

    expect(blockedRename.status).toBe(403);
    await expect(blockedRename.json()).resolves.toMatchObject({
      code: 'object_quota_exceeded',
      current_objects: 4,
      requested_objects: 4,
      max_objects_per_target: 1,
    });
    expect(cleanup.status).toBe(200);
    expect(((await cleanup.json()) as { objects: unknown[] }).objects).toHaveLength(1);
    expect(blockedIncrease.status).toBe(403);
    await expect(blockedIncrease.json()).resolves.toMatchObject({
      code: 'object_quota_exceeded',
      current_objects: 1,
      requested_objects: 2,
      max_objects_per_target: 1,
    });
  });

  it('removes disabled runtime animation data and exposes floor capabilities on scan responses', async () => {
    const targetId = 'animated-target';
    const animation = {
      preset: 'custom',
      tracks: [{ property: 'rotation_y', motion: 'spin', amount: 360, speed: 0.25, phase: 0 }],
    };
    const { bucket } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({
        targets: [{
          id: targetId,
          label: 'Animated target',
          image_url: `https://worker.example/image-targets/images/${targetId}.jpg`,
          image_object_key: `image-targets/images/${targetId}.jpg`,
          objects: [{
            kind: 'model',
            id: 'model-1',
            model: { id: 'chair', label: 'Chair', url: 'https://worker.example/chair.glb' },
            placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
            group_id: 'group-1',
            local_placement: {},
            animation,
          }],
          groups: [{
            id: 'group-1',
            label: 'Group 1',
            placement: {},
            animation,
          }],
          owner_email: 'maker@example.com',
          scan_id: 'animated-scan',
          access_mode: 'anyone_with_link',
          allowed_emails: [],
          created_at: '2026-07-15T12:00:00.000Z',
          updated_at: '2026-07-15T12:00:00.000Z',
        }],
      }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-16T13:20:00Z') };
    const adminToken = await createAdminToken(env, deps);
    await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const starterScan = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/image-targets/scan/animated-scan'),
      env,
      deps,
    );
    const starterBody = await starterScan.json() as {
      runtime_capabilities: Record<string, boolean>;
      objects: Array<Record<string, unknown>>;
      groups: Array<Record<string, unknown>>;
    };

    await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/users/maker%40example.com', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'creator' }),
      }), adminToken),
      env,
      deps,
    );
    const creatorScan = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/image-targets/scan/animated-scan'),
      env,
      deps,
    );
    const creatorBody = await creatorScan.json() as {
      runtime_capabilities: Record<string, boolean>;
      objects: Array<Record<string, unknown>>;
      groups: Array<Record<string, unknown>>;
    };

    expect(starterScan.status).toBe(200);
    expect(starterBody.runtime_capabilities).toEqual({
      animations: false,
      floor_placement: false,
    });
    expect(starterBody.objects[0]).not.toHaveProperty('animation');
    expect(starterBody.groups[0]).not.toHaveProperty('animation');
    expect(creatorScan.status).toBe(200);
    expect(creatorBody.runtime_capabilities).toEqual({
      animations: true,
      floor_placement: true,
    });
    expect(creatorBody.objects[0]).toHaveProperty('animation', animation);
    expect(creatorBody.groups[0]).toHaveProperty('animation', animation);
  });

  it('allows only the configured admin to rotate a scan link and invalidates the old URL', async () => {
    const targetId = 'rotate-target';
    const { bucket, objects } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({
        targets: [{
          id: targetId,
          label: 'Rotating target',
          image_url: `https://worker.example/image-targets/images/${targetId}.jpg`,
          image_object_key: `image-targets/images/${targetId}.jpg`,
          objects: [{
            kind: 'model',
            id: 'model-1',
            model: { id: 'chair', label: 'Chair', url: 'https://worker.example/chair.glb' },
            placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
          }],
          groups: [],
          owner_email: 'maker@example.com',
          scan_id: 'old-scan-id',
          access_mode: 'anyone_with_link',
          allowed_emails: [],
          created_at: '2026-07-15T12:00:00.000Z',
          updated_at: '2026-07-15T12:00:00.000Z',
        }],
      }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = {
      fetch: vi.fn(),
      now: () => new Date('2026-07-16T13:30:00Z'),
      randomUUID: () => 'new-scan-id',
    };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    const rotateRequest = (token: string) => handleGenerateModelRequest(
      withAuth(new Request(
        `https://worker.example/generate-3d/image-targets/${targetId}/rotate-link`,
        { method: 'POST' },
      ), token),
      env,
      deps,
    );

    const ownerAttempt = await rotateRequest(ownerToken);
    const adminRotation = await rotateRequest(adminToken);
    const oldScan = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/image-targets/scan/old-scan-id'),
      env,
      deps,
    );
    const newScan = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/image-targets/scan/new-scan-id'),
      env,
      deps,
    );
    const audit = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/auth/audit'), adminToken),
      env,
      deps,
    );

    expect(ownerAttempt.status).toBe(403);
    expect(adminRotation.status).toBe(200);
    await expect(adminRotation.json()).resolves.toMatchObject({
      id: targetId,
      scan_id: 'new-scan-id',
      updated_at: '2026-07-16T13:30:00.000Z',
    });
    expect(oldScan.status).toBe(404);
    expect(newScan.status).toBe(200);
    expect(JSON.parse(objects.get('image-targets/index.json') as string).targets[0]).toMatchObject({
      id: targetId,
      scan_id: 'new-scan-id',
    });
    expect(JSON.parse(objects.get(`image-targets/records/${targetId}.json`) as string)).toMatchObject({
      id: targetId,
      scan_id: 'new-scan-id',
    });
    expect(await audit.json()).toEqual({
      events: expect.arrayContaining([expect.objectContaining({
        actor: 'sshibinthomass@gmail.com',
        action: 'image-target.rotate-link',
        target: targetId,
        status: 'ok',
      })]),
    });
  });

  it('normalizes shared target accounts and keeps the scan id stable across access updates', async () => {
    const { bucket } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({ targets: [] }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket, PUBLIC_MODEL_ORIGIN: '' });
    const deps = {
      fetch: vi.fn(),
      now: () => new Date('2026-07-05T18:02:00Z'),
      randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    await setUserPlan(env, deps, adminToken, 'maker@example.com', 'creator');

    const created = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Shared card',
          image_base64: 'aW1hZ2U=',
          image_mime_type: 'image/jpeg',
          model: { id: 'm1', label: 'Chair', url: 'https://worker.example/chair.glb' },
          access_mode: 'specific_accounts',
          allowed_emails: [
            ' Friend@Example.com ',
            'friend@example.com',
            'SECOND@example.com',
            'maker@example.com',
          ],
        }),
      }), ownerToken),
      env,
      deps,
    );
    const createdBody = await created.json() as Record<string, unknown>;

    expect(created.status).toBe(201);
    expect(createdBody).toMatchObject({
      scan_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      access_mode: 'specific_accounts',
      allowed_emails: ['friend@example.com', 'second@example.com'],
    });

    const updated = await handleGenerateModelRequest(
      withAuth(new Request(`https://worker.example/generate-3d/image-targets/${createdBody.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_mode: 'any_signed_in',
          allowed_emails: ['ignored@example.com'],
        }),
      }), ownerToken),
      env,
      { ...deps, now: () => new Date('2026-07-05T18:03:00Z') },
    );

    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      scan_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      access_mode: 'any_signed_in',
      allowed_emails: [],
    });
  });

  it('rejects invalid target access modes and empty account allowlists', async () => {
    const env = createEnv();
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:04:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const baseBody = {
      label: 'Restricted card',
      image_base64: 'aW1hZ2U=',
      image_mime_type: 'image/jpeg',
      model: { id: 'm1', label: 'Chair', url: 'https://worker.example/chair.glb' },
    };

    const invalidMode = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...baseBody, access_mode: 'team' }),
      }), adminToken),
      env,
      deps,
    );
    const emptyAccounts = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...baseBody, access_mode: 'specific_accounts', allowed_emails: [] }),
      }), adminToken),
      env,
      deps,
    );

    expect(invalidMode.status).toBe(400);
    await expect(invalidMode.json()).resolves.toEqual({ error: 'access_mode is invalid.' });
    expect(emptyAccounts.status).toBe(400);
    await expect(emptyAccounts.json()).resolves.toEqual({
      error: 'specific_accounts requires at least one account email other than the owner.',
    });
  });

  it('creates image targets with multiple placed objects while preserving legacy model fields', async () => {
    const { bucket, objects } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({ targets: [] }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket, PUBLIC_MODEL_ORIGIN: '' });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:05:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    await setUserPlan(env, deps, adminToken, 'maker@example.com', 'creator');

    const response = await handleGenerateModelRequest(
      withAuth(
        new Request('https://worker.example/generate-3d/image-targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: 'Shelf card',
            image_base64: 'aW1hZ2U=',
            image_mime_type: 'image/png',
            objects: [
              {
                id: 'object-chair',
                model: { id: 'generated-chair', label: 'Chair', url: 'https://worker.example/chair.glb' },
                placement: { scale: 1.2, offset_x: 0.1, offset_y: -0.2, height: 0.16 },
              },
              {
                id: 'object-plant',
                model: { id: 'generated-plant', label: 'Plant', url: 'https://worker.example/plant.glb' },
                placement: { scale: 0.8, offset_x: -0.25, offset_y: 0.2, height: 0.08 },
                animation: { spin_axis: 'y', spin_speed: 1.5, bob_height: 0.08, bob_speed: 2 },
              },
            ],
          }),
        }),
        ownerToken,
      ),
      env,
      deps,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      id: 'target-20260705-180500-shelf-card',
      model: { id: 'generated-chair', label: 'Chair', url: 'https://worker.example/chair.glb' },
      placement: { scale: 1.2, offset_x: 0.1, offset_y: -0.2, height: 0.16 },
      objects: [
        {
          id: 'object-chair',
          model: { id: 'generated-chair', label: 'Chair', url: 'https://worker.example/chair.glb' },
          placement: { scale: 1.2, offset_x: 0.1, offset_y: -0.2, height: 0.16 },
        },
        {
          id: 'object-plant',
          model: { id: 'generated-plant', label: 'Plant', url: 'https://worker.example/plant.glb' },
          placement: { scale: 0.8, offset_x: -0.25, offset_y: 0.2, height: 0.08 },
          animation: { spin_axis: 'y', spin_speed: 1.5, bob_height: 0.08, bob_speed: 2 },
        },
      ],
    });
    expect(JSON.parse(objects.get('image-targets/index.json') as string)).toEqual({
      targets: [expect.objectContaining({
        id: 'target-20260705-180500-shelf-card',
        objects: expect.arrayContaining([
          expect.objectContaining({ id: 'object-chair' }),
          expect.objectContaining({
            id: 'object-plant',
            animation: { spin_axis: 'y', spin_speed: 1.5, bob_height: 0.08, bob_speed: 2 },
          }),
        ]),
      })],
    });
    expect(JSON.parse(objects.get('image-targets/records/target-20260705-180500-shelf-card.json') as string)).toEqual(
      expect.objectContaining({
        id: 'target-20260705-180500-shelf-card',
        objects: expect.arrayContaining([
          expect.objectContaining({ id: 'object-chair' }),
          expect.objectContaining({
            id: 'object-plant',
            animation: { spin_axis: 'y', spin_speed: 1.5, bob_height: 0.08, bob_speed: 2 },
          }),
        ]),
      }),
    );
  });

  it('persists mixed model and text target groups with complete authoring state', async () => {
    const { bucket, objects } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({ targets: [] }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket, PUBLIC_MODEL_ORIGIN: '' });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:10:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    await setUserPlan(env, deps, adminToken, 'maker@example.com', 'creator');
    const group = {
      id: 'group-1',
      label: 'Group 1',
      placement: { scale: 1.2, offset_x: 0.15, offset_y: -0.1, height: 0.3, rotation_x: 10, rotation_y: 20, rotation_z: 30 },
      animation: {
        preset: 'gentle-float',
        tracks: [{ property: 'position_y', motion: 'smooth', amount: 0.08, speed: 0.5, phase: 15 }],
      },
    };
    const text = {
      value: 'Hallo AR',
      language: 'german',
      font: 'studio-sans-bold',
      color: '#112233',
      fill_mode: 'gradient',
      gradient_start: '#223344',
      gradient_end: '#334455',
      gradient_direction: 'diagonal',
      side_color: '#445566',
      depth: 0.08,
      bevel: 0.01,
      gloss: 0.9,
      style_preset: 'gold-bevel',
    };

    const response = await handleGenerateModelRequest(
      withAuth(
        new Request('https://worker.example/generate-3d/image-targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: 'Mixed target',
            image_base64: 'aW1hZ2U=',
            image_mime_type: 'image/png',
            groups: [group],
            objects: [
              {
                kind: 'model',
                id: 'model-1',
                model: { id: 'chair', label: 'Chair', url: 'https://worker.example/chair.glb' },
                placement: { scale: 1, offset_x: 0.25, offset_y: -0.1, height: 0.4, rotation_x: 10, rotation_y: 35, rotation_z: 30 },
                group_id: 'group-1',
                local_placement: {
                  scale: 0.8,
                  offset_x: 1.5,
                  offset_y: -1.75,
                  height: -0.5,
                  rotation_x: 0,
                  rotation_y: 15,
                  rotation_z: 0,
                },
              },
              {
                kind: 'text',
                id: 'text-1',
                text,
                placement: { scale: 0.9, offset_x: 0.05, offset_y: 0.1, height: 0.35, rotation_x: 0, rotation_y: 20, rotation_z: 0 },
                animation: {
                  preset: 'custom',
                  tracks: [{ property: 'rotation_y', motion: 'spin', amount: 360, speed: 0.25, phase: 0 }],
                },
              },
            ],
          }),
        }),
        ownerToken,
      ),
      env,
      deps,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      id: 'target-20260705-181000-mixed-target',
      model: { id: 'chair', label: 'Chair', url: 'https://worker.example/chair.glb' },
      objects: [
        expect.objectContaining({
          kind: 'model',
          id: 'model-1',
          group_id: 'group-1',
          local_placement: expect.objectContaining({
            offset_x: 1.5,
            offset_y: -1.75,
            height: -0.5,
            rotation_y: 15,
          }),
          placement: expect.objectContaining({ rotation_y: 35 }),
        }),
        expect.objectContaining({
          kind: 'text',
          id: 'text-1',
          text,
          animation: {
            preset: 'custom',
            tracks: [{ property: 'rotation_y', motion: 'spin', amount: 360, speed: 0.25, phase: 0 }],
          },
        }),
      ],
      groups: [group],
    });

    const storedIndex = JSON.parse(objects.get('image-targets/index.json') as string);
    const storedRecord = JSON.parse(objects.get('image-targets/records/target-20260705-181000-mixed-target.json') as string);
    expect(storedIndex.targets[0]).toMatchObject(body);
    expect(storedRecord).toMatchObject(body);
  });

  it('updates an existing target to a text-only scene without replacing its image', async () => {
    const targetId = 'text-target';
    const imageUrl = `https://worker.example/image-targets/images/${targetId}.jpg`;
    const { bucket, objects } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({
        targets: [{
          id: targetId,
          label: 'Old target',
          image_url: imageUrl,
          image_object_key: `image-targets/images/${targetId}.jpg`,
          model: { id: 'chair', label: 'Chair', url: 'https://worker.example/chair.glb' },
          placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
          owner_email: 'maker@example.com',
          visibility: 'private',
          created_at: '2026-07-05T18:00:00.000Z',
          updated_at: '2026-07-05T18:00:00.000Z',
        }],
      }),
      [`image-targets/images/${targetId}.jpg`]: new Uint8Array([1, 2, 3]).buffer,
    });
    const env = createEnv({ MODEL_BUCKET: bucket, PUBLIC_MODEL_ORIGIN: '' });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:30:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const response = await handleGenerateModelRequest(
      withAuth(new Request(`https://worker.example/generate-3d/image-targets/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: 'Text target',
          objects: [{
            kind: 'text',
            id: 'text-1',
            text: { value: 'Reusable text', language: 'english', font: 'studio-serif-bold', color: '#123456' },
            placement: { scale: 1.1, offset_x: 0.2, offset_y: 0, height: 0.2, rotation_y: 45 },
          }],
          groups: [],
        }),
      }), ownerToken),
      env,
      deps,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: targetId,
      label: 'Text target',
      image_url: imageUrl,
      objects: [expect.objectContaining({ kind: 'text', id: 'text-1', text: expect.objectContaining({ value: 'Reusable text' }) })],
    });
    expect(body).not.toHaveProperty('model');
    expect(body).not.toHaveProperty('placement');
    expect(objects.get(`image-targets/images/${targetId}.jpg`)).toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(JSON.parse(objects.get(`image-targets/records/${targetId}.json`) as string)).toMatchObject(body);
  });

  it('rejects invalid typed target objects when no renderable object remains', async () => {
    const env = createEnv();
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:40:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const invalidObjects = [
      { kind: 'text', id: 'empty', text: { value: '   ' }, placement: {} },
      { kind: 'text', id: 'long', text: { value: 'x'.repeat(513) }, placement: {} },
      { kind: 'text', id: 'color', text: { value: 'Visible', color: 'red' }, placement: {} },
      { kind: 'unknown', id: 'unknown', placement: {} },
    ];

    for (const object of invalidObjects) {
      const response = await handleGenerateModelRequest(
        withAuth(new Request('https://worker.example/generate-3d/image-targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: 'Invalid target',
            image_base64: 'aW1hZ2U=',
            image_mime_type: 'image/png',
            objects: [object],
          }),
        }), adminToken),
        env,
        deps,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'objects must include at least one valid model or text object.' });
    }
  });

  it('creates a unique image target id when the first-format id already exists', async () => {
    const existingId = 'target-20260705-180000-product-box';
    const { bucket, objects } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({
        targets: [
          {
            id: existingId,
            label: 'Product box',
            image_url: `https://worker.example/image-targets/images/${existingId}.jpg`,
            image_object_key: `image-targets/images/${existingId}.jpg`,
            model: { id: 'generated-existing', label: 'Chair', url: 'https://worker.example/models/generated/existing.glb' },
            placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
            owner_email: 'maker@example.com',
            visibility: 'private',
            created_at: '2026-07-05T18:00:00.000Z',
            updated_at: '2026-07-05T18:00:00.000Z',
          },
        ],
      }),
      [`image-targets/records/${existingId}.json`]: JSON.stringify({ id: existingId }),
      [`image-targets/images/${existingId}.jpg`]: new Uint8Array([1, 2, 3]).buffer,
    });
    const env = createEnv({ MODEL_BUCKET: bucket, PUBLIC_MODEL_ORIGIN: '' });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:00:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const response = await handleGenerateModelRequest(
      withAuth(
        new Request('https://worker.example/generate-3d/image-targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: ' Product box ',
            image_base64: 'bmV3LWltYWdl',
            image_mime_type: 'image/jpeg',
            model: {
              id: 'generated-fc-456',
              label: 'Chair',
              url: 'https://worker.example/models/generated/chair-2.glb',
            },
          }),
        }),
        ownerToken,
      ),
      env,
      deps,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: `${existingId}-2`,
      image_url: `https://worker.example/image-targets/images/${existingId}-2.jpg`,
      image_object_key: `image-targets/images/${existingId}-2.jpg`,
    });
    expect(JSON.parse(objects.get('image-targets/index.json') as string)).toEqual({
      targets: expect.arrayContaining([
        expect.objectContaining({ id: existingId }),
        expect.objectContaining({ id: `${existingId}-2` }),
      ]),
    });
    expect(objects.get(`image-targets/images/${existingId}.jpg`)).toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(objects.get(`image-targets/images/${existingId}-2.jpg`)).toEqual(
      new Uint8Array([110, 101, 119, 45, 105, 109, 97, 103, 101]).buffer,
    );
  });

  it('requires an approved session to create image targets and validates image payloads', async () => {
    const env = createEnv();
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:00:00Z') };

    const unauthenticated = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/image-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: 'aW1hZ2U=', image_mime_type: 'image/jpeg' }),
      }),
      env,
      deps,
    );

    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toEqual({ error: 'Login required.' });

    const adminToken = await createAdminToken(env, deps);
    const invalidMime = await handleGenerateModelRequest(
      withAuth(
        new Request('https://worker.example/generate-3d/image-targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: 'aW1hZ2U=',
            image_mime_type: 'image/gif',
            model: { id: 'm1', label: 'Chair', url: 'https://worker.example/chair.glb' },
          }),
        }),
        adminToken,
      ),
      env,
      deps,
    );

    expect(invalidMime.status).toBe(400);
    expect(await invalidMime.json()).toEqual({
      error: 'image_mime_type must be image/png, image/jpeg, or image/webp.',
    });
  });

  it('lists image targets by public visibility, owner, and admin access', async () => {
    const { bucket } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({
        targets: [
          {
            id: 'public-target',
            label: 'Public target',
            image_url: 'https://worker.example/image-targets/images/public-target.jpg',
            image_object_key: 'image-targets/images/public-target.jpg',
            model: { id: 'm-public', label: 'Public chair', url: 'https://worker.example/public.glb' },
            placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
            owner_email: 'maker@example.com',
            visibility: 'public',
            created_at: '2026-07-05T18:00:00.000Z',
            updated_at: '2026-07-05T18:00:00.000Z',
          },
          {
            id: 'private-target',
            label: 'Private target',
            image_url: 'https://worker.example/image-targets/images/private-target.jpg',
            image_object_key: 'image-targets/images/private-target.jpg',
            model: { id: 'm-private', label: 'Private chair', url: 'https://worker.example/private.glb' },
            placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
            owner_email: 'maker@example.com',
            visibility: 'private',
            created_at: '2026-07-05T18:01:00.000Z',
            updated_at: '2026-07-05T18:01:00.000Z',
          },
          {
            id: 'other-private-target',
            label: 'Other private target',
            image_url: 'https://worker.example/image-targets/images/other-private-target.jpg',
            image_object_key: 'image-targets/images/other-private-target.jpg',
            model: { id: 'm-other', label: 'Other table', url: 'https://worker.example/other.glb' },
            placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
            owner_email: 'other@example.com',
            visibility: 'private',
            created_at: '2026-07-05T18:02:00.000Z',
            updated_at: '2026-07-05T18:02:00.000Z',
          },
        ],
      }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:10:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const guestResponse = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/image-targets'),
      env,
      deps,
    );
    const ownerResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets'), ownerToken),
      env,
      deps,
    );
    const adminResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets'), adminToken),
      env,
      deps,
    );

    expect(((await guestResponse.json()) as { targets: Array<{ id: string }> }).targets.map((target) => target.id)).toEqual([
      'public-target',
    ]);
    expect(((await ownerResponse.json()) as { targets: Array<{ id: string }> }).targets.map((target) => target.id)).toEqual([
      'private-target',
      'public-target',
    ]);
    expect(((await adminResponse.json()) as { targets: Array<{ id: string }> }).targets.map((target) => target.id)).toEqual([
      'other-private-target',
      'private-target',
      'public-target',
    ]);
  });

  it('authorizes one scan target through all four access modes', async () => {
    const target = (
      id: string,
      scanId: string,
      accessMode: 'anyone_with_link' | 'any_signed_in' | 'owner_only' | 'specific_accounts',
      allowedEmails: string[] = [],
    ) => ({
      id,
      label: id,
      image_url: `https://worker.example/image-targets/images/${id}.jpg`,
      image_object_key: `image-targets/images/${id}.jpg`,
      model: { id: `model-${id}`, label: 'Chair', url: `https://worker.example/${id}.glb` },
      placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
      owner_email: 'maker@example.com',
      visibility: 'private',
      scan_id: scanId,
      access_mode: accessMode,
      allowed_emails: allowedEmails,
      created_at: '2026-07-05T18:00:00.000Z',
      updated_at: '2026-07-05T18:00:00.000Z',
    });
    const { bucket } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({
        targets: [
          target('link-target', 'scan-link', 'anyone_with_link'),
          target('signed-target', 'scan-signed', 'any_signed_in'),
          target('owner-target', 'scan-owner', 'owner_only'),
          target('shared-target', 'scan-shared', 'specific_accounts', ['friend@example.com']),
        ],
      }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:10:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    await setUserPlan(env, deps, adminToken, 'maker@example.com', 'creator');
    const friendToken = await createApprovedUserToken(env, deps, adminToken, 'friend@example.com');
    const otherToken = await createApprovedUserToken(env, deps, adminToken, 'other@example.com');
    const scan = (scanId: string, token?: string) => handleGenerateModelRequest(
      token
        ? withAuth(new Request(`https://worker.example/generate-3d/image-targets/scan/${scanId}`), token)
        : new Request(`https://worker.example/generate-3d/image-targets/scan/${scanId}`),
      env,
      deps,
    );

    const linkResponse = await scan('scan-link');
    const signedOutResponse = await scan('scan-signed');
    const signedInResponse = await scan('scan-signed', otherToken);
    const ownerDeniedResponse = await scan('scan-owner', otherToken);
    const ownerResponse = await scan('scan-owner', ownerToken);
    const sharedResponse = await scan('scan-shared', friendToken);
    const sharedDeniedResponse = await scan('scan-shared', otherToken);
    const adminResponse = await scan('scan-owner', adminToken);
    const missingResponse = await scan('scan-missing');

    expect(linkResponse.status).toBe(200);
    await expect(linkResponse.json()).resolves.toMatchObject({ id: 'link-target', scan_id: 'scan-link' });
    expect(signedOutResponse.status).toBe(401);
    await expect(signedOutResponse.json()).resolves.toEqual({ error: 'Login required.' });
    expect(signedInResponse.status).toBe(200);
    expect(ownerDeniedResponse.status).toBe(403);
    await expect(ownerDeniedResponse.json()).resolves.toEqual({ error: 'You do not have access to this image target.' });
    expect(ownerResponse.status).toBe(200);
    expect(sharedResponse.status).toBe(200);
    expect(sharedDeniedResponse.status).toBe(403);
    expect(adminResponse.status).toBe(200);
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'Image target not found.' });
  });

  it('backfills and persists a stable scan id when an owner lists a legacy target', async () => {
    const legacyTarget = {
      id: 'legacy-target',
      label: 'Legacy target',
      image_url: 'https://worker.example/image-targets/images/legacy-target.jpg',
      image_object_key: 'image-targets/images/legacy-target.jpg',
      model: { id: 'legacy-model', label: 'Chair', url: 'https://worker.example/legacy.glb' },
      placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
      owner_email: 'maker@example.com',
      visibility: 'private',
      created_at: '2026-07-05T18:00:00.000Z',
      updated_at: '2026-07-05T18:00:00.000Z',
    };
    const { bucket, objects } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({ targets: [legacyTarget] }),
      'image-targets/records/legacy-target.json': JSON.stringify(legacyTarget),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = {
      fetch: vi.fn(),
      now: () => new Date('2026-07-05T18:10:00Z'),
      randomUUID: () => '99999999-8888-4777-8666-555555555555',
    };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const response = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets'), ownerToken),
      env,
      deps,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      targets: [expect.objectContaining({
        id: 'legacy-target',
        scan_id: '99999999-8888-4777-8666-555555555555',
        access_mode: 'owner_only',
      })],
    });
    expect(JSON.parse(objects.get('image-targets/index.json') as string).targets[0].scan_id)
      .toBe('99999999-8888-4777-8666-555555555555');
    expect(JSON.parse(objects.get('image-targets/records/legacy-target.json') as string).scan_id)
      .toBe('99999999-8888-4777-8666-555555555555');
  });

  it('allows only owners or admins to update and delete image targets', async () => {
    const storedObjects = new Map<string, string | ArrayBuffer>();
    storedObjects.set('image-targets/images/private-target.jpg', new Uint8Array([1, 2, 3]).buffer);
    storedObjects.set('image-targets/records/private-target.json', JSON.stringify({ id: 'private-target' }));
    storedObjects.set(
      'image-targets/index.json',
      JSON.stringify({
        targets: [
          {
            id: 'private-target',
            label: 'Private target',
            image_url: 'https://worker.example/image-targets/images/private-target.jpg',
            image_object_key: 'image-targets/images/private-target.jpg',
            model: { id: 'm-private', label: 'Private chair', url: 'https://worker.example/private.glb' },
            placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
            owner_email: 'maker@example.com',
            visibility: 'private',
            created_at: '2026-07-05T18:01:00.000Z',
            updated_at: '2026-07-05T18:01:00.000Z',
          },
        ],
      }),
    );
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn((key: string) => {
          const value = storedObjects.get(key);
          return Promise.resolve(value ? { body: value, httpMetadata: { contentType: 'application/json' } } : null);
        }),
        put: vi.fn((key: string, value: ArrayBuffer | ReadableStream | string) => {
          if (typeof value === 'string' || value instanceof ArrayBuffer) {
            storedObjects.set(key, value);
          }
          return Promise.resolve(undefined);
        }),
        delete: vi.fn((key: string) => {
          storedObjects.delete(key);
          return Promise.resolve(undefined);
        }),
      },
    });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:20:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    const otherToken = await createApprovedUserToken(env, deps, adminToken, 'other@example.com');

    const forbidden = await handleGenerateModelRequest(
      withAuth(
        new Request('https://worker.example/generate-3d/image-targets/private-target', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Nope' }),
        }),
        otherToken,
      ),
      env,
      deps,
    );
    const updated = await handleGenerateModelRequest(
      withAuth(
        new Request('https://worker.example/generate-3d/image-targets/private-target', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Renamed target', placement: { scale: 1.5 } }),
        }),
        ownerToken,
      ),
      env,
      deps,
    );
    const deleted = await handleGenerateModelRequest(
      withAuth(
        new Request('https://worker.example/generate-3d/image-targets/private-target', { method: 'DELETE' }),
        adminToken,
      ),
      env,
      deps,
    );

    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'Only the owner or an admin can manage this image target.' });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      id: 'private-target',
      label: 'Renamed target',
      placement: { scale: 1.5, offset_x: 0, offset_y: 0, height: 0.12 },
      updated_at: '2026-07-05T18:20:00.000Z',
    });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true, id: 'private-target' });
    expect(JSON.parse(storedObjects.get('image-targets/index.json') as string)).toEqual({ targets: [] });
    expect(storedObjects.has('image-targets/images/private-target.jpg')).toBe(false);
    expect(storedObjects.has('image-targets/records/private-target.json')).toBe(false);
  });

  it('requires image_mime_type when replacing an image target image', async () => {
    const storedObjects = new Map<string, string | ArrayBuffer>();
    storedObjects.set('image-targets/images/private-target.jpg', new Uint8Array([1, 2, 3]).buffer);
    storedObjects.set(
      'image-targets/index.json',
      JSON.stringify({
        targets: [
          {
            id: 'private-target',
            label: 'Private target',
            image_url: 'https://worker.example/image-targets/images/private-target.jpg',
            image_object_key: 'image-targets/images/private-target.jpg',
            model: { id: 'm-private', label: 'Private chair', url: 'https://worker.example/private.glb' },
            placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
            owner_email: 'maker@example.com',
            visibility: 'private',
            created_at: '2026-07-05T18:01:00.000Z',
            updated_at: '2026-07-05T18:01:00.000Z',
          },
        ],
      }),
    );
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn((key: string) => {
          const value = storedObjects.get(key);
          return Promise.resolve(value ? { body: value, httpMetadata: { contentType: 'application/json' } } : null);
        }),
        put: vi.fn((key: string, value: ArrayBuffer | ReadableStream | string) => {
          if (typeof value === 'string' || value instanceof ArrayBuffer) {
            storedObjects.set(key, value);
          }
          return Promise.resolve(undefined);
        }),
        delete: vi.fn((key: string) => {
          storedObjects.delete(key);
          return Promise.resolve(undefined);
        }),
      },
    });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:20:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const response = await handleGenerateModelRequest(
      withAuth(
        new Request('https://worker.example/generate-3d/image-targets/private-target', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: 'bmV3LWltYWdl' }),
        }),
        ownerToken,
      ),
      env,
      deps,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'image_mime_type is required when image_base64 is provided.',
    });
    expect(storedObjects.get('image-targets/images/private-target.jpg')).toEqual(new Uint8Array([1, 2, 3]).buffer);
  });

  it('versions replacement image URLs even when the MIME type stays the same', async () => {
    const targetId = 'private-target';
    const oldImageKey = `image-targets/images/${targetId}.jpg`;
    const storedTarget = {
      id: targetId,
      label: 'Private target',
      image_url: `https://worker.example/${oldImageKey}`,
      image_object_key: oldImageKey,
      model: { id: 'm-private', label: 'Private chair', url: 'https://worker.example/private.glb' },
      placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
      owner_email: 'maker@example.com',
      visibility: 'private',
      created_at: '2026-07-05T18:01:00.000Z',
      updated_at: '2026-07-05T18:01:00.000Z',
    };
    const { bucket, objects } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({ targets: [storedTarget] }),
      [`image-targets/records/${targetId}.json`]: JSON.stringify(storedTarget),
      [oldImageKey]: new Uint8Array([1, 2, 3]).buffer,
    });
    const env = createEnv({ MODEL_BUCKET: bucket, PUBLIC_MODEL_ORIGIN: '' });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:20:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const response = await handleGenerateModelRequest(
      withAuth(new Request(`https://worker.example/generate-3d/image-targets/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: 'bmV3LWltYWdl', image_mime_type: 'image/jpeg' }),
      }), ownerToken),
      env,
      deps,
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { image_object_key: string; image_url: string };
    expect(body.image_object_key).not.toBe(oldImageKey);
    expect(body.image_object_key).toMatch(/^image-targets\/images\/private-target-.+\.jpg$/);
    expect(body.image_url).toBe(`https://worker.example/${body.image_object_key}`);
    expect(objects.has(oldImageKey)).toBe(false);
    expect(objects.get(body.image_object_key)).toEqual(
      new Uint8Array([110, 101, 119, 45, 105, 109, 97, 103, 101]).buffer,
    );
  });

  it('keeps the previous image and metadata when a replacement upload fails', async () => {
    const targetId = 'private-target';
    const oldImageKey = `image-targets/images/${targetId}.jpg`;
    const storedTarget = {
      id: targetId,
      label: 'Private target',
      image_url: `https://worker.example/${oldImageKey}`,
      image_object_key: oldImageKey,
      model: { id: 'm-private', label: 'Private chair', url: 'https://worker.example/private.glb' },
      placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
      owner_email: 'maker@example.com',
      visibility: 'private',
      created_at: '2026-07-05T18:01:00.000Z',
      updated_at: '2026-07-05T18:01:00.000Z',
    };
    const { bucket, objects } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({ targets: [storedTarget] }),
      [`image-targets/records/${targetId}.json`]: JSON.stringify(storedTarget),
      [oldImageKey]: new Uint8Array([1, 2, 3]).buffer,
    });
    const env = createEnv({ MODEL_BUCKET: bucket, PUBLIC_MODEL_ORIGIN: '' });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:20:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    bucket.put.mockImplementation((key: string, value: ArrayBuffer | ReadableStream | string) => {
      if (key.startsWith('image-targets/images/') && key !== oldImageKey) {
        return Promise.reject(new Error('R2 image put failed'));
      }
      if (typeof value === 'string' || value instanceof ArrayBuffer) {
        objects.set(key, value);
      }
      return Promise.resolve(undefined);
    });

    const response = await handleGenerateModelRequest(
      withAuth(new Request(`https://worker.example/generate-3d/image-targets/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: 'bmV3LWltYWdl', image_mime_type: 'image/png' }),
      }), ownerToken),
      env,
      deps,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to update image target.' });
    expect(objects.get(oldImageKey)).toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(JSON.parse(objects.get('image-targets/index.json') as string)).toEqual({ targets: [storedTarget] });
    expect(JSON.parse(objects.get(`image-targets/records/${targetId}.json`) as string)).toEqual(storedTarget);
  });

  it('rolls back a replacement image when the target index write fails', async () => {
    const targetId = 'private-target';
    const oldImageKey = `image-targets/images/${targetId}.jpg`;
    const storedTarget = {
      id: targetId,
      label: 'Private target',
      image_url: `https://worker.example/${oldImageKey}`,
      image_object_key: oldImageKey,
      model: { id: 'm-private', label: 'Private chair', url: 'https://worker.example/private.glb' },
      placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
      owner_email: 'maker@example.com',
      visibility: 'private',
      created_at: '2026-07-05T18:01:00.000Z',
      updated_at: '2026-07-05T18:01:00.000Z',
    };
    const { bucket, objects } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({ targets: [storedTarget] }),
      [`image-targets/records/${targetId}.json`]: JSON.stringify(storedTarget),
      [oldImageKey]: new Uint8Array([1, 2, 3]).buffer,
    });
    const env = createEnv({ MODEL_BUCKET: bucket, PUBLIC_MODEL_ORIGIN: '' });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:20:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');
    let failTargetIndexWrite = true;
    bucket.put.mockImplementation((key: string, value: ArrayBuffer | ReadableStream | string) => {
      if (key === 'image-targets/index.json' && failTargetIndexWrite) {
        failTargetIndexWrite = false;
        return Promise.reject(new Error('R2 index put failed'));
      }
      if (typeof value === 'string' || value instanceof ArrayBuffer) {
        objects.set(key, value);
      }
      return Promise.resolve(undefined);
    });

    const response = await handleGenerateModelRequest(
      withAuth(new Request(`https://worker.example/generate-3d/image-targets/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: 'bmV3LWltYWdl', image_mime_type: 'image/png' }),
      }), ownerToken),
      env,
      deps,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unable to update image target.' });
    expect(objects.get(oldImageKey)).toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect([...objects.keys()].filter((key) => key.startsWith('image-targets/images/'))).toEqual([oldImageKey]);
    expect(JSON.parse(objects.get('image-targets/index.json') as string)).toEqual({ targets: [storedTarget] });
    expect(JSON.parse(objects.get(`image-targets/records/${targetId}.json`) as string)).toEqual(storedTarget);
  });

  it('treats image targets without visibility as private', async () => {
    const { bucket } = createMemoryBucket({
      'image-targets/index.json': JSON.stringify({
        targets: [
          {
            id: 'legacy-private-target',
            label: 'Legacy private target',
            image_url: 'https://worker.example/image-targets/images/legacy-private-target.jpg',
            image_object_key: 'image-targets/images/legacy-private-target.jpg',
            model: { id: 'm-legacy', label: 'Legacy chair', url: 'https://worker.example/legacy.glb' },
            placement: { scale: 1, offset_x: 0, offset_y: 0, height: 0.12 },
            owner_email: 'maker@example.com',
            created_at: '2026-07-05T18:03:00.000Z',
            updated_at: '2026-07-05T18:03:00.000Z',
          },
        ],
      }),
    });
    const env = createEnv({ MODEL_BUCKET: bucket });
    const deps = { fetch: vi.fn(), now: () => new Date('2026-07-05T18:10:00Z') };
    const adminToken = await createAdminToken(env, deps);
    const ownerToken = await createApprovedUserToken(env, deps, adminToken, 'maker@example.com');

    const guestResponse = await handleGenerateModelRequest(
      new Request('https://worker.example/generate-3d/image-targets'),
      env,
      deps,
    );
    const ownerResponse = await handleGenerateModelRequest(
      withAuth(new Request('https://worker.example/generate-3d/image-targets'), ownerToken),
      env,
      deps,
    );

    expect(await guestResponse.json()).toEqual({ targets: [] });
    await expect(ownerResponse.json()).resolves.toEqual({
      targets: [
        expect.objectContaining({
          id: 'legacy-private-target',
          visibility: 'private',
          access_mode: 'owner_only',
          allowed_emails: [],
        }),
      ],
    });
  });

  it('serves uploaded image target files from R2', async () => {
    const env = createEnv({
      MODEL_BUCKET: {
        get: vi.fn().mockResolvedValue({
          body: new Uint8Array([0xff, 0xd8, 0xff]).buffer,
          httpMetadata: { contentType: 'image/jpeg' },
        }),
        put: vi.fn().mockResolvedValue(undefined),
      },
    });

    const response = await handleGenerateModelRequest(
      new Request('https://worker.example/image-targets/images/target.jpg'),
      env,
      { fetch: vi.fn(), now: () => new Date('2026-07-05T18:00:00Z') },
    );

    expect(env.MODEL_BUCKET.get).toHaveBeenCalledWith('image-targets/images/target.jpg');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
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

  it('allows local Vite loopback origins by default for visual checks', async () => {
    const origins = [
      'http://127.0.0.1:5178',
      'http://localhost:5178',
      'http://127.0.0.1:5182',
      'http://localhost:5182',
    ];

    for (const origin of origins) {
      const response = await handleGenerateModelRequest(
        new Request('https://worker.example/generate-3d/models', {
          headers: { Origin: origin },
        }),
        createEnv(),
        { fetch: vi.fn(), now: () => new Date('2026-07-04T12:00:00Z') },
      );

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(response.headers.get('Vary')).toBe('Origin');
    }
  });
});
