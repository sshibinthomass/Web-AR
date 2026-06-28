export interface ModelBucket {
  get(key: string): Promise<{
    body: BodyInit | null;
    httpMetadata?: { contentType?: string };
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
  PUBLIC_MODEL_ORIGIN?: string;
  MODEL_BUCKET: ModelBucket;
}

interface GenerateModelDeps {
  fetch: typeof fetch;
  now: () => Date;
}

interface GenerateModelRequestBody {
  image_base64?: unknown;
  image_mime_type?: unknown;
}

const modalPayloadDefaults = {
  seed: 42,
  pipeline_type: '512',
  decimation_target: 100000,
  texture_size: 1024,
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleGenerateModelRequest(request, env, {
      fetch: (input, init) => fetch(input, init),
      now: () => new Date(),
    });
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

  const modalResponse = await deps.fetch(env.MODAL_IMAGE_TO_3D_START_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Modal-Key': env.MODAL_KEY,
      'Modal-Secret': env.MODAL_SECRET,
    },
    body: JSON.stringify({
      image_base64: body.value.image_base64,
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

  return jsonResponse(
    {
      job_id: modalJob.call_id,
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
  const resultUrl = new URL(env.MODAL_IMAGE_TO_3D_RESULT_URL);
  resultUrl.searchParams.set('call_id', jobId);

  const modalResponse = await deps.fetch(resultUrl.toString(), {
    method: 'GET',
    headers: {
      'Modal-Key': env.MODAL_KEY,
      'Modal-Secret': env.MODAL_SECRET,
    },
  });

  if (modalResponse.status === 202) {
    return jsonResponse({ status: 'running' }, 202);
  }

  if (!modalResponse.ok) {
    return jsonResponse({ error: `Modal job result failed: ${await modalResponse.text()}` }, 502);
  }

  const glbBytes = await modalResponse.arrayBuffer();
  const objectKey = `models/generated/capture-${formatTimestamp(deps.now())}.glb`;

  await env.MODEL_BUCKET.put(objectKey, glbBytes, {
    httpMetadata: {
      contentType: 'model/gltf-binary',
    },
  });

  const publicOrigin = (env.PUBLIC_MODEL_ORIGIN || url.origin).replace(/\/+$/, '');
  return jsonResponse({
    model_url: `${publicOrigin}/${objectKey}`,
    object_key: objectKey,
    bytes: glbBytes.byteLength,
  });
}

function validateEnv(env: WorkerEnv): string | null {
  if (!env.MODAL_KEY || !env.MODAL_SECRET) {
    return 'Modal credentials are not configured.';
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
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
