import type { ModelOption, ModelVisibility } from '../app/models';
import type { CompressedThumbnail } from '../capture/thumbnailCompression';

export interface GenerateModelInput {
  apiUrl: string;
  imageBase64: string;
  imageMimeType: string;
  targetObject?: string;
  generationPipeline?: GenerationPipeline;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  maxPolls?: number;
}

export interface GenerateSpeechModelInput {
  apiUrl: string;
  audioBase64: string;
  audioMimeType: string;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  maxPolls?: number;
}

export type GenerationPipeline = 'trellis' | 'openai-to-3d' | 'dynamic';
export type GenerationStage =
  | 'speech_input'
  | 'detecting_speech'
  | 'generating_image'
  | 'generating_3d'
  | 'completed'
  | 'failed';

export interface GeneratedModelResult {
  modelUrl: string;
  objectKey: string;
  bytes: number;
  transcript?: string;
  prompt?: string;
}

export interface ExtractedImageResult {
  imageBase64: string;
  imageMimeType: string;
  targetObject: string | null;
}

export interface StartGeneratedModelJobResult {
  id: string;
  label: string;
  status: 'running';
  statusUrl: string;
}

export interface StartSpeechModelJobResult extends StartGeneratedModelJobResult {
  stage?: GenerationStage;
  transcript?: string;
  prompt?: string;
}

export interface GeneratedModelJobStatus {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  stage?: GenerationStage;
  error?: string;
  transcript?: string;
  prompt?: string;
  modelUrl?: string;
  objectKey?: string;
  previewUrl?: string;
  bytes?: number;
}

interface ListGeneratedModelsInput {
  apiUrl: string;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
}

interface GeneratedModelJobStatusInput {
  statusUrl: string;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
}

interface RenameGeneratedModelInput {
  apiUrl: string;
  modelId: string;
  label: string;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
}

interface UpdateGeneratedModelThumbnailInput {
  apiUrl: string;
  modelId: string;
  thumbnail: CompressedThumbnail;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
}

interface DeleteGeneratedModelInput {
  apiUrl: string;
  modelId: string;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
}

interface ToggleGeneratedModelVisibilityInput {
  apiUrl: string;
  modelId: string;
  visibility: ModelVisibility;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
}

interface AdminJobsInput {
  apiUrl: string;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
}

interface RetryAdminJobInput extends AdminJobsInput {
  jobId: string;
}

interface StoreUploadedModelInput {
  apiUrl: string;
  file: File;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
}

interface WorkerSuccessResponse {
  model_url: string;
  object_key: string;
  bytes: number;
}

interface WorkerExtractImageResponse {
  image_base64: string;
  image_mime_type: string;
  target_object: string | null;
}

interface WorkerErrorResponse {
  error?: string;
}

interface WorkerJobResponse {
  id?: string;
  job_id?: string;
  label?: string;
  status?: string;
  stage?: string;
  status_url?: string;
  error?: string;
  transcript?: string;
  prompt?: string;
  source_transcript?: string;
  generation_prompt?: string;
  model_url?: string;
  object_key?: string;
  preview_url?: string;
  bytes?: number;
}

interface WorkerGeneratedModelEntry {
  id: string;
  label: string;
  model_url: string;
  object_key: string;
  preview_url?: string;
  source?: string;
  owner_email?: string;
  visibility?: ModelVisibility;
  bytes?: number;
  completed_at?: string;
  updated_at?: string;
}

interface WorkerGeneratedModelsResponse {
  models?: WorkerGeneratedModelEntry[];
}

interface WorkerAdminJobEntry {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  error?: string;
  owner_email?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  failed_at?: string;
  bytes?: number;
  model_url?: string;
  preview_url?: string;
}

interface WorkerAdminJobsResponse {
  jobs?: WorkerAdminJobEntry[];
}

export interface AdminJobEntry {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  error?: string;
  ownerEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  failedAt?: string;
  bytes?: number;
  modelUrl?: string;
  previewUrl?: string;
}

export async function startGeneratedModelJob({
  apiUrl,
  imageBase64,
  imageMimeType,
  targetObject,
  generationPipeline = 'trellis',
  authToken,
  fetchImpl = fetch,
}: GenerateModelInput): Promise<StartGeneratedModelJobResult> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(generateModelUrlForPipeline(apiUrl, generationPipeline), {
    method: 'POST',
    headers: jsonHeaders(authToken),
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

export async function startSpeechModelJob({
  apiUrl,
  audioBase64,
  audioMimeType,
  authToken,
  fetchImpl = fetch,
}: GenerateSpeechModelInput): Promise<StartSpeechModelJobResult> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  if (!audioBase64.trim()) {
    throw new Error('Record speech before generating a 3D model.');
  }

  const response = await fetchImpl(speechGenerateUrlFromGenerateUrl(apiUrl), {
    method: 'POST',
    headers: jsonHeaders(authToken),
    body: JSON.stringify({
      audio_base64: audioBase64,
      audio_mime_type: audioMimeType || 'audio/webm',
    }),
  });

  const body = (await response.json()) as WorkerJobResponse | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Speech generation failed with HTTP ${response.status}.`);
  }

  if (!('job_id' in body) || !body.job_id || !body.status_url) {
    throw new Error('Worker response did not include a speech generation job.');
  }

  return {
    id: body.job_id,
    label: body.label ?? body.job_id,
    status: 'running',
    statusUrl: body.status_url,
    ...(isGenerationStage(body.stage) ? { stage: body.stage } : {}),
    ...(body.transcript ? { transcript: body.transcript } : {}),
    ...(body.prompt ? { prompt: body.prompt } : {}),
  };
}

export async function getGeneratedModelJobStatus({
  statusUrl,
  authToken,
  fetchImpl = fetch,
}: GeneratedModelJobStatusInput): Promise<GeneratedModelJobStatus> {
  if (!statusUrl) {
    throw new Error('Job status URL is not configured.');
  }

  const response = authToken
    ? await fetchImpl(statusUrl, { headers: authHeaders(authToken) })
    : await fetchImpl(statusUrl);
  const body = (await response.json()) as WorkerJobResponse | WorkerErrorResponse;
  if (!response.ok && response.status !== 202) {
    throw new Error('error' in body && body.error ? body.error : `Generation failed with HTTP ${response.status}.`);
  }

  return mapGeneratedModelJobStatus(body);
}

export async function extractImageFor3D({
  apiUrl,
  imageBase64,
  imageMimeType,
  targetObject,
  authToken,
  fetchImpl = fetch,
}: GenerateModelInput): Promise<ExtractedImageResult> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(extractImageUrlFromGenerateUrl(apiUrl), {
    method: 'POST',
    headers: jsonHeaders(authToken),
    body: JSON.stringify(createGenerateModelRequestBody(imageBase64, imageMimeType, targetObject)),
  });

  const body = (await response.json()) as WorkerExtractImageResponse | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Image extraction failed with HTTP ${response.status}.`);
  }

  if (!('image_base64' in body) || !body.image_base64 || !body.image_mime_type) {
    throw new Error('Worker response did not include an extracted image.');
  }

  return {
    imageBase64: body.image_base64,
    imageMimeType: body.image_mime_type,
    targetObject: body.target_object ?? null,
  };
}

export async function listGeneratedModels({
  apiUrl,
  authToken,
  fetchImpl = fetch,
}: ListGeneratedModelsInput): Promise<ModelOption[]> {
  if (!apiUrl) {
    return [];
  }

  const response = authToken
    ? await fetchImpl(`${apiUrl.replace(/\/+$/, '')}/models`, { headers: authHeaders(authToken) })
    : await fetchImpl(`${apiUrl.replace(/\/+$/, '')}/models`);
  const body = (await response.json()) as WorkerGeneratedModelsResponse | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Model list failed with HTTP ${response.status}.`);
  }

  const modelList = body as WorkerGeneratedModelsResponse;
  return (modelList.models ?? [])
    .filter((model: WorkerGeneratedModelEntry) => model.id && model.label && model.model_url)
    .map(mapGeneratedModelEntry);
}

export async function toggleGeneratedModelVisibility({
  apiUrl,
  modelId,
  visibility,
  authToken,
  fetchImpl = fetch,
}: ToggleGeneratedModelVisibilityInput): Promise<ModelOption> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(generatedModelItemUrl(apiUrl, modelId), {
    method: 'PATCH',
    headers: jsonHeaders(authToken),
    body: JSON.stringify({ visibility }),
  });
  const body = (await response.json()) as WorkerGeneratedModelEntry | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Visibility update failed with HTTP ${response.status}.`);
  }

  if (!('id' in body) || !body.id || !body.label || !body.model_url) {
    throw new Error('Worker response did not include the updated model.');
  }

  return mapGeneratedModelEntry(body);
}

export async function listAdminJobs({
  apiUrl,
  authToken,
  fetchImpl = fetch,
}: AdminJobsInput): Promise<AdminJobEntry[]> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(`${apiUrl.replace(/\/+$/, '')}/jobs`, {
    headers: authHeaders(authToken),
  });
  const body = (await response.json()) as WorkerAdminJobsResponse | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Admin jobs failed with HTTP ${response.status}.`);
  }

  return ((body as WorkerAdminJobsResponse).jobs ?? []).map(mapAdminJobEntry);
}

export async function retryAdminJob({
  apiUrl,
  jobId,
  authToken,
  fetchImpl = fetch,
}: RetryAdminJobInput): Promise<AdminJobEntry> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(`${apiUrl.replace(/\/+$/, '')}/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
    headers: authHeaders(authToken),
  });
  const body = (await response.json()) as WorkerAdminJobEntry | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Job retry failed with HTTP ${response.status}.`);
  }
  if (!('id' in body) || !body.id || !body.status) {
    throw new Error('Worker response did not include the retried job.');
  }

  return mapAdminJobEntry(body);
}

export async function cleanupFailedJobArtifacts({
  apiUrl,
  authToken,
  fetchImpl = fetch,
}: AdminJobsInput): Promise<{ cleaned: number }> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(`${apiUrl.replace(/\/+$/, '')}/jobs/cleanup`, {
    method: 'POST',
    headers: authHeaders(authToken),
  });
  const body = (await response.json()) as { cleaned?: number } | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Cleanup failed with HTTP ${response.status}.`);
  }

  return { cleaned: 'cleaned' in body && typeof body.cleaned === 'number' ? body.cleaned : 0 };
}

export async function renameGeneratedModel({
  apiUrl,
  modelId,
  label,
  authToken,
  fetchImpl = fetch,
}: RenameGeneratedModelInput): Promise<ModelOption> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    throw new Error('Enter a model name before renaming.');
  }

  const response = await fetchImpl(generatedModelItemUrl(apiUrl, modelId), {
    method: 'PATCH',
    headers: jsonHeaders(authToken),
    body: JSON.stringify({ label: trimmedLabel }),
  });
  const body = (await response.json()) as WorkerGeneratedModelEntry | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Model rename failed with HTTP ${response.status}.`);
  }

  if (!('id' in body) || !body.id || !body.label || !body.model_url) {
    throw new Error('Worker response did not include the renamed model.');
  }

  return mapGeneratedModelEntry(body);
}

export async function updateGeneratedModelThumbnail({
  apiUrl,
  modelId,
  thumbnail,
  authToken,
  fetchImpl = fetch,
}: UpdateGeneratedModelThumbnailInput): Promise<ModelOption> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  if (!thumbnail.base64 || !thumbnail.mimeType.startsWith('image/')) {
    throw new Error('Choose an image file for the thumbnail.');
  }

  const response = await fetchImpl(generatedModelItemUrl(apiUrl, modelId), {
    method: 'PATCH',
    headers: jsonHeaders(authToken),
    body: JSON.stringify({
      preview_base64: thumbnail.base64,
      preview_mime_type: thumbnail.mimeType,
    }),
  });
  const body = (await response.json()) as WorkerGeneratedModelEntry | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Thumbnail update failed with HTTP ${response.status}.`);
  }

  if (!('id' in body) || !body.id || !body.label || !body.model_url) {
    throw new Error('Worker response did not include the updated model.');
  }

  return mapGeneratedModelEntry(body);
}

export async function storeUploadedModel({
  apiUrl,
  file,
  authToken,
  fetchImpl = fetch,
}: StoreUploadedModelInput): Promise<ModelOption> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  if (!file.name.toLowerCase().endsWith('.glb')) {
    throw new Error('Choose a .glb model file.');
  }

  const response = await fetchImpl(`${apiUrl.replace(/\/+$/, '')}/models/upload`, {
    method: 'POST',
    headers: jsonHeaders(authToken),
    body: JSON.stringify({
      file_name: file.name,
      label: uploadedModelLabel(file.name),
      model_mime_type: file.type || 'model/gltf-binary',
      model_base64: arrayBufferToBase64(await file.arrayBuffer()),
    }),
  });
  const body = (await response.json()) as WorkerGeneratedModelEntry | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Model upload failed with HTTP ${response.status}.`);
  }

  if (!('id' in body) || !body.id || !body.label || !body.model_url) {
    throw new Error('Worker response did not include the stored model.');
  }

  return mapGeneratedModelEntry(body);
}

export async function deleteGeneratedModel({
  apiUrl,
  modelId,
  authToken,
  fetchImpl = fetch,
}: DeleteGeneratedModelInput): Promise<void> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(generatedModelItemUrl(apiUrl, modelId), {
    method: 'DELETE',
    headers: authHeaders(authToken),
  });
  const body = (await response.json()) as { deleted?: boolean } | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Model delete failed with HTTP ${response.status}.`);
  }
}

export async function generateModelFromImage({
  apiUrl,
  imageBase64,
  imageMimeType,
  targetObject,
  generationPipeline = 'trellis',
  authToken,
  fetchImpl = fetch,
  pollIntervalMs = 5000,
  maxPolls = 180,
}: GenerateModelInput): Promise<GeneratedModelResult> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(generateModelUrlForPipeline(apiUrl, generationPipeline), {
    method: 'POST',
    headers: jsonHeaders(authToken),
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

    return pollGeneratedModel(job.status_url, fetchImpl, pollIntervalMs, maxPolls, authToken);
  }

  return parseGeneratedModelResult(body);
}

export async function generateModelFromSpeech({
  apiUrl,
  audioBase64,
  audioMimeType,
  authToken,
  fetchImpl = fetch,
  pollIntervalMs = 5000,
  maxPolls = 180,
}: GenerateSpeechModelInput): Promise<GeneratedModelResult> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  if (!audioBase64.trim()) {
    throw new Error('Record speech before generating a 3D model.');
  }

  const response = await fetchImpl(speechGenerateUrlFromGenerateUrl(apiUrl), {
    method: 'POST',
    headers: jsonHeaders(authToken),
    body: JSON.stringify({
      audio_base64: audioBase64,
      audio_mime_type: audioMimeType || 'audio/webm',
    }),
  });

  const body = (await response.json()) as WorkerJobResponse | WorkerErrorResponse;
  if (!response.ok) {
    throw new Error('error' in body && body.error ? body.error : `Speech generation failed with HTTP ${response.status}.`);
  }

  if (!('job_id' in body) || !body.status_url) {
    throw new Error('Worker response did not include a speech generation job.');
  }

  const result = await pollGeneratedModel(body.status_url, fetchImpl, pollIntervalMs, maxPolls, authToken);
  return {
    ...result,
    transcript: body.transcript,
    prompt: body.prompt,
  };
}

async function pollGeneratedModel(
  statusUrl: string,
  fetchImpl: typeof fetch,
  pollIntervalMs: number,
  maxPolls: number,
  authToken?: string | null,
): Promise<GeneratedModelResult> {
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0 && pollIntervalMs > 0) {
      await delay(pollIntervalMs);
    }

    const response = authToken
      ? await fetchImpl(statusUrl, { headers: authHeaders(authToken) })
      : await fetchImpl(statusUrl);
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

function mapGeneratedModelJobStatus(body: WorkerJobResponse | WorkerErrorResponse): GeneratedModelJobStatus {
  const jobId = 'id' in body && body.id ? body.id : 'job_id' in body && body.job_id ? body.job_id : '';
  const status = 'status' in body && isJobStatus(body.status) ? body.status : 'running';
  const stage = 'stage' in body && isGenerationStage(body.stage) ? body.stage : undefined;
  if (!jobId) {
    throw new Error('Worker response did not include a generated model job.');
  }

  return {
    id: jobId,
    label: ('label' in body && body.label) || jobId,
    status,
    ...(stage ? { stage } : {}),
    ...('error' in body && body.error ? { error: body.error } : {}),
    ...('source_transcript' in body && body.source_transcript
      ? { transcript: body.source_transcript }
      : 'transcript' in body && body.transcript
        ? { transcript: body.transcript }
        : {}),
    ...('generation_prompt' in body && body.generation_prompt
      ? { prompt: body.generation_prompt }
      : 'prompt' in body && body.prompt
        ? { prompt: body.prompt }
        : {}),
    ...('model_url' in body && body.model_url ? { modelUrl: body.model_url } : {}),
    ...('object_key' in body && body.object_key ? { objectKey: body.object_key } : {}),
    ...('preview_url' in body && body.preview_url ? { previewUrl: body.preview_url } : {}),
    ...('bytes' in body && typeof body.bytes === 'number' ? { bytes: body.bytes } : {}),
  };
}

function isJobStatus(status: unknown): status is GeneratedModelJobStatus['status'] {
  return status === 'running' || status === 'completed' || status === 'failed';
}

function isGenerationStage(stage: unknown): stage is GenerationStage {
  return (
    stage === 'speech_input' ||
    stage === 'detecting_speech' ||
    stage === 'generating_image' ||
    stage === 'generating_3d' ||
    stage === 'completed' ||
    stage === 'failed'
  );
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

function jsonHeaders(authToken?: string | null): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...authHeaders(authToken),
  };
}

function authHeaders(authToken?: string | null): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

function extractImageUrlFromGenerateUrl(apiUrl: string): string {
  return apiUrl.replace(/\/generate-3d\/?$/, '/extract-image');
}

function generateModelUrlForPipeline(apiUrl: string, generationPipeline: GenerationPipeline): string {
  if (generationPipeline === 'openai-to-3d') {
    return apiUrl.replace(/\/+$/, '').replace(/\/generate-3d$/, '/generate-3d/openai');
  }

  if (generationPipeline === 'dynamic') {
    return apiUrl.replace(/\/+$/, '').replace(/\/generate-3d$/, '/generate-3d/dynamic');
  }

  return apiUrl;
}

function speechGenerateUrlFromGenerateUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '').replace(/\/generate-3d$/, '/generate-3d/speech');
}

function mapGeneratedModelEntry(model: WorkerGeneratedModelEntry): ModelOption {
  const option: ModelOption = {
    id: `generated-${model.id}`,
    label: model.label,
    url: model.model_url,
  };
  if (model.preview_url) {
    option.previewUrl = model.preview_url;
  }
  if (model.source === 'uploaded') {
    option.source = 'uploaded';
  }
  if (model.owner_email) {
    option.ownerEmail = model.owner_email;
  }
  if (model.visibility) {
    option.visibility = model.visibility;
  }
  if (typeof model.bytes === 'number') {
    option.bytes = model.bytes;
  }
  if (model.completed_at) {
    option.createdAt = model.completed_at;
  }
  if (model.updated_at) {
    option.updatedAt = model.updated_at;
  }
  return option;
}

function mapAdminJobEntry(job: WorkerAdminJobEntry): AdminJobEntry {
  return {
    id: job.id,
    label: job.label,
    status: job.status,
    ...(job.error ? { error: job.error } : {}),
    ...(job.owner_email ? { ownerEmail: job.owner_email } : {}),
    ...(job.created_at ? { createdAt: job.created_at } : {}),
    ...(job.updated_at ? { updatedAt: job.updated_at } : {}),
    ...(job.completed_at ? { completedAt: job.completed_at } : {}),
    ...(job.failed_at ? { failedAt: job.failed_at } : {}),
    ...(typeof job.bytes === 'number' ? { bytes: job.bytes } : {}),
    ...(job.model_url ? { modelUrl: job.model_url } : {}),
    ...(job.preview_url ? { previewUrl: job.preview_url } : {}),
  };
}

function generatedModelItemUrl(apiUrl: string, modelId: string): string {
  const workerModelId = modelId.startsWith('generated-') ? modelId.slice('generated-'.length) : modelId;
  return `${apiUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(workerModelId)}`;
}

function uploadedModelLabel(fileName: string): string {
  return fileName.replace(/\.glb$/i, '').trim() || 'Uploaded model';
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
