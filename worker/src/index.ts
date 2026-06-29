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
}

export interface WorkerEnv {
  MODAL_KEY: string;
  MODAL_SECRET: string;
  MODAL_IMAGE_TO_3D_URL: string;
  MODAL_IMAGE_TO_3D_START_URL: string;
  MODAL_IMAGE_TO_3D_RESULT_URL: string;
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
  model_url?: string;
  object_key?: string;
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
  completed_at: string;
  bytes: number;
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

const generatedModelsIndexKey = 'models/generated/index.json';
const pendingJobsIndexKey = 'models/generated/jobs/index.json';
const jobKeyPrefix = 'models/generated/jobs/';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

  if (request.method === 'GET' && url.pathname.startsWith('/models/generated/')) {
    return serveGeneratedModel(url.pathname.slice(1), env);
  }

  if (request.method === 'GET' && url.pathname === '/generate-3d/models') {
    const index = await readGeneratedModelsIndex(env);
    return jsonResponse({
      models: index.models.sort((left, right) => right.completed_at.localeCompare(left.completed_at)),
    });
  }

  if (request.method === 'GET' && url.pathname.startsWith('/generate-3d/jobs/')) {
    const jobId = decodeURIComponent(url.pathname.replace('/generate-3d/jobs/', ''));
    return pollModalJob(request, env, deps, jobId);
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Only POST requests are supported.' }, 405);
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
  let extractedImageBase64: string;
  try {
    extractedImageBase64 = await extractImageFor3D(
      {
        imageBase64: body.value.image_base64,
        imageMimeType: typeof body.value.image_mime_type === 'string' ? body.value.image_mime_type : 'image/png',
        targetObject,
      },
      env,
      deps,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI image extraction failed.';
    return jsonResponse({ error: message }, 502);
  }

  const modalResponse = await deps.fetch(env.MODAL_IMAGE_TO_3D_START_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Modal-Key': env.MODAL_KEY,
      'Modal-Secret': env.MODAL_SECRET,
    },
    body: JSON.stringify({
      image_base64: extractedImageBase64,
      ...modalPayloadDefaults,
    }),
  });

  if (!modalResponse.ok) {
    return jsonResponse({ error: `Modal job start failed: ${await modalResponse.text()}` }, 502);
  }

  const modalJob = (await modalResponse.json()) as { call_id?: unknown };
  if (typeof modalJob.call_id !== 'string' || !modalJob.call_id) {
    return jsonResponse({ error: 'Modal job start response did not include a call_id.' }, 502);
  }

  const now = deps.now();
  const job: StoredJob = {
    id: modalJob.call_id,
    label: formatJobLabel(now, targetObject),
    status: 'running',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    target_object: targetObject ?? undefined,
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
  const resultUrl = new URL(env.MODAL_IMAGE_TO_3D_RESULT_URL);
  resultUrl.searchParams.set('call_id', jobId);
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
    } satisfies StoredJob);

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

  if (!env.MODEL_BUCKET) {
    return 'Model bucket binding is not configured.';
  }

  return null;
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

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: GenerateModelRequestBody } | { ok: false; error: string }> {
  try {
    const value = (await request.json()) as GenerateModelRequestBody;
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

async function upsertGeneratedModel(env: WorkerEnv, job: StoredJob): Promise<void> {
  if (!job.model_url || !job.object_key || !job.completed_at || typeof job.bytes !== 'number') {
    return;
  }

  const index = await readGeneratedModelsIndex(env);
  const entry: GeneratedModelEntry = {
    id: job.id,
    label: job.label,
    model_url: job.model_url,
    object_key: job.object_key,
    completed_at: job.completed_at,
    bytes: job.bytes,
  };
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
    bytes: job.bytes,
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
