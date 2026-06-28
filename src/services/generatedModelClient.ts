export interface GenerateModelInput {
  apiUrl: string;
  imageBase64: string;
  imageMimeType: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  maxPolls?: number;
}

export interface GeneratedModelResult {
  modelUrl: string;
  objectKey: string;
  bytes: number;
}

interface WorkerSuccessResponse {
  model_url: string;
  object_key: string;
  bytes: number;
}

interface WorkerErrorResponse {
  error?: string;
}

interface WorkerJobResponse {
  job_id: string;
  status_url: string;
}

export async function generateModelFromImage({
  apiUrl,
  imageBase64,
  imageMimeType,
  fetchImpl = fetch,
  pollIntervalMs = 5000,
  maxPolls = 180,
}: GenerateModelInput): Promise<GeneratedModelResult> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: imageBase64,
      image_mime_type: imageMimeType,
    }),
  });

  const body = (await response.json()) as WorkerSuccessResponse | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Generation failed with HTTP ${response.status}.`);
  }

  if (response.status === 202) {
    const job = body as WorkerJobResponse;
    if (!job.status_url) {
      throw new Error('Worker response did not include a job status URL.');
    }

    return pollGeneratedModel(job.status_url, fetchImpl, pollIntervalMs, maxPolls);
  }

  return parseGeneratedModelResult(body);
}

async function pollGeneratedModel(
  statusUrl: string,
  fetchImpl: typeof fetch,
  pollIntervalMs: number,
  maxPolls: number,
): Promise<GeneratedModelResult> {
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0 && pollIntervalMs > 0) {
      await delay(pollIntervalMs);
    }

    const response = await fetchImpl(statusUrl);
    const body = (await response.json()) as WorkerSuccessResponse | WorkerErrorResponse;

    if (response.status === 202) {
      continue;
    }

    if (!response.ok) {
      throw new Error('error' in body && body.error ? body.error : `Generation failed with HTTP ${response.status}.`);
    }

    return parseGeneratedModelResult(body);
  }

  throw new Error('Generation is still running. Try again in a moment.');
}

function parseGeneratedModelResult(body: WorkerSuccessResponse | WorkerErrorResponse): GeneratedModelResult {
  if (!('model_url' in body) || !body.model_url || !body.object_key) {
    throw new Error('Worker response did not include a generated model URL.');
  }

  return {
    modelUrl: body.model_url,
    objectKey: body.object_key,
    bytes: body.bytes,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
