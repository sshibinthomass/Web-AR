import type { ModelOption } from '../app/models';

export interface GenerateModelInput {
  apiUrl: string;
  imageBase64: string;
  imageMimeType: string;
  targetObject?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  maxPolls?: number;
}

export interface GeneratedModelResult {
  modelUrl: string;
  objectKey: string;
  bytes: number;
}

export interface StartGeneratedModelJobResult {
  id: string;
  label: string;
  status: 'running';
  statusUrl: string;
}

interface ListGeneratedModelsInput {
  apiUrl: string;
  fetchImpl?: typeof fetch;
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
  label?: string;
  status?: string;
  status_url: string;
}

interface WorkerGeneratedModelEntry {
  id: string;
  label: string;
  model_url: string;
  object_key: string;
}

interface WorkerGeneratedModelsResponse {
  models?: WorkerGeneratedModelEntry[];
}

export async function startGeneratedModelJob({
  apiUrl,
  imageBase64,
  imageMimeType,
  targetObject,
  fetchImpl = fetch,
}: GenerateModelInput): Promise<StartGeneratedModelJobResult> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createGenerateModelRequestBody(imageBase64, imageMimeType, targetObject)),
  });

  const body = (await response.json()) as WorkerJobResponse | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Generation failed with HTTP ${response.status}.`);
  }

  if (!('job_id' in body) || !body.job_id || !body.status_url) {
    throw new Error('Worker response did not include a generated model job.');
  }

  return {
    id: body.job_id,
    label: body.label ?? body.job_id,
    status: 'running',
    statusUrl: body.status_url,
  };
}

export async function listGeneratedModels({
  apiUrl,
  fetchImpl = fetch,
}: ListGeneratedModelsInput): Promise<ModelOption[]> {
  if (!apiUrl) {
    return [];
  }

  const response = await fetchImpl(`${apiUrl.replace(/\/+$/, '')}/models`);
  const body = (await response.json()) as WorkerGeneratedModelsResponse | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Model list failed with HTTP ${response.status}.`);
  }

  const modelList = body as WorkerGeneratedModelsResponse;
  return (modelList.models ?? [])
    .filter((model: WorkerGeneratedModelEntry) => model.id && model.label && model.model_url)
    .map((model: WorkerGeneratedModelEntry) => ({
      id: `generated-${model.id}`,
      label: model.label,
      url: model.model_url,
    }));
}

export async function generateModelFromImage({
  apiUrl,
  imageBase64,
  imageMimeType,
  targetObject,
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
    body: JSON.stringify(createGenerateModelRequestBody(imageBase64, imageMimeType, targetObject)),
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

function createGenerateModelRequestBody(
  imageBase64: string,
  imageMimeType: string,
  targetObject?: string,
): Record<string, string> {
  const body: Record<string, string> = {
    image_base64: imageBase64,
    image_mime_type: imageMimeType,
  };
  const trimmedTargetObject = targetObject?.trim();
  if (trimmedTargetObject) {
    body.target_object = trimmedTargetObject;
  }
  return body;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
