export interface ModelBucket {
  get(key: string): Promise<{
    body: BodyInit | null;
    httpMetadata?: { contentType?: string };
    text?(): Promise<string>;
    arrayBuffer?(): Promise<ArrayBuffer>;
  } | null>;
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  delete?(key: string): Promise<unknown>;
}

export interface WorkerEnv {
  AUTH_SECRET: string;
  ADMIN_EMAIL?: string;
  MODAL_KEY: string;
  MODAL_SECRET: string;
  MODAL_IMAGE_TO_3D_URL: string;
  MODAL_IMAGE_TO_3D_START_URL: string;
  MODAL_IMAGE_TO_3D_RESULT_URL: string;
  MODAL_OPENAI_TO_3D_URL: string;
  MODAL_OPENAI_TO_3D_START_URL: string;
  MODAL_OPENAI_TO_3D_RESULT_URL: string;
  OPENAI_API_KEY: string;
  PUBLIC_MODEL_ORIGIN?: string;
  MODEL_BUCKET: ModelBucket;
}

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface GenerateModelDeps {
  fetch: typeof fetch;
  now: () => Date;
}

interface GenerateModelRequestBody {
  image_base64?: unknown;
  image_mime_type?: unknown;
  target_object?: unknown;
}

interface UploadModelRequestBody {
  file_name?: unknown;
  label?: unknown;
  model_base64?: unknown;
  model_mime_type?: unknown;
}

interface ModelPatchRequestBody {
  label?: unknown;
  preview_base64?: unknown;
  preview_mime_type?: unknown;
}

interface AuthRequestBody {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  status?: unknown;
}

type GenerationPipeline = 'trellis' | 'openai-to-3d';
type AuthRole = 'admin' | 'user';
type AccountStatus = 'active' | 'pending';

interface StoredUser {
  email: string;
  name?: string;
  role: AuthRole;
  status: AccountStatus;
  password_hash: string;
  password_salt: string;
  created_at: string;
  updated_at: string;
  approved_at?: string;
  approved_by?: string;
}

interface UsersIndex {
  users: StoredUser[];
}

interface SessionPayload {
  sub: string;
  role: AuthRole;
  iat: number;
  exp: number;
}

interface StoredJob {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  completed_at?: string;
  failed_at?: string;
  error?: string;
  target_object?: string;
  pipeline?: GenerationPipeline;
  model_url?: string;
  object_key?: string;
  preview_url?: string;
  preview_object_key?: string;
  bytes?: number;
}

interface JobsIndex {
  pending: string[];
}

interface GeneratedModelEntry {
  id: string;
  label: string;
  model_url: string;
  object_key: string;
  preview_url?: string;
  preview_object_key?: string;
  completed_at: string;
  bytes: number;
  source?: 'uploaded';
}

interface GeneratedModelsIndex {
  models: GeneratedModelEntry[];
}

interface ScheduledPollResult {
  completed: number;
  failed: number;
  stillRunning: number;
}

type ProcessJobResult =
  | { state: 'running'; job: StoredJob }
  | { state: 'completed'; job: StoredJob }
  | { state: 'failed'; job: StoredJob };

const modalPayloadDefaults = {
  seed: 42,
  pipeline_type: '512',
  decimation_target: 100000,
  texture_size: 1024,
};

const openAiTo3DModalPayloadDefaults = {
  seed: 42,
  pipeline_type: '512',
  decimation_target: 300000,
  texture_size: 1024,
};

const generatedModelsIndexKey = 'models/generated/index.json';
const pendingJobsIndexKey = 'models/generated/jobs/index.json';
const jobKeyPrefix = 'models/generated/jobs/';
const usersIndexKey = 'auth/users/index.json';
const defaultAdminEmail = 'sshibinthomass@gmail.com';
const passwordHashIterations = 120_000;
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleGenerateModelRequest(request, env, {
      fetch: (input, init) => fetch(input, init),
      now: () => new Date(),
    });
  },
  scheduled(_event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext): void {
    ctx.waitUntil(
      handleScheduledPendingJobs(env, {
        fetch: (input, init) => fetch(input, init),
        now: () => new Date(),
      }),
    );
  },
};

export async function handleGenerateModelRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (url.pathname.startsWith('/auth/')) {
    return handleAuthRequest(request, env, deps, url);
  }

  if (request.method === 'GET' && url.pathname.startsWith('/models/generated/')) {
    return serveGeneratedModel(url.pathname.slice(1), env);
  }

  if (request.method === 'GET' && url.pathname === '/generate-3d/models') {
    const index = await readGeneratedModelsIndex(env);
    return jsonResponse({
      models: index.models.sort((left, right) => right.completed_at.localeCompare(left.completed_at)),
    });
  }

  if (request.method === 'POST' && url.pathname === '/generate-3d/models/upload') {
    const auth = await requireApprovedUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    return handleUploadedModelRequest(request, env, deps, url);
  }

  if (url.pathname.startsWith('/generate-3d/models/')) {
    const auth = await requireApprovedUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    const modelId = decodeURIComponent(url.pathname.replace('/generate-3d/models/', ''));
    return handleGeneratedModelManagementRequest(request, env, deps, modelId, url);
  }

  if (request.method === 'GET' && url.pathname.startsWith('/generate-3d/jobs/')) {
    const auth = await requireApprovedUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    const jobId = decodeURIComponent(url.pathname.replace('/generate-3d/jobs/', ''));
    return pollModalJob(request, env, deps, jobId);
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Only POST requests are supported.' }, 405);
  }

  if (url.pathname !== '/generate-3d' && url.pathname !== '/generate-3d/openai' && url.pathname !== '/extract-image') {
    return jsonResponse({ error: 'Not found.' }, 404);
  }

  const auth = await requireApprovedUser(request, env, deps);
  if (auth instanceof Response) {
    return auth;
  }

  const configError = validateEnv(env);
  if (configError) {
    return jsonResponse({ error: configError }, 500);
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400);
  }

  if (typeof body.value.image_base64 !== 'string' || body.value.image_base64.length === 0) {
    return jsonResponse({ error: 'image_base64 is required.' }, 400);
  }

  const targetObject = normalizeTargetObject(body.value.target_object);

  if (url.pathname === '/extract-image') {
    try {
      const extractedImageBase64 = await extractImageFor3D(
        {
          imageBase64: body.value.image_base64,
          imageMimeType: typeof body.value.image_mime_type === 'string' ? body.value.image_mime_type : 'image/png',
          targetObject,
        },
        env,
        deps,
      );

      return jsonResponse({
        image_base64: extractedImageBase64,
        image_mime_type: 'image/png',
        target_object: targetObject,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OpenAI image extraction failed.';
      return jsonResponse({ error: message }, 502);
    }
  }

  return startModalGenerationJob(
    url,
    env,
    deps,
    {
      imageBase64: body.value.image_base64,
      imageMimeType: typeof body.value.image_mime_type === 'string' ? body.value.image_mime_type : 'image/png',
      targetObject,
      pipeline: url.pathname === '/generate-3d/openai' ? 'openai-to-3d' : 'trellis',
    },
  );
}

async function startModalGenerationJob(
  url: URL,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  input: {
    imageBase64: string;
    imageMimeType: string;
    targetObject: string | null;
    pipeline: GenerationPipeline;
  },
): Promise<Response> {
  const modalConfig = modalConfigForPipeline(env, input.pipeline);
  const payload: Record<string, unknown> = {
    image_base64: input.imageBase64,
  };
  if (input.pipeline === 'openai-to-3d' && input.targetObject) {
    payload.prompt = input.targetObject;
  }
  Object.assign(payload, modalConfig.payloadDefaults);

  const modalResponse = await deps.fetch(modalConfig.startUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Modal-Key': env.MODAL_KEY,
      'Modal-Secret': env.MODAL_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!modalResponse.ok) {
    return jsonResponse({ error: `Modal job start failed: ${await modalResponse.text()}` }, 502);
  }

  const modalJob = (await modalResponse.json()) as { call_id?: unknown };
  if (typeof modalJob.call_id !== 'string' || !modalJob.call_id) {
    return jsonResponse({ error: 'Modal job start response did not include a call_id.' }, 502);
  }

  const now = deps.now();
  const publicOrigin = getPublicOrigin(env, url.origin);
  const preview = await storeGeneratedModelPreview(env, {
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    jobId: modalJob.call_id,
    createdAt: now,
    publicOrigin,
  });
  const job: StoredJob = {
    id: modalJob.call_id,
    label: formatJobLabel(now, input.targetObject),
    status: 'running',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    target_object: input.targetObject ?? undefined,
    pipeline: input.pipeline,
    preview_url: preview?.previewUrl,
    preview_object_key: preview?.previewObjectKey,
  };
  await saveJob(env, job);
  await addPendingJob(env, job.id);

  return jsonResponse(
    {
      job_id: modalJob.call_id,
      label: job.label,
      status: job.status,
      status_url: `${url.origin}/generate-3d/jobs/${encodeURIComponent(modalJob.call_id)}`,
    },
    202,
  );
}

async function handleAuthRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  url: URL,
): Promise<Response> {
  if (!env.MODEL_BUCKET) {
    return jsonResponse({ error: 'Model bucket binding is not configured.' }, 500);
  }

  if (!env.AUTH_SECRET) {
    return jsonResponse({ error: 'Auth secret is not configured.' }, 500);
  }

  if (request.method === 'POST' && url.pathname === '/auth/signup') {
    return handleSignupRequest(request, env, deps);
  }

  if (request.method === 'POST' && url.pathname === '/auth/login') {
    return handleLoginRequest(request, env, deps);
  }

  if (request.method === 'GET' && url.pathname === '/auth/session') {
    const auth = await requireApprovedUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }

    return jsonResponse({ user: toPublicUser(auth.user) });
  }

  if (request.method === 'POST' && url.pathname === '/auth/logout') {
    return jsonResponse({ ok: true });
  }

  if (request.method === 'GET' && url.pathname === '/auth/users') {
    const auth = await requireAdminUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }

    const index = await readUsersIndex(env);
    return jsonResponse({ users: index.users.map(toPublicUser) });
  }

  if (url.pathname.startsWith('/auth/users/')) {
    const auth = await requireAdminUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }

    const email = normalizeEmail(decodeURIComponent(url.pathname.replace('/auth/users/', '')));
    if (!email) {
      return jsonResponse({ error: 'Valid email is required.' }, 400);
    }

    if (request.method === 'PATCH') {
      return handleAccountUpdateRequest(request, env, deps, email, auth.user);
    }

    if (request.method === 'DELETE') {
      return handleAccountRemovalRequest(env, email, auth.user);
    }
  }

  return jsonResponse({ error: 'Not found.' }, 404);
}

async function handleSignupRequest(request: Request, env: WorkerEnv, deps: GenerateModelDeps): Promise<Response> {
  const body = await readJsonBody<AuthRequestBody>(request);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400);
  }

  const email = normalizeEmail(body.value.email);
  const password = normalizePassword(body.value.password);
  const name = normalizeDisplayName(body.value.name);
  if (!email) {
    return jsonResponse({ error: 'Valid email is required.' }, 400);
  }
  if (!password) {
    return jsonResponse({ error: 'Password must be at least 8 characters.' }, 400);
  }

  const index = await readUsersIndex(env);
  if (index.users.some((user) => user.email === email)) {
    return jsonResponse({ error: 'Account already exists.' }, 409);
  }

  const now = deps.now();
  const isAdmin = email === getAdminEmail(env);
  const salt = randomBase64UrlBytes(16);
  const user: StoredUser = {
    email,
    name: name ?? undefined,
    role: isAdmin ? 'admin' : 'user',
    status: isAdmin ? 'active' : 'pending',
    password_hash: await hashPassword(password, salt),
    password_salt: salt,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    approved_at: isAdmin ? now.toISOString() : undefined,
    approved_by: isAdmin ? email : undefined,
  };

  await writeUsersIndex(env, { users: [...index.users, user] });

  if (user.status !== 'active') {
    return jsonResponse({ user: toPublicUser(user) }, 201);
  }

  return jsonResponse(
    {
      user: toPublicUser(user),
      token: await createSessionToken(user, env, now),
    },
    201,
  );
}

async function handleLoginRequest(request: Request, env: WorkerEnv, deps: GenerateModelDeps): Promise<Response> {
  const body = await readJsonBody<AuthRequestBody>(request);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400);
  }

  const email = normalizeEmail(body.value.email);
  const password = normalizePassword(body.value.password);
  if (!email || !password) {
    return jsonResponse({ error: 'Invalid email or password.' }, 401);
  }

  const index = await readUsersIndex(env);
  const user = index.users.find((entry) => entry.email === email);
  if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
    return jsonResponse({ error: 'Invalid email or password.' }, 401);
  }

  if (user.status !== 'active') {
    return jsonResponse({ error: 'Account pending admin approval.' }, 403);
  }

  return jsonResponse({
    user: toPublicUser(user),
    token: await createSessionToken(user, env, deps.now()),
  });
}

async function handleAccountUpdateRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  email: string,
  adminUser: StoredUser,
): Promise<Response> {
  const body = await readJsonBody<AuthRequestBody>(request);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400);
  }

  if (body.value.status !== 'active' && body.value.status !== 'pending') {
    return jsonResponse({ error: 'status must be active or pending.' }, 400);
  }

  const index = await readUsersIndex(env);
  const userIndex = index.users.findIndex((user) => user.email === email);
  if (userIndex === -1) {
    return jsonResponse({ error: 'Account not found.' }, 404);
  }

  const now = deps.now();
  const existingUser = index.users[userIndex];
  const nextUser: StoredUser = {
    ...existingUser,
    role: existingUser.email === getAdminEmail(env) ? 'admin' : existingUser.role,
    status: body.value.status,
    updated_at: now.toISOString(),
    approved_at: body.value.status === 'active' ? existingUser.approved_at ?? now.toISOString() : undefined,
    approved_by: body.value.status === 'active' ? existingUser.approved_by ?? adminUser.email : undefined,
  };
  const users = [...index.users];
  users[userIndex] = nextUser;
  await writeUsersIndex(env, { users });

  return jsonResponse({ user: toPublicUser(nextUser) });
}

async function handleAccountRemovalRequest(env: WorkerEnv, email: string, adminUser: StoredUser): Promise<Response> {
  if (email === adminUser.email) {
    return jsonResponse({ error: 'Admins cannot remove their own account.' }, 400);
  }

  const index = await readUsersIndex(env);
  const nextUsers = index.users.filter((user) => user.email !== email);
  if (nextUsers.length === index.users.length) {
    return jsonResponse({ error: 'Account not found.' }, 404);
  }

  await writeUsersIndex(env, { users: nextUsers });
  return jsonResponse({ deleted: true, email });
}

async function handleUploadedModelRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  url: URL,
): Promise<Response> {
  if (!env.MODEL_BUCKET) {
    return jsonResponse({ error: 'Model bucket binding is not configured.' }, 500);
  }

  const body = await readJsonBody<UploadModelRequestBody>(request);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400);
  }

  if (typeof body.value.model_base64 !== 'string' || body.value.model_base64.length === 0) {
    return jsonResponse({ error: 'model_base64 is required.' }, 400);
  }

  const fileName = typeof body.value.file_name === 'string' ? body.value.file_name : 'uploaded-model.glb';
  if (!fileName.toLowerCase().endsWith('.glb')) {
    return jsonResponse({ error: 'Choose a .glb model file.' }, 400);
  }

  const label = normalizeModelLabel(body.value.label) ?? uploadedModelLabel(fileName);
  const now = deps.now();
  const id = `upload-${formatTimestamp(now)}-${slugifyModelLabel(label)}`;
  const objectKey = `models/generated/uploads/${id}.glb`;
  const modelBytes = base64ToArrayBuffer(stripDataUrlPrefix(body.value.model_base64));
  const entry: GeneratedModelEntry = {
    id,
    label,
    model_url: `${getPublicOrigin(env, url.origin)}/${objectKey}`,
    object_key: objectKey,
    completed_at: now.toISOString(),
    bytes: modelBytes.byteLength,
    source: 'uploaded',
  };

  await env.MODEL_BUCKET.put(objectKey, modelBytes, {
    httpMetadata: { contentType: normalizeModelMimeType(body.value.model_mime_type) },
  });
  await upsertGeneratedModelEntry(env, entry);

  return jsonResponse(entry, 201);
}

async function handleGeneratedModelManagementRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  modelId: string,
  url: URL,
): Promise<Response> {
  if (!modelId) {
    return jsonResponse({ error: 'model_id is required.' }, 400);
  }

  if (!env.MODEL_BUCKET) {
    return jsonResponse({ error: 'Model bucket binding is not configured.' }, 500);
  }

  if (request.method === 'PATCH') {
    const body = await readJsonBody<ModelPatchRequestBody>(request);
    if (!body.ok) {
      return jsonResponse({ error: body.error }, 400);
    }

    const label = normalizeModelLabel(body.value.label);
    const previewBase64 =
      typeof body.value.preview_base64 === 'string' && body.value.preview_base64.length > 0
        ? body.value.preview_base64
        : null;

    if (!label && !previewBase64) {
      return jsonResponse({ error: 'label or preview_base64 is required.' }, 400);
    }

    try {
      return await updateGeneratedModel(env, deps, modelId, {
        label: label ?? undefined,
        previewBase64: previewBase64 ?? undefined,
        previewMimeType:
          typeof body.value.preview_mime_type === 'string' ? body.value.preview_mime_type : 'image/png',
        publicOrigin: getPublicOrigin(env, url.origin),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update generated model.';
      return jsonResponse({ error: message }, 400);
    }
  }

  if (request.method === 'DELETE') {
    return deleteGeneratedModel(env, modelId);
  }

  return jsonResponse({ error: 'Only PATCH and DELETE requests are supported for generated models.' }, 405);
}

async function updateGeneratedModel(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  modelId: string,
  update: {
    label?: string;
    previewBase64?: string;
    previewMimeType: string;
    publicOrigin: string;
  },
): Promise<Response> {
  const index = await readGeneratedModelsIndex(env);
  const modelIndex = index.models.findIndex((model) => model.id === modelId);
  if (modelIndex === -1) {
    return jsonResponse({ error: 'Generated model not found.' }, 404);
  }

  const existingModel = index.models[modelIndex];
  const replacementPreview = update.previewBase64
    ? await storeUpdatedModelPreview(env, {
        imageBase64: update.previewBase64,
        imageMimeType: update.previewMimeType,
        modelId,
        publicOrigin: update.publicOrigin,
        updatedAt: deps.now(),
      })
    : null;
  const renamedModel: GeneratedModelEntry = {
    ...existingModel,
    label: update.label ?? existingModel.label,
    preview_url: replacementPreview?.previewUrl ?? existingModel.preview_url,
    preview_object_key: replacementPreview?.previewObjectKey ?? existingModel.preview_object_key,
  };
  const models = [...index.models];
  models[modelIndex] = renamedModel;
  await writeJsonObject(env, generatedModelsIndexKey, { models });

  const job = await readJob(env, modelId);
  if (job) {
    await saveJob(env, {
      ...job,
      label: update.label ?? job.label,
      preview_url: replacementPreview?.previewUrl ?? job.preview_url,
      preview_object_key: replacementPreview?.previewObjectKey ?? job.preview_object_key,
      updated_at: deps.now().toISOString(),
    });
  }

  if (
    replacementPreview &&
    env.MODEL_BUCKET.delete &&
    existingModel.preview_object_key &&
    existingModel.preview_object_key !== replacementPreview.previewObjectKey
  ) {
    await env.MODEL_BUCKET.delete(existingModel.preview_object_key);
  }

  return jsonResponse(renamedModel);
}

async function deleteGeneratedModel(env: WorkerEnv, modelId: string): Promise<Response> {
  const index = await readGeneratedModelsIndex(env);
  const model = index.models.find((entry) => entry.id === modelId);
  if (!model) {
    return jsonResponse({ error: 'Generated model not found.' }, 404);
  }

  await writeJsonObject(env, generatedModelsIndexKey, {
    models: index.models.filter((entry) => entry.id !== modelId),
  });

  if (env.MODEL_BUCKET.delete) {
    await env.MODEL_BUCKET.delete(model.object_key);
    if (model.preview_object_key) {
      await env.MODEL_BUCKET.delete(model.preview_object_key);
    }
    await env.MODEL_BUCKET.delete(jobStorageKey(modelId));
  }

  return jsonResponse({ deleted: true, id: modelId });
}

async function pollModalJob(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  jobId: string,
): Promise<Response> {
  if (!jobId) {
    return jsonResponse({ error: 'job_id is required.' }, 400);
  }

  const url = new URL(request.url);
  const result = await processModalJob(env, deps, jobId, url.origin);

  if (result.state === 'running') {
    return jsonResponse({ status: 'running' }, 202);
  }

  if (result.state === 'failed') {
    return jsonResponse({ error: result.job.error ?? 'Modal job result failed.' }, 502);
  }

  return jsonResponse(toJobResponse(result.job));
}

export async function handleScheduledPendingJobs(
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<ScheduledPollResult> {
  const configError = validateEnv(env);
  if (configError) {
    return { completed: 0, failed: 1, stillRunning: 0 };
  }

  const index = await readJobsIndex(env);
  const counts: ScheduledPollResult = { completed: 0, failed: 0, stillRunning: 0 };

  for (const jobId of index.pending) {
    const result = await processModalJob(env, deps, jobId);
    if (result.state === 'completed') {
      counts.completed += 1;
    } else if (result.state === 'failed') {
      counts.failed += 1;
    } else {
      counts.stillRunning += 1;
    }
  }

  return counts;
}

async function processModalJob(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  jobId: string,
  requestOrigin?: string,
): Promise<ProcessJobResult> {
  const now = deps.now();
  const existingJob = await readJob(env, jobId);
  const job =
    existingJob ??
    ({
      id: jobId,
      label: formatDisplayTimestamp(now),
      status: 'running',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      pipeline: 'trellis',
    } satisfies StoredJob);
  const resultUrl = new URL(modalConfigForPipeline(env, job.pipeline ?? 'trellis').resultUrl);
  resultUrl.searchParams.set('call_id', jobId);

  const modalResponse = await deps.fetch(resultUrl.toString(), {
    method: 'GET',
    headers: {
      'Modal-Key': env.MODAL_KEY,
      'Modal-Secret': env.MODAL_SECRET,
    },
  });

  if (modalResponse.status === 202) {
    const runningJob: StoredJob = {
      ...job,
      status: 'running',
      updated_at: now.toISOString(),
    };
    await saveJob(env, runningJob);
    return { state: 'running', job: runningJob };
  }

  if (!modalResponse.ok) {
    const failedJob: StoredJob = {
      ...job,
      status: 'failed',
      error: `Modal job result failed: ${await modalResponse.text()}`,
      failed_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    await saveJob(env, failedJob);
    await removePendingJob(env, jobId);
    return { state: 'failed', job: failedJob };
  }

  const glbBytes = await modalResponse.arrayBuffer();
  const objectKey = `models/generated/capture-${formatTimestamp(new Date(job.created_at))}-${safeObjectKeyPart(job.id)}.glb`;

  await env.MODEL_BUCKET.put(objectKey, glbBytes, {
    httpMetadata: {
      contentType: 'model/gltf-binary',
    },
  });

  const publicOrigin = getPublicOrigin(env, requestOrigin);
  const completedJob: StoredJob = {
    ...job,
    status: 'completed',
    completed_at: now.toISOString(),
    updated_at: now.toISOString(),
    model_url: `${publicOrigin}/${objectKey}`,
    object_key: objectKey,
    preview_url: job.preview_url,
    preview_object_key: job.preview_object_key,
    bytes: glbBytes.byteLength,
  };
  await saveJob(env, completedJob);
  await upsertGeneratedModel(env, completedJob);
  await removePendingJob(env, jobId);
  return { state: 'completed', job: completedJob };
}

function validateEnv(env: WorkerEnv): string | null {
  if (!env.MODAL_KEY || !env.MODAL_SECRET) {
    return 'Modal credentials are not configured.';
  }

  if (!env.OPENAI_API_KEY) {
    return 'OpenAI API key is not configured.';
  }

  if (!env.MODAL_IMAGE_TO_3D_URL) {
    return 'Modal endpoint URL is not configured.';
  }

  if (!env.MODAL_IMAGE_TO_3D_START_URL || !env.MODAL_IMAGE_TO_3D_RESULT_URL) {
    return 'Modal async endpoint URLs are not configured.';
  }

  if (!env.MODAL_OPENAI_TO_3D_START_URL || !env.MODAL_OPENAI_TO_3D_RESULT_URL) {
    return 'Modal OpenAI-to-3D async endpoint URLs are not configured.';
  }

  if (!env.MODEL_BUCKET) {
    return 'Model bucket binding is not configured.';
  }

  return null;
}

function modalConfigForPipeline(
  env: WorkerEnv,
  pipeline: GenerationPipeline,
): { startUrl: string; resultUrl: string; payloadDefaults: typeof modalPayloadDefaults } {
  if (pipeline === 'openai-to-3d') {
    return {
      startUrl: env.MODAL_OPENAI_TO_3D_START_URL,
      resultUrl: env.MODAL_OPENAI_TO_3D_RESULT_URL,
      payloadDefaults: openAiTo3DModalPayloadDefaults,
    };
  }

  return {
    startUrl: env.MODAL_IMAGE_TO_3D_START_URL,
    resultUrl: env.MODAL_IMAGE_TO_3D_RESULT_URL,
    payloadDefaults: modalPayloadDefaults,
  };
}

async function extractImageFor3D(
  input: {
    imageBase64: string;
    imageMimeType: string;
    targetObject: string | null;
  },
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<string> {
  const formData = new FormData();
  formData.append('image', new Blob([base64ToArrayBuffer(input.imageBase64)], { type: input.imageMimeType }), 'input.png');
  formData.append('model', 'gpt-image-2-2026-04-21');
  formData.append('prompt', buildOpenAiExtractionPrompt(input.targetObject));
  formData.append('n', '1');

  const response = await deps.fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OpenAI image extraction failed: ${await response.text()}`);
  }

  const body = (await response.json()) as { data?: Array<{ b64_json?: unknown; url?: unknown }> };
  const image = body.data?.[0];
  if (typeof image?.b64_json === 'string' && image.b64_json) {
    return image.b64_json;
  }

  if (typeof image?.url === 'string' && image.url) {
    const imageResponse = await deps.fetch(image.url);
    if (!imageResponse.ok) {
      throw new Error(`OpenAI image extraction failed: could not download edited image (${imageResponse.status}).`);
    }
    return arrayBufferToBase64(await imageResponse.arrayBuffer());
  }

  throw new Error('OpenAI image extraction failed: no image data returned.');
}

function buildOpenAiExtractionPrompt(targetObject: string | null): string {
  if (targetObject) {
    return `Extract the ${targetObject} from the image. Place the ${targetObject} in a frontal-side position suitable for 3D generation, and make the background solid pure white. The final output must contain only a single ${targetObject}, in high quality (HQ), extremely sharp, with clear details and studio lighting, optimized for 3D reconstruction.`;
  }

  return 'Extract the main, most prominent object from the image. Place it in a frontal-side position suitable for 3D generation, and make the background solid pure white. The final output must contain only a single object, in high quality (HQ), extremely sharp, with clear details and studio lighting, optimized for 3D reconstruction.';
}

function normalizeTargetObject(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeModelLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizePassword(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 8) {
    return null;
  }

  return value;
}

function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const name = value.trim();
  return name ? name.slice(0, 120) : null;
}

function getAdminEmail(env: WorkerEnv): string {
  return normalizeEmail(env.ADMIN_EMAIL) ?? defaultAdminEmail;
}

function toPublicUser(user: StoredUser): { email: string; name?: string; role: AuthRole; status: AccountStatus } {
  return {
    email: user.email,
    ...(user.name ? { name: user.name } : {}),
    role: user.role,
    status: user.status,
  };
}

async function requireApprovedUser(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<{ user: StoredUser } | Response> {
  if (!env.AUTH_SECRET) {
    return jsonResponse({ error: 'Auth secret is not configured.' }, 500);
  }

  const token = readBearerToken(request);
  if (!token) {
    return jsonResponse({ error: 'Login required.' }, 401);
  }

  const payload = await verifySessionToken(token, env, deps.now());
  if (!payload) {
    return jsonResponse({ error: 'Login required.' }, 401);
  }

  const index = await readUsersIndex(env);
  const user = index.users.find((entry) => entry.email === payload.sub);
  if (!user) {
    return jsonResponse({ error: 'Login required.' }, 401);
  }

  if (user.status !== 'active') {
    return jsonResponse({ error: 'Account pending admin approval.' }, 403);
  }

  return { user };
}

async function requireAdminUser(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<{ user: StoredUser } | Response> {
  const auth = await requireApprovedUser(request, env, deps);
  if (auth instanceof Response) {
    return auth;
  }

  if (auth.user.role !== 'admin') {
    return jsonResponse({ error: 'Admin access required.' }, 403);
  }

  return auth;
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

async function readJsonBody<T = GenerateModelRequestBody>(
  request: Request,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    const value = (await request.json()) as T;
    return { ok: true, value };
  } catch {
    return { ok: false, error: 'Request body must be valid JSON.' };
  }
}

async function serveGeneratedModel(objectKey: string, env: WorkerEnv): Promise<Response> {
  if (!env.MODEL_BUCKET) {
    return jsonResponse({ error: 'Model bucket binding is not configured.' }, 500);
  }

  const object = await env.MODEL_BUCKET.get(objectKey);
  if (!object?.body) {
    return jsonResponse({ error: 'Generated model not found.' }, 404);
  }

  return new Response(object.body, {
    headers: {
      ...corsHeaders,
      'Content-Type': object.httpMetadata?.contentType ?? 'model/gltf-binary',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

async function readJob(env: WorkerEnv, jobId: string): Promise<StoredJob | null> {
  return readJsonObject<StoredJob | null>(env, jobStorageKey(jobId), null);
}

async function saveJob(env: WorkerEnv, job: StoredJob): Promise<void> {
  await writeJsonObject(env, jobStorageKey(job.id), job);
}

async function readJobsIndex(env: WorkerEnv): Promise<JobsIndex> {
  return readJsonObject<JobsIndex>(env, pendingJobsIndexKey, { pending: [] });
}

async function addPendingJob(env: WorkerEnv, jobId: string): Promise<void> {
  const index = await readJobsIndex(env);
  if (!index.pending.includes(jobId)) {
    index.pending.push(jobId);
  }
  await writeJsonObject(env, pendingJobsIndexKey, index);
}

async function removePendingJob(env: WorkerEnv, jobId: string): Promise<void> {
  const index = await readJobsIndex(env);
  const nextPending = index.pending.filter((pendingJobId) => pendingJobId !== jobId);
  await writeJsonObject(env, pendingJobsIndexKey, { pending: nextPending });
}

async function readGeneratedModelsIndex(env: WorkerEnv): Promise<GeneratedModelsIndex> {
  return readJsonObject<GeneratedModelsIndex>(env, generatedModelsIndexKey, { models: [] });
}

async function readUsersIndex(env: WorkerEnv): Promise<UsersIndex> {
  return readJsonObject<UsersIndex>(env, usersIndexKey, { users: [] });
}

async function writeUsersIndex(env: WorkerEnv, index: UsersIndex): Promise<void> {
  await writeJsonObject(env, usersIndexKey, {
    users: index.users.map((user) => ({
      ...user,
      role: user.email === getAdminEmail(env) ? 'admin' : user.role,
    })),
  });
}

async function upsertGeneratedModel(env: WorkerEnv, job: StoredJob): Promise<void> {
  if (!job.model_url || !job.object_key || !job.completed_at || typeof job.bytes !== 'number') {
    return;
  }

  const entry: GeneratedModelEntry = {
    id: job.id,
    label: job.label,
    model_url: job.model_url,
    object_key: job.object_key,
    preview_url: job.preview_url,
    preview_object_key: job.preview_object_key,
    completed_at: job.completed_at,
    bytes: job.bytes,
  };
  await upsertGeneratedModelEntry(env, entry);
}

async function upsertGeneratedModelEntry(env: WorkerEnv, entry: GeneratedModelEntry): Promise<void> {
  const index = await readGeneratedModelsIndex(env);
  const models = [entry, ...index.models.filter((model) => model.id !== entry.id)].sort((left, right) =>
    right.completed_at.localeCompare(left.completed_at),
  );
  await writeJsonObject(env, generatedModelsIndexKey, { models });
}

async function readJsonObject<T>(env: WorkerEnv, key: string, fallback: T): Promise<T> {
  const object = await env.MODEL_BUCKET.get(key);
  if (!object?.body) {
    return fallback;
  }

  try {
    return JSON.parse(await readObjectText(object)) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonObject(env: WorkerEnv, key: string, value: unknown): Promise<void> {
  await env.MODEL_BUCKET.put(key, JSON.stringify(value), {
    httpMetadata: {
      contentType: 'application/json',
    },
  });
}

async function readObjectText(object: {
  body: BodyInit | null;
  text?(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}): Promise<string> {
  if (object.text) {
    return object.text();
  }

  if (typeof object.body === 'string') {
    return object.body;
  }

  if (object.arrayBuffer) {
    return new TextDecoder().decode(await object.arrayBuffer());
  }

  if (object.body instanceof ArrayBuffer) {
    return new TextDecoder().decode(object.body);
  }

  return new Response(object.body).text();
}

function toJobResponse(job: StoredJob): Record<string, unknown> {
  return {
    id: job.id,
    label: job.label,
    status: job.status,
    model_url: job.model_url,
    object_key: job.object_key,
    preview_url: job.preview_url,
    preview_object_key: job.preview_object_key,
    bytes: job.bytes,
  };
}

async function storeGeneratedModelPreview(
  env: WorkerEnv,
  input: {
    imageBase64: string;
    imageMimeType: string;
    jobId: string;
    createdAt: Date;
    publicOrigin: string;
  },
): Promise<{ previewUrl: string; previewObjectKey: string } | null> {
  try {
    const contentType = normalizeImageMimeType(input.imageMimeType);
    const extension = imageExtensionForMimeType(contentType);
    const previewObjectKey = `models/generated/previews/capture-${formatTimestamp(input.createdAt)}-${safeObjectKeyPart(
      input.jobId,
    )}.${extension}`;
    await env.MODEL_BUCKET.put(previewObjectKey, base64ToArrayBuffer(stripDataUrlPrefix(input.imageBase64)), {
      httpMetadata: {
        contentType,
      },
    });
    return {
      previewUrl: `${input.publicOrigin}/${previewObjectKey}`,
      previewObjectKey,
    };
  } catch {
    return null;
  }
}

async function storeUpdatedModelPreview(
  env: WorkerEnv,
  input: {
    imageBase64: string;
    imageMimeType: string;
    modelId: string;
    publicOrigin: string;
    updatedAt: Date;
  },
): Promise<{ previewUrl: string; previewObjectKey: string }> {
  const contentType = normalizeImageMimeType(input.imageMimeType);
  const extension = imageExtensionForMimeType(contentType);
  const previewObjectKey = `models/generated/previews/thumbnail-${formatTimestamp(input.updatedAt)}-${safeObjectKeyPart(
    input.modelId,
  )}.${extension}`;
  await env.MODEL_BUCKET.put(previewObjectKey, base64ToArrayBuffer(stripDataUrlPrefix(input.imageBase64)), {
    httpMetadata: {
      contentType,
    },
  });
  return {
    previewUrl: `${input.publicOrigin}/${previewObjectKey}`,
    previewObjectKey,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function jobStorageKey(jobId: string): string {
  return `${jobKeyPrefix}${safeObjectKeyPart(jobId)}.json`;
}

function getPublicOrigin(env: WorkerEnv, requestOrigin?: string): string {
  return (env.PUBLIC_MODEL_ORIGIN || requestOrigin || '').replace(/\/+$/, '');
}

function formatTimestamp(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function formatDisplayTimestamp(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

function formatJobLabel(date: Date, targetObject: string | null): string {
  const objectLabel = targetObject ?? 'Main object';
  return `${objectLabel} - ${formatDisplayTimestamp(date)}`;
}

function safeObjectKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

function slugifyModelLabel(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'model'
  );
}

function uploadedModelLabel(fileName: string): string {
  return fileName.replace(/\.glb$/i, '').trim() || 'Uploaded model';
}

function normalizeModelMimeType(_value: unknown): string {
  return 'model/gltf-binary';
}

function normalizeImageMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') {
    return normalized;
  }

  return 'image/png';
}

function imageExtensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/jpeg') {
    return 'jpg';
  }

  if (mimeType === 'image/webp') {
    return 'webp';
  }

  return 'png';
}

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(',');
  if (value.startsWith('data:') && commaIndex !== -1) {
    return value.slice(commaIndex + 1);
  }

  return value;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: bytesToArrayBuffer(base64UrlToBytes(salt)),
      iterations: passwordHashIterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return bytesToBase64Url(new Uint8Array(hash));
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  return constantTimeEqual(await hashPassword(password, salt), expectedHash);
}

async function createSessionToken(user: StoredUser, env: WorkerEnv, now: Date): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = {
    sub: user.email,
    role: user.role,
    iat: issuedAt,
    exp: issuedAt + sessionLifetimeSeconds,
  };
  const encodedPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signSessionPayload(encodedPayload, env.AUTH_SECRET);
  return `${encodedPayload}.${signature}`;
}

async function verifySessionToken(token: string, env: WorkerEnv, now: Date): Promise<SessionPayload | null> {
  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  const expectedSignature = await signSessionPayload(encodedPayload, env.AUTH_SECRET);
  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload))) as SessionPayload;
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(now.getTime() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function signSessionPayload(encodedPayload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function randomBase64UrlBytes(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}
