export interface GenerateModelInput {
  apiUrl: string;
  imageBase64: string;
  imageMimeType: string;
  fetchImpl?: typeof fetch;
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

export async function generateModelFromImage({
  apiUrl,
  imageBase64,
  imageMimeType,
  fetchImpl = fetch,
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

  if (!('model_url' in body) || !body.model_url || !body.object_key) {
    throw new Error('Worker response did not include a generated model URL.');
  }

  return {
    modelUrl: body.model_url,
    objectKey: body.object_key,
    bytes: body.bytes,
  };
}
