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
  pipeline_type: '1024_cascade',
  decimation_target: 1000000,
  texture_size: 4096,
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleGenerateModelRequest(request, env, {
      fetch,
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

  const modalResponse = await deps.fetch(env.MODAL_IMAGE_TO_3D_URL, {
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
    return jsonResponse({ error: `Modal generation failed: ${await modalResponse.text()}` }, 502);
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
