import {
  normalizeEntitlementOverrides,
  normalizePlanId,
  resolveAccountAccess,
  resolveEffectiveEntitlements,
  type AccountAccess,
  type AccountStatus,
  type EffectiveEntitlements,
  type EntitlementOverrides,
  type FeatureKey,
  type PlanId,
} from './entitlements';

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
  ALLOWED_ORIGINS?: string;
  MUTATION_COORDINATOR?: DurableObjectNamespace;
  MODAL_KEY: string;
  MODAL_SECRET: string;
  MODAL_IMAGE_TO_3D_URL: string;
  MODAL_IMAGE_TO_3D_START_URL: string;
  MODAL_IMAGE_TO_3D_RESULT_URL: string;
  MODAL_OPENAI_TO_3D_URL: string;
  MODAL_OPENAI_TO_3D_START_URL: string;
  MODAL_OPENAI_TO_3D_RESULT_URL: string;
  MODAL_OBJECT_PREPROCESS_QUALITY_URL?: string;
  MODAL_OBJECT_SEGMENTATION_URL?: string;
  OPENAI_API_KEY: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  OPENAI_PROMPT_MODEL?: string;
  OPENAI_IMAGE_MODEL?: string;
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

export interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): {
    fetch(request: Request): Promise<Response>;
  };
}

export interface DurableObjectState {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  blockConcurrencyWhile<T>(operation: () => Promise<T>): Promise<T>;
}

type MutationLeaseRequest =
  | { action: 'acquire'; leaseId: string; ttlMs: number }
  | { action: 'release'; leaseId: string };

export class MutationCoordinator {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return mutationCoordinatorResponse({ error: 'Only POST requests are supported.' }, 405);
    }

    let body: MutationLeaseRequest;
    try {
      body = await request.json() as MutationLeaseRequest;
    } catch {
      return mutationCoordinatorResponse({ error: 'Request body must be valid JSON.' }, 400);
    }
    if (!body || (body.action !== 'acquire' && body.action !== 'release') || !validLeaseId(body.leaseId)) {
      return mutationCoordinatorResponse({ error: 'Valid mutation lease fields are required.' }, 400);
    }

    return this.state.blockConcurrencyWhile(async () => {
      const activeLeaseId = await this.state.storage.get<string>('lease_id');
      const expiresAt = await this.state.storage.get<number>('lease_expires_at') ?? 0;
      const now = Date.now();
      const leaseActive = Boolean(activeLeaseId && expiresAt > now);

      if (body.action === 'release') {
        if (!leaseActive || activeLeaseId !== body.leaseId) {
          return mutationCoordinatorResponse({ released: false }, 409);
        }
        await Promise.all([
          this.state.storage.delete('lease_id'),
          this.state.storage.delete('lease_expires_at'),
        ]);
        return mutationCoordinatorResponse({ released: true });
      }

      if (!Number.isFinite(body.ttlMs) || body.ttlMs <= 0) {
        return mutationCoordinatorResponse({ error: 'ttlMs must be a positive number.' }, 400);
      }
      if (leaseActive && activeLeaseId !== body.leaseId) {
        return mutationCoordinatorResponse({ acquired: false }, 409);
      }

      const ttlMs = Math.min(30_000, Math.max(1000, Math.trunc(body.ttlMs)));
      await Promise.all([
        this.state.storage.put('lease_id', body.leaseId),
        this.state.storage.put('lease_expires_at', now + ttlMs),
      ]);
      return mutationCoordinatorResponse({ acquired: true });
    });
  }
}

function mutationCoordinatorResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validLeaseId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
}

interface GenerateModelDeps {
  fetch: typeof fetch;
  now: () => Date;
  randomUUID?: () => string;
}

interface GenerateModelRequestBody {
  image_base64?: unknown;
  image_mime_type?: unknown;
  target_object?: unknown;
}

interface SegmentationRequestBody {
  image_base64?: unknown;
  image_mime_type?: unknown;
}

interface SegmentationResponseBody {
  detected?: unknown;
  mask_base64?: unknown;
  mask_mime_type?: unknown;
  bounds?: unknown;
  confidence?: unknown;
}

interface GenerateSpeechRequestBody {
  audio_base64?: unknown;
  audio_mime_type?: unknown;
}

interface GenerateTextRequestBody {
  text?: unknown;
}

interface DynamicImageResponse {
  image_base64?: unknown;
  image_format?: unknown;
  image_mime_type?: unknown;
  error?: unknown;
  detail?: unknown;
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
  visibility?: unknown;
}

interface AuthRequestBody {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  status?: unknown;
  plan?: unknown;
  entitlement_overrides?: unknown;
}

type GenerationPipeline = 'trellis' | 'openai-to-3d' | 'dynamic' | 'speech' | 'text';
type GenerationStage =
  | 'speech_input'
  | 'detecting_speech'
  | 'generating_image'
  | 'generating_3d'
  | 'completed'
  | 'failed';
type AuthRole = 'admin' | 'user';
type ModelVisibility = 'public' | 'private';

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
  plan?: PlanId;
  entitlement_overrides?: EntitlementOverrides;
}

interface UsersIndex {
  users: StoredUser[];
}

interface SessionPayload {
  sub: string;
  role: AuthRole;
  jti: string;
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
  stage?: GenerationStage;
  modal_call_id?: string;
  source_transcript?: string;
  generation_prompt?: string;
  audio_object_key?: string;
  audio_mime_type?: string;
  owner_email?: string;
  visibility?: ModelVisibility;
  model_url?: string;
  object_key?: string;
  preview_url?: string;
  preview_object_key?: string;
  bytes?: number;
}

interface JobsIndex {
  pending: string[];
}

interface JobsHistoryIndex {
  jobs: string[];
}

interface RevokedSessionsIndex {
  revoked: string[];
}

interface RateLimitEntry {
  count: number;
  reset_at: string;
}

interface AuditLogIndex {
  events: AuditEvent[];
}

interface AuditEvent {
  actor: string;
  action: string;
  target?: string;
  status: string;
  created_at: string;
  metadata?: Record<string, string | number | boolean | null>;
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
  owner_email?: string;
  visibility?: ModelVisibility;
  source?: 'uploaded';
}

interface GeneratedModelsIndex {
  models: GeneratedModelEntry[];
}

type ImageTargetVisibility = ModelVisibility;
type ImageTargetAccessMode = 'anyone_with_link' | 'any_signed_in' | 'owner_only' | 'specific_accounts';

type ImageTargetPlacement = {
  scale: number;
  offset_x: number;
  offset_y: number;
  height: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
};

type ImageTargetSpinAxis = 'none' | 'x' | 'y' | 'z';
type ImageTargetAnimationPreset = 'none' | 'gentle-float' | 'turntable' | 'showcase' | 'sway' | 'pulse' | 'orbit' | 'bounce' | 'custom';
type ImageTargetAnimationProperty = 'position_x' | 'position_y' | 'position_z' | 'rotation_x' | 'rotation_y' | 'rotation_z' | 'scale';
type ImageTargetAnimationMotion = 'smooth' | 'triangle' | 'spin';

type ImageTargetAnimationTrack = {
  property: ImageTargetAnimationProperty;
  motion: ImageTargetAnimationMotion;
  amount: number;
  speed: number;
  phase: number;
};

type ImageTargetAnimation = {
  preset?: ImageTargetAnimationPreset;
  tracks?: ImageTargetAnimationTrack[];
  spin_axis?: ImageTargetSpinAxis;
  spin_speed?: number;
  bob_height?: number;
  bob_speed?: number;
};

type ImageTargetModel = {
  id: string;
  label: string;
  url: string;
  preview_url?: string;
};

type ImageTargetText = {
  value: string;
  language: 'english' | 'german' | 'tamil';
  font: string;
  color: string;
  fill_mode: 'solid' | 'gradient';
  gradient_start: string;
  gradient_end: string;
  gradient_direction: 'horizontal' | 'vertical' | 'diagonal' | 'depth';
  side_color: string;
  depth: number;
  bevel: number;
  gloss: number;
  style_preset: string;
};

type ImageTargetObjectBase = {
  id: string;
  placement: ImageTargetPlacement;
  animation?: ImageTargetAnimation;
  group_id?: string;
  local_placement?: ImageTargetPlacement;
};

type ImageTargetModelObject = ImageTargetObjectBase & { kind: 'model'; model: ImageTargetModel };
type ImageTargetTextObject = ImageTargetObjectBase & { kind: 'text'; text: ImageTargetText };
type ImageTargetObject = ImageTargetModelObject | ImageTargetTextObject;

type ImageTargetGroup = {
  id: string;
  label: string;
  placement: ImageTargetPlacement;
  animation: ImageTargetAnimation;
};

type ImageTargetEntry = {
  id: string;
  label: string;
  image_url: string;
  image_object_key: string;
  model?: ImageTargetModel;
  placement?: ImageTargetPlacement;
  objects: ImageTargetObject[];
  groups: ImageTargetGroup[];
  owner_email?: string;
  visibility?: ImageTargetVisibility;
  scan_id?: string;
  access_mode?: ImageTargetAccessMode;
  allowed_emails?: string[];
  created_at: string;
  updated_at: string;
};

type ImageTargetsIndex = {
  targets: ImageTargetEntry[];
};

type ImageTargetRequestBody = {
  label?: unknown;
  image_base64?: unknown;
  image_mime_type?: unknown;
  model?: unknown;
  placement?: unknown;
  objects?: unknown;
  groups?: unknown;
  visibility?: unknown;
  access_mode?: unknown;
  allowed_emails?: unknown;
};

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
const jobHistoryIndexKey = 'models/generated/jobs/history.json';
const jobKeyPrefix = 'models/generated/jobs/';
const speechAudioKeyPrefix = 'models/generated/speech-audio/';
const imageTargetsIndexKey = 'image-targets/index.json';
const imageTargetRecordPrefix = 'image-targets/records/';
const imageTargetImagePrefix = 'image-targets/images/';
const maxImageTargetBytes = 5 * 1024 * 1024;
const maxSegmentationImageBytes = 5 * 1024 * 1024;
const segmentationTimeoutMs = 60_000;
const allowedSegmentationMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedImageTargetMimeTypes = ['image/png', 'image/jpeg', 'image/webp'] as const;
const imageTargetTextLanguages = new Set(['english', 'german', 'tamil']);
const imageTargetTextFonts = new Set([
  'studio-sans', 'studio-sans-bold', 'studio-serif', 'studio-serif-bold',
  'droid-serif', 'droid-serif-bold', 'optimer', 'optimer-bold',
  'helvetiker', 'helvetiker-bold', 'studio-mono', 'tamil-ui',
]);
const imageTargetTextFillModes = new Set(['solid', 'gradient']);
const imageTargetTextGradientDirections = new Set(['horizontal', 'vertical', 'diagonal', 'depth']);
const imageTargetTextStylePresets = new Set(['blue-shine', 'gold-bevel', 'neon-cyan', 'red-gloss', 'tamil-classic']);
const usersIndexKey = 'auth/users/index.json';
const revokedSessionsIndexKey = 'auth/sessions/revoked.json';
const auditLogIndexKey = 'security/audit/events.json';
const rateLimitKeyPrefix = 'security/rate-limit/';
const defaultAdminEmail = 'sshibinthomass@gmail.com';
const defaultAllowedOrigins = [
  'https://sshibinthomass.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5182',
  'http://localhost:5182',
];
const localDevelopmentHostnames = new Set(['127.0.0.1', 'localhost', '[::1]']);
const passwordHashIterations = 100_000;
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  fetch(request: Request, env: WorkerEnv, ctx?: ExecutionContext): Promise<Response> {
    return handleGenerateModelRequest(request, env, {
      fetch: (input, init) => fetch(input, init),
      now: () => new Date(),
    }, ctx);
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
  ctx?: ExecutionContext,
): Promise<Response> {
  const response = await routeGenerateModelRequest(request, env, deps, ctx);
  return applyCorsHeaders(response, request, env);
}

async function routeGenerateModelRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  ctx?: ExecutionContext,
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

  if (request.method === 'GET' && url.pathname.startsWith('/image-targets/images/')) {
    return serveImageTarget(url.pathname.slice(1), env);
  }

  if (request.method === 'GET' && url.pathname === '/generate-3d/models') {
    const index = await readGeneratedModelsIndex(env);
    const auth = await readOptionalApprovedUser(request, env, deps);
    const visibleModels = index.models.filter((model) => isModelVisibleToUser(model, auth?.user ?? null));
    return jsonResponse({
      models: visibleModels.sort((left, right) => right.completed_at.localeCompare(left.completed_at)),
    });
  }

  if (request.method === 'POST' && url.pathname === '/generate-3d/models/upload') {
    const auth = await requireApprovedUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    return handleUploadedModelRequest(request, env, deps, url, auth.user);
  }

  const imageTargetScanPrefix = '/generate-3d/image-targets/scan/';
  if (request.method === 'GET' && url.pathname.startsWith(imageTargetScanPrefix)) {
    const scanId = decodeURIComponent(url.pathname.slice(imageTargetScanPrefix.length));
    return handleImageTargetScanRequest(request, env, deps, scanId);
  }

  const rotateImageTargetLinkMatch = url.pathname.match(
    /^\/generate-3d\/image-targets\/([^/]+)\/rotate-link$/,
  );
  if (request.method === 'POST' && rotateImageTargetLinkMatch) {
    const auth = await requireAdminUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    const targetId = decodeURIComponent(rotateImageTargetLinkMatch[1]);
    return withMutationLease(env, 'targets', async () => {
      const currentAdmin = await reloadStoredUser(env, auth.user.email);
      if (
        !currentAdmin
        || currentAdmin.status !== 'active'
        || currentAdmin.role !== 'admin'
        || currentAdmin.email !== getAdminEmail(env)
      ) {
        return jsonResponse({ error: 'Admin access required.' }, 403);
      }
      return rotateImageTargetScanLink(env, deps, targetId, currentAdmin);
    });
  }

  if (request.method === 'GET' && url.pathname === '/generate-3d/image-targets') {
    const index = await readImageTargetsIndex(env);
    const auth = await readOptionalStoredUser(request, env, deps);
    if (auth && auth.user.status !== 'active') {
      return jsonResponse({
        error: auth?.user.status === 'disabled'
          ? 'Account disabled by admin.'
          : 'Account pending admin approval.',
      }, 403);
    }
    if (auth) {
      await ensureImageTargetScanIds(env, index, auth.user, deps);
    }
    const access = auth ? markArAccessContext(auth.user, index) : null;
    const visibleTargets = access?.account.state === 'over_quota'
      ? index.targets.filter((target) => target.owner_email === auth?.user.email)
      : index.targets.filter((target) => isImageTargetVisibleToUser(target, auth?.user ?? null));
    return jsonResponse({
      targets: visibleTargets.sort((left, right) => right.created_at.localeCompare(left.created_at)),
    });
  }

  if (request.method === 'POST' && url.pathname === '/generate-3d/image-targets') {
    const auth = await requireApprovedUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    return withMutationLease(env, 'targets', async () => {
      const currentUser = await reloadStoredUser(env, auth.user.email);
      if (!currentUser || currentUser.status !== 'active') {
        return jsonResponse({ error: 'Login required.' }, 401);
      }
      return handleImageTargetCreateRequest(request, env, deps, url, currentUser);
    });
  }

  if (url.pathname.startsWith('/generate-3d/image-targets/')) {
    const auth = await requireApprovedUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    const targetId = decodeURIComponent(url.pathname.replace('/generate-3d/image-targets/', ''));
    return withMutationLease(env, 'targets', async () => {
      const currentUser = await reloadStoredUser(env, auth.user.email);
      if (!currentUser || currentUser.status !== 'active') {
        return jsonResponse({ error: 'Login required.' }, 401);
      }
      return handleImageTargetManagementRequest(request, env, deps, url, targetId, currentUser);
    });
  }

  if (url.pathname.startsWith('/generate-3d/models/')) {
    const auth = await requireApprovedUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    const modelId = decodeURIComponent(url.pathname.replace('/generate-3d/models/', ''));
    return handleGeneratedModelManagementRequest(request, env, deps, modelId, url, auth.user);
  }

  if (request.method === 'GET' && url.pathname === '/generate-3d/jobs') {
    const auth = await requireAdminUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    return handleAdminJobsList(env);
  }

  if (request.method === 'POST' && url.pathname === '/generate-3d/jobs/cleanup') {
    const auth = await requireAdminUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    return handleFailedJobArtifactCleanup(env, deps, auth.user);
  }

  if (request.method === 'POST' && url.pathname.startsWith('/generate-3d/jobs/') && url.pathname.endsWith('/retry')) {
    const auth = await requireAdminUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    const jobId = decodeURIComponent(url.pathname.replace('/generate-3d/jobs/', '').replace(/\/retry$/, ''));
    return handleAdminJobRetry(env, deps, jobId, auth.user);
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

  if (
    url.pathname !== '/generate-3d' &&
    url.pathname !== '/generate-3d/openai' &&
    url.pathname !== '/generate-3d/dynamic' &&
    url.pathname !== '/generate-3d/speech' &&
    url.pathname !== '/generate-3d/text' &&
    url.pathname !== '/segment-image' &&
    url.pathname !== '/extract-image'
  ) {
    return jsonResponse({ error: 'Not found.' }, 404);
  }

  const auth = await requireApprovedUser(request, env, deps);
  if (auth instanceof Response) {
    return auth;
  }

  if (url.pathname === '/segment-image') {
    return handleObjectSegmentationRequest(request, env, deps);
  }

  if (url.pathname === '/generate-3d/speech') {
    return handleSpeechGenerationRequest(request, env, deps, url, auth.user, ctx);
  }

  if (url.pathname === '/generate-3d/text') {
    return handleTextGenerationRequest(request, env, deps, url, auth.user, ctx);
  }

  const pipeline = pipelineFromGeneratePath(url.pathname);
  const configError = validateEnv(env, pipeline);
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
    auth.user,
    {
      imageBase64: body.value.image_base64,
      imageMimeType: typeof body.value.image_mime_type === 'string' ? body.value.image_mime_type : 'image/png',
      targetObject,
      pipeline,
    },
  );
}

async function handleObjectSegmentationRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<Response> {
  const endpointUrl = env.MODAL_OBJECT_SEGMENTATION_URL?.trim();
  if (!endpointUrl) {
    return jsonResponse({ error: 'Object segmentation service is unavailable.' }, 503);
  }

  const body = await readJsonBody<SegmentationRequestBody>(request);
  if (
    !body.ok ||
    !body.value ||
    typeof body.value !== 'object' ||
    Array.isArray(body.value) ||
    typeof body.value.image_base64 !== 'string' ||
    typeof body.value.image_mime_type !== 'string' ||
    !allowedSegmentationMimeTypes.has(body.value.image_mime_type)
  ) {
    return jsonResponse({ error: 'Invalid segmentation image payload.' }, 400);
  }

  const decodedByteLength = canonicalBase64DecodedByteLength(body.value.image_base64);
  if (decodedByteLength === null || decodedByteLength === 0 || decodedByteLength > maxSegmentationImageBytes) {
    return jsonResponse({ error: 'Invalid segmentation image payload.' }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), segmentationTimeoutMs);
  try {
    let modalResponse: Response;
    try {
      modalResponse = await deps.fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': env.MODAL_KEY,
          'Modal-Secret': env.MODAL_SECRET,
        },
        body: JSON.stringify({
          image_base64: body.value.image_base64,
          image_mime_type: body.value.image_mime_type,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return jsonResponse({ error: 'Object segmentation service timed out.' }, 504);
      }
      return jsonResponse({ error: 'Object segmentation service request failed.' }, 502);
    }

    if (!modalResponse.ok) {
      return jsonResponse({ error: 'Object segmentation service request failed.' }, 502);
    }

    let modalBody: SegmentationResponseBody;
    try {
      modalBody = (await modalResponse.json()) as SegmentationResponseBody;
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return jsonResponse({ error: 'Object segmentation service timed out.' }, 504);
      }
      return jsonResponse({ error: 'Object segmentation service returned an invalid response.' }, 502);
    }

    if (!modalBody || typeof modalBody !== 'object' || Array.isArray(modalBody) || !isNormalizedConfidence(modalBody.confidence)) {
      return jsonResponse({ error: 'Object segmentation service returned an invalid response.' }, 502);
    }

    if (modalBody.detected === false) {
      return jsonResponse({ detected: false, confidence: modalBody.confidence });
    }

    if (
      modalBody.detected !== true ||
      modalBody.mask_mime_type !== 'image/png' ||
      typeof modalBody.mask_base64 !== 'string' ||
      canonicalBase64DecodedByteLength(modalBody.mask_base64) === null ||
      !hasPngSignature(modalBody.mask_base64) ||
      !isNormalizedSegmentationBounds(modalBody.bounds)
    ) {
      return jsonResponse({ error: 'Object segmentation service returned an invalid response.' }, 502);
    }

    return jsonResponse({
      detected: true,
      mask_base64: modalBody.mask_base64,
      mask_mime_type: 'image/png',
      bounds: {
        x: modalBody.bounds.x,
        y: modalBody.bounds.y,
        width: modalBody.bounds.width,
        height: modalBody.bounds.height,
      },
      confidence: modalBody.confidence,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function canonicalBase64DecodedByteLength(value: string): number | null {
  if (value.length === 0 || value.length % 4 !== 0) {
    return null;
  }

  const paddingLength = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const contentLength = value.length - paddingLength;
  for (let index = 0; index < contentLength; index += 1) {
    const code = value.charCodeAt(index);
    const isBase64Character =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47;
    if (!isBase64Character) {
      return null;
    }
  }

  if (paddingLength > 0) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const finalSextet = alphabet.indexOf(value[value.length - paddingLength - 1] ?? '');
    if ((paddingLength === 2 && (finalSextet & 15) !== 0) || (paddingLength === 1 && (finalSextet & 3) !== 0)) {
      return null;
    }
  }

  return (value.length / 4) * 3 - paddingLength;
}

function hasPngSignature(value: string): boolean {
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  try {
    const prefix = atob(value.slice(0, 12));
    return pngSignature.every((byte, index) => prefix.charCodeAt(index) === byte);
  } catch {
    return false;
  }
}

function isNormalizedConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNormalizedSegmentationBounds(
  value: unknown,
): value is { x: number; y: number; width: number; height: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const bounds = value as Record<string, unknown>;
  return (
    typeof bounds.x === 'number' && Number.isFinite(bounds.x) && bounds.x >= 0 && bounds.x <= 1 &&
    typeof bounds.y === 'number' && Number.isFinite(bounds.y) && bounds.y >= 0 && bounds.y <= 1 &&
    typeof bounds.width === 'number' && Number.isFinite(bounds.width) && bounds.width > 0 &&
    typeof bounds.height === 'number' && Number.isFinite(bounds.height) && bounds.height > 0 &&
    bounds.x + bounds.width <= 1 &&
    bounds.y + bounds.height <= 1
  );
}

async function startModalGenerationJob(
  url: URL,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  user: StoredUser,
  input: {
    imageBase64: string;
    imageMimeType: string;
    targetObject: string | null;
    pipeline: GenerationPipeline;
    sourceTranscript?: string;
    generationPrompt?: string;
  },
): Promise<Response> {
  const modalConfig = modalConfigForPipeline(env, input.pipeline);
  let generationImage = {
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
  };
  if (input.pipeline === 'dynamic') {
    try {
      generationImage = await generateDynamicImageFor3D(input, env, deps);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dynamic image generation failed.';
      return jsonResponse({ error: message }, 502);
    }
  }

  const payload: Record<string, unknown> = {
    image_base64: generationImage.imageBase64,
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
    imageBase64: generationImage.imageBase64,
    imageMimeType: generationImage.imageMimeType,
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
    source_transcript: input.sourceTranscript,
    generation_prompt: input.generationPrompt,
    owner_email: user.email,
    visibility: 'private',
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
      ...(input.sourceTranscript ? { transcript: input.sourceTranscript } : {}),
      ...(input.generationPrompt ? { prompt: input.generationPrompt } : {}),
    },
    202,
  );
}

async function handleSpeechGenerationRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  url: URL,
  user: StoredUser,
  ctx?: ExecutionContext,
): Promise<Response> {
  const configError = validateEnv(env, 'speech');
  if (configError) {
    return jsonResponse({ error: configError }, 500);
  }

  const body = await readJsonBody<GenerateSpeechRequestBody>(request);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400);
  }

  if (typeof body.value.audio_base64 !== 'string' || body.value.audio_base64.length === 0) {
    return jsonResponse({ error: 'audio_base64 is required.' }, 400);
  }

  const audioMimeType =
    typeof body.value.audio_mime_type === 'string' && body.value.audio_mime_type.startsWith('audio/')
      ? body.value.audio_mime_type
      : 'audio/webm';
  const audioBase64 = stripDataUrlPrefix(body.value.audio_base64);

  const now = deps.now();
  const jobId = createSpeechJobId(now, audioBase64);
  const audioObjectKey = await storeSpeechAudio(env, {
    jobId,
    audioBase64,
    audioMimeType,
  });
  const job: StoredJob = {
    id: jobId,
    label: `Speech object - ${formatDisplayTimestamp(now)}`,
    status: 'running',
    stage: 'detecting_speech',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    pipeline: 'speech',
    audio_object_key: audioObjectKey,
    audio_mime_type: audioMimeType,
    owner_email: user.email,
    visibility: 'private',
  };
  await saveJob(env, job);
  await addPendingJob(env, job.id);

  const backgroundJob = processSpeechGenerationJob(
    {
      audioBase64,
      audioMimeType,
      job,
      url,
    },
    env,
    deps,
  );
  if (ctx) {
    ctx.waitUntil(backgroundJob);
  } else {
    void backgroundJob;
  }

  return jsonResponse(
    {
      job_id: job.id,
      label: job.label,
      status: job.status,
      stage: job.stage,
      status_url: `${url.origin}/generate-3d/jobs/${encodeURIComponent(job.id)}`,
    },
    202,
  );
}

async function handleTextGenerationRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  url: URL,
  user: StoredUser,
  ctx?: ExecutionContext,
): Promise<Response> {
  const configError = validateEnv(env, 'text');
  if (configError) {
    return jsonResponse({ error: configError }, 500);
  }

  const body = await readJsonBody<GenerateTextRequestBody>(request);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400);
  }

  const text = typeof body.value.text === 'string' ? body.value.text.trim().replace(/\s+/g, ' ') : '';
  if (!text) {
    return jsonResponse({ error: 'text is required.' }, 400);
  }

  const now = deps.now();
  const job: StoredJob = {
    id: createTextJobId(now, text),
    label: `Text object - ${formatDisplayTimestamp(now)}`,
    status: 'running',
    stage: 'detecting_speech',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    pipeline: 'text',
    source_transcript: text,
    owner_email: user.email,
    visibility: 'private',
  };
  await saveJob(env, job);
  await addPendingJob(env, job.id);

  const backgroundJob = processTextGenerationJob(
    {
      job,
      url,
    },
    env,
    deps,
  );
  if (ctx) {
    ctx.waitUntil(backgroundJob);
  } else {
    void backgroundJob;
  }

  return jsonResponse(
    {
      job_id: job.id,
      label: job.label,
      status: job.status,
      stage: job.stage,
      transcript: text,
      status_url: `${url.origin}/generate-3d/jobs/${encodeURIComponent(job.id)}`,
    },
    202,
  );
}

async function processSpeechGenerationJob(
  input: {
    audioBase64: string;
    audioMimeType: string;
    job: StoredJob;
    url: URL;
  },
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<void> {
  try {
    await advanceSpeechGenerationJob(
      {
        job: input.job,
        requestOrigin: input.url.origin,
        audioBase64: input.audioBase64,
        audioMimeType: input.audioMimeType,
      },
      env,
      deps,
    );
  } catch (error) {
    await failSpeechGenerationJob(env, deps, input.job, error);
  }
}

async function processTextGenerationJob(
  input: {
    job: StoredJob;
    url: URL;
  },
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<void> {
  try {
    await advanceSpeechGenerationJob(
      {
        job: input.job,
        requestOrigin: input.url.origin,
      },
      env,
      deps,
    );
  } catch (error) {
    await failSpeechGenerationJob(env, deps, input.job, error);
  }
}

async function advanceSpeechGenerationJob(
  input: {
    job: StoredJob;
    requestOrigin?: string;
    audioBase64?: string;
    audioMimeType?: string;
  },
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<StoredJob> {
  let job = (await readJob(env, input.job.id)) ?? input.job;
  if (job.status !== 'running' || job.modal_call_id) {
    return job;
  }

  let transcript = job.source_transcript;
  if (!transcript) {
    const speechAudio = await readSpeechAudioForJob(env, job, {
      audioBase64: input.audioBase64,
      audioMimeType: input.audioMimeType,
    });

    if (!speechAudio) {
      throw new Error('Speech audio was not available to resume detection.');
    }

    transcript = await transcribeSpeechFor3D(speechAudio, env, deps);
    job = await updateSpeechJob(env, deps, job, {
      source_transcript: transcript,
      stage: 'generating_image',
      updated_at: deps.now().toISOString(),
    });
  }

  let generationPrompt = job.generation_prompt;
  if (!generationPrompt || !job.target_object) {
    const speechPrompt = await createSpeechImagePromptFor3D(transcript, env, deps);
    generationPrompt = speechPrompt.prompt;
    job = await updateSpeechJob(env, deps, job, {
      label: formatJobLabel(deps.now(), speechPrompt.object),
      target_object: speechPrompt.object,
      generation_prompt: speechPrompt.prompt,
      stage: 'generating_image',
      updated_at: deps.now().toISOString(),
    });
  }

  const imageBase64 = await generateSpeechImageFor3D(generationPrompt, env, deps);
  const audioObjectKeyToDelete = job.audio_object_key;
  const modalJob = await startModalGenerationForSpeechJob(
    new URL(input.requestOrigin || getPublicOrigin(env) || 'https://worker.example'),
    env,
    deps,
    job,
    {
      imageBase64,
      imageMimeType: 'image/png',
    },
  );
  job = await updateSpeechJob(env, deps, job, {
    modal_call_id: modalJob.callId,
    preview_url: modalJob.previewUrl,
    preview_object_key: modalJob.previewObjectKey,
    audio_object_key: undefined,
    audio_mime_type: undefined,
    stage: 'generating_3d',
    updated_at: deps.now().toISOString(),
  });
  if (env.MODEL_BUCKET.delete && audioObjectKeyToDelete) {
    await env.MODEL_BUCKET.delete(audioObjectKeyToDelete);
  }
  await addPendingJob(env, job.id);
  return job;
}

async function failSpeechGenerationJob(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  job: StoredJob,
  error: unknown,
): Promise<StoredJob> {
  const currentJob = (await readJob(env, job.id)) ?? job;
  const message = error instanceof Error ? error.message : 'Speech-to-3D generation failed.';
  const failedJob = await updateSpeechJob(env, deps, currentJob, {
    status: 'failed',
    stage: 'failed',
    error: message,
    failed_at: deps.now().toISOString(),
    updated_at: deps.now().toISOString(),
  });
  await removePendingJob(env, failedJob.id);
  return failedJob;
}

async function updateSpeechJob(
  env: WorkerEnv,
  _deps: GenerateModelDeps,
  job: StoredJob,
  update: Partial<StoredJob>,
): Promise<StoredJob> {
  const nextJob = {
    ...job,
    ...update,
  };
  await saveJob(env, nextJob);
  return nextJob;
}

async function storeSpeechAudio(
  env: WorkerEnv,
  input: {
    jobId: string;
    audioBase64: string;
    audioMimeType: string;
  },
): Promise<string> {
  const objectKey = speechAudioObjectKey(input.jobId, input.audioMimeType);
  await env.MODEL_BUCKET.put(objectKey, base64ToArrayBuffer(stripDataUrlPrefix(input.audioBase64)), {
    httpMetadata: {
      contentType: input.audioMimeType,
    },
  });
  return objectKey;
}

async function readSpeechAudioForJob(
  env: WorkerEnv,
  job: StoredJob,
  suppliedAudio: {
    audioBase64?: string;
    audioMimeType?: string;
  },
): Promise<{ audioBase64: string; audioMimeType: string } | null> {
  if (suppliedAudio.audioBase64) {
    return {
      audioBase64: stripDataUrlPrefix(suppliedAudio.audioBase64),
      audioMimeType: suppliedAudio.audioMimeType ?? job.audio_mime_type ?? 'audio/webm',
    };
  }

  if (!job.audio_object_key) {
    return null;
  }

  const audioObject = await env.MODEL_BUCKET.get(job.audio_object_key);
  if (!audioObject?.body) {
    return null;
  }

  const audioBuffer = audioObject.arrayBuffer
    ? await audioObject.arrayBuffer()
    : await new Response(audioObject.body).arrayBuffer();

  return {
    audioBase64: arrayBufferToBase64(audioBuffer),
    audioMimeType: job.audio_mime_type ?? audioObject.httpMetadata?.contentType ?? 'audio/webm',
  };
}

async function startModalGenerationForSpeechJob(
  url: URL,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  job: StoredJob,
  generationImage: {
    imageBase64: string;
    imageMimeType: string;
  },
): Promise<{ callId: string; previewUrl?: string; previewObjectKey?: string }> {
  const modalConfig = modalConfigForPipeline(env, 'speech');
  const payload = {
    image_base64: stripDataUrlPrefix(generationImage.imageBase64),
    ...modalConfig.payloadDefaults,
  };
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
    throw new Error(`Modal job start failed: ${await modalResponse.text()}`);
  }

  const modalJob = (await modalResponse.json()) as { call_id?: unknown };
  if (typeof modalJob.call_id !== 'string' || !modalJob.call_id) {
    throw new Error('Modal job start response did not include a call_id.');
  }

  const preview = await storeGeneratedModelPreview(env, {
    imageBase64: generationImage.imageBase64,
    imageMimeType: generationImage.imageMimeType,
    jobId: job.id,
    createdAt: new Date(job.created_at),
    publicOrigin: getPublicOrigin(env, url.origin),
  });

  return {
    callId: modalJob.call_id,
    ...(preview?.previewUrl ? { previewUrl: preview.previewUrl } : {}),
    ...(preview?.previewObjectKey ? { previewObjectKey: preview.previewObjectKey } : {}),
  };
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

    const targets = await readImageTargetsIndex(env);
    return jsonResponse({ user: toSessionUser(auth.user, targets) });
  }

  if (request.method === 'GET' && url.pathname === '/auth/audit') {
    const auth = await requireAdminUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }
    const audit = await readAuditLogIndex(env);
    return jsonResponse({ events: audit.events });
  }

  if (request.method === 'POST' && url.pathname === '/auth/logout') {
    const token = readBearerToken(request);
    if (!token) {
      return jsonResponse({ error: 'Login required.' }, 401);
    }
    const payload = await verifySessionToken(token, env, deps.now());
    if (!payload) {
      return jsonResponse({ error: 'Login required.' }, 401);
    }
    await revokeSession(env, payload.jti);
    await appendAuditEvent(env, deps, {
      actor: payload.sub,
      action: 'auth.logout',
      status: 'ok',
    });
    return jsonResponse({ ok: true });
  }

  if (request.method === 'GET' && url.pathname === '/auth/users') {
    const auth = await requireAdminUser(request, env, deps);
    if (auth instanceof Response) {
      return auth;
    }

    const [index, targets, audit] = await Promise.all([
      readUsersIndex(env),
      readImageTargetsIndex(env),
      readAuditLogIndex(env),
    ]);
    return jsonResponse({
      users: index.users.map((user) => toAdminUser(user, targets, audit.events)),
    });
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
      return handleAccountRemovalRequest(env, deps, email, auth.user);
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
    plan: 'starter',
  };

  return withMutationLease(env, 'auth', async () => {
    const index = await readUsersIndex(env);
    if (index.users.some((storedUser) => storedUser.email === email)) {
      return jsonResponse({ error: 'Account already exists.' }, 409);
    }
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
  });
}

async function handleLoginRequest(request: Request, env: WorkerEnv, deps: GenerateModelDeps): Promise<Response> {
  const body = await readJsonBody<AuthRequestBody>(request);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400);
  }

  const email = normalizeEmail(body.value.email);
  const password = normalizePassword(body.value.password);
  const rateLimit = await consumeRateLimit(env, deps, `login:${email ?? request.headers.get('CF-Connecting-IP') ?? 'unknown'}`, 5, 15 * 60);
  if (!rateLimit.allowed) {
    return jsonResponse({ error: 'Too many login attempts. Try again later.' }, 429);
  }
  if (!email || !password) {
    await appendAuditEvent(env, deps, {
      actor: email ?? 'unknown',
      action: 'auth.login',
      status: 'invalid',
    });
    return jsonResponse({ error: 'Invalid email or password.' }, 401);
  }

  const index = await readUsersIndex(env);
  const user = index.users.find((entry) => entry.email === email);
  if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
    await appendAuditEvent(env, deps, {
      actor: email,
      action: 'auth.login',
      status: 'invalid',
    });
    return jsonResponse({ error: 'Invalid email or password.' }, 401);
  }

  if (user.status !== 'active') {
    await appendAuditEvent(env, deps, {
      actor: email,
      action: 'auth.login',
      status: user.status,
    });
    return jsonResponse({
      error: user.status === 'disabled'
        ? 'Account disabled by admin.'
        : 'Account pending admin approval.',
    }, 403);
  }

  await appendAuditEvent(env, deps, {
    actor: email,
    action: 'auth.login',
    status: 'ok',
  });
  const targets = await readImageTargetsIndex(env);
  return jsonResponse({
    user: toSessionUser(user, targets),
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

  const requestedStatus = body.value.status === undefined
    ? undefined
    : normalizeAccountStatus(body.value.status);
  if (body.value.status !== undefined && !requestedStatus) {
    return jsonResponse({ error: 'status must be active, pending, or disabled.' }, 400);
  }
  const requestedPlan = body.value.plan === undefined ? undefined : normalizePlanId(body.value.plan);
  if (body.value.plan !== undefined && !requestedPlan) {
    return jsonResponse({ error: 'plan must be starter, creator, or studio.' }, 400);
  }
  if (
    body.value.entitlement_overrides !== undefined
    && (!body.value.entitlement_overrides
      || typeof body.value.entitlement_overrides !== 'object'
      || Array.isArray(body.value.entitlement_overrides))
  ) {
    return jsonResponse({ error: 'entitlement_overrides must be an object.' }, 400);
  }
  const requestedOverrides = body.value.entitlement_overrides === undefined
    ? undefined
    : normalizeEntitlementOverrides(body.value.entitlement_overrides);
  if (requestedStatus === undefined && requestedPlan === undefined && requestedOverrides === undefined) {
    return jsonResponse({ error: 'status, plan, or entitlement_overrides is required.' }, 400);
  }
  if (
    email === getAdminEmail(env)
    && (requestedStatus && requestedStatus !== 'active' || requestedPlan || requestedOverrides)
  ) {
    return jsonResponse({
      error: 'The configured administrator account cannot be disabled or assigned a user plan.',
    }, 400);
  }

  return withMutationLease(env, 'auth', async () => {
    const index = await readUsersIndex(env);
    const userIndex = index.users.findIndex((user) => user.email === email);
    if (userIndex === -1) {
      return jsonResponse({ error: 'Account not found.' }, 404);
    }

    const now = deps.now();
    const existingUser = index.users[userIndex];
    const nextStatus = requestedStatus ?? existingUser.status;
    const nextUser: StoredUser = {
      ...existingUser,
      role: existingUser.email === getAdminEmail(env) ? 'admin' : 'user',
      status: nextStatus,
      plan: requestedPlan ?? existingUser.plan ?? 'starter',
      ...(requestedOverrides !== undefined
        ? { entitlement_overrides: requestedOverrides }
        : {}),
      updated_at: now.toISOString(),
      approved_at: nextStatus === 'active' ? existingUser.approved_at ?? now.toISOString() : undefined,
      approved_by: nextStatus === 'active' ? existingUser.approved_by ?? adminUser.email : undefined,
    };
    const users = [...index.users];
    users[userIndex] = nextUser;
    await writeUsersIndex(env, { users });
    await appendAuditEvent(env, deps, {
      actor: adminUser.email,
      action: 'admin.user.update',
      target: email,
      status: 'ok',
      metadata: {
        ...(requestedStatus ? { account_status: requestedStatus } : {}),
        ...(requestedPlan ? { plan: requestedPlan } : {}),
        ...(requestedOverrides !== undefined
          ? { entitlement_overrides: JSON.stringify(requestedOverrides) }
          : {}),
      },
    });
    const [targets, audit] = await Promise.all([
      readImageTargetsIndex(env),
      readAuditLogIndex(env),
    ]);
    return jsonResponse({ user: toAdminUser(nextUser, targets, audit.events) });
  });
}

async function handleAccountRemovalRequest(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  email: string,
  adminUser: StoredUser,
): Promise<Response> {
  if (email === adminUser.email) {
    return jsonResponse({ error: 'Admins cannot remove their own account.' }, 400);
  }

  return withMutationLease(env, 'auth', async () => {
    const index = await readUsersIndex(env);
    const nextUsers = index.users.filter((user) => user.email !== email);
    if (nextUsers.length === index.users.length) {
      return jsonResponse({ error: 'Account not found.' }, 404);
    }

    await writeUsersIndex(env, { users: nextUsers });
    await appendAuditEvent(env, deps, {
      actor: adminUser.email,
      action: 'admin.user.delete',
      target: email,
      status: 'ok',
    });
    return jsonResponse({ deleted: true, email });
  });
}

async function handleUploadedModelRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  url: URL,
  user: StoredUser,
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
    owner_email: user.email,
    visibility: 'private',
    source: 'uploaded',
  };

  await env.MODEL_BUCKET.put(objectKey, modelBytes, {
    httpMetadata: { contentType: normalizeModelMimeType(body.value.model_mime_type) },
  });
  await upsertGeneratedModelEntry(env, entry);

  return jsonResponse(entry, 201);
}

async function handleImageTargetCreateRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  url: URL,
  user: StoredUser,
): Promise<Response> {
  if (!env.MODEL_BUCKET) {
    return jsonResponse({ error: 'Model bucket binding is not configured.' }, 500);
  }

  const targetIndex = await readImageTargetsIndex(env);
  const accessContext = markArAccessContext(user, targetIndex);
  if (user.role !== 'admin' && accessContext.account.state === 'over_quota') {
    return accountOverQuotaResponse(accessContext.account);
  }
  if (user.role !== 'admin' && !accessContext.entitlements.features.target_create) {
    return featureDeniedResponse('target_create');
  }
  if (
    user.role !== 'admin'
    && accessContext.entitlements.maxTargets !== null
    && accessContext.targetCount >= accessContext.entitlements.maxTargets
  ) {
    return jsonResponse({
      error: 'Target limit reached.',
      code: 'target_quota_reached',
      account_access: accountAccessResponse(accessContext.account),
    }, 403);
  }

  const body = await readJsonBody<ImageTargetRequestBody>(request);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400);
  }

  const imageMimeType = normalizeImageTargetMimeType(body.value.image_mime_type);
  if (!imageMimeType) {
    return jsonResponse({ error: 'image_mime_type must be image/png, image/jpeg, or image/webp.' }, 400);
  }

  if (typeof body.value.image_base64 !== 'string' || body.value.image_base64.length === 0) {
    return jsonResponse({ error: 'image_base64 is required.' }, 400);
  }

  const normalizedGroups = normalizeImageTargetGroups(body.value.groups);
  const imageTargetObjects = normalizeImageTargetObjects(
    body.value.objects,
    body.value.model,
    body.value.placement,
    normalizedGroups,
  );
  if (imageTargetObjects.length === 0) {
    return jsonResponse({ error: 'objects must include at least one valid model or text object.' }, 400);
  }
  const groups = usedImageTargetGroups(normalizedGroups, imageTargetObjects);
  const firstModel = imageTargetObjects.find(isImageTargetModelObject);
  const access = normalizeRequestedImageTargetAccess(body.value, user.email, {
    access_mode: 'owner_only',
    allowed_emails: [],
  });
  if ('error' in access) {
    return jsonResponse({ error: access.error }, 400);
  }
  if (user.role !== 'admin') {
    const entitlementError = validateImageTargetCreateEntitlements(
      accessContext.entitlements,
      imageTargetObjects,
      groups,
      access.access_mode,
    );
    if (entitlementError) {
      return entitlementError;
    }
  }

  const now = deps.now();
  const label = normalizeModelLabel(body.value.label) ?? 'Image target';
  const existingTargets = targetIndex.targets;
  const id = createUniqueImageTargetId(existingTargets, now, label);
  const extension = imageTargetExtension(imageMimeType);
  const objectKey = `${imageTargetImagePrefix}${id}.${extension}`;
  const imageBytes = base64ToArrayBuffer(stripDataUrlPrefix(body.value.image_base64));
  if (imageBytes.byteLength > maxImageTargetBytes) {
    return jsonResponse({ error: 'Image target uploads must be 5 MB or smaller.' }, 400);
  }

  const entry: ImageTargetEntry = {
    id,
    label,
    image_url: `${getPublicOrigin(env, url.origin)}/${objectKey}`,
    image_object_key: objectKey,
    ...(firstModel ? { model: firstModel.model, placement: firstModel.placement } : {}),
    objects: imageTargetObjects,
    groups,
    owner_email: user.email,
    visibility: 'private',
    scan_id: deps.randomUUID?.() ?? crypto.randomUUID(),
    access_mode: access.access_mode,
    allowed_emails: access.allowed_emails,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  await env.MODEL_BUCKET.put(objectKey, imageBytes, {
    httpMetadata: { contentType: imageMimeType },
  });
  await upsertImageTargetEntry(env, entry);
  await appendAuditEvent(env, deps, {
    actor: user.email,
    action: 'image-target.create',
    target: id,
    status: 'ok',
  });

  return jsonResponse(entry, 201);
}

async function handleGeneratedModelManagementRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  modelId: string,
  url: URL,
  user: StoredUser,
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
    const visibility = normalizeModelVisibility(body.value.visibility);
    const previewBase64 =
      typeof body.value.preview_base64 === 'string' && body.value.preview_base64.length > 0
        ? body.value.preview_base64
        : null;

    if (body.value.visibility !== undefined && !visibility) {
      return jsonResponse({ error: 'visibility must be public or private.' }, 400);
    }

    if (!label && !previewBase64 && !visibility) {
      return jsonResponse({ error: 'label, preview_base64, or visibility is required.' }, 400);
    }

    try {
      const response = await updateGeneratedModel(env, deps, modelId, user, {
        label: label ?? undefined,
        previewBase64: previewBase64 ?? undefined,
        previewMimeType:
          typeof body.value.preview_mime_type === 'string' ? body.value.preview_mime_type : 'image/png',
        visibility: visibility ?? undefined,
        publicOrigin: getPublicOrigin(env, url.origin),
      });
      await appendAuditEvent(env, deps, {
        actor: user.email,
        action: 'model.update',
        target: modelId,
        status: response.ok ? 'ok' : 'failed',
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update generated model.';
      return jsonResponse({ error: message }, 400);
    }
  }

  if (request.method === 'DELETE') {
    const response = await deleteGeneratedModel(env, modelId, user);
    await appendAuditEvent(env, deps, {
      actor: user.email,
      action: 'model.delete',
      target: modelId,
      status: response.ok ? 'ok' : 'failed',
    });
    return response;
  }

  return jsonResponse({ error: 'Only PATCH and DELETE requests are supported for generated models.' }, 405);
}

async function handleImageTargetManagementRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  url: URL,
  targetId: string,
  user: StoredUser,
): Promise<Response> {
  if (!targetId) {
    return jsonResponse({ error: 'target_id is required.' }, 400);
  }
  if (!env.MODEL_BUCKET) {
    return jsonResponse({ error: 'Model bucket binding is not configured.' }, 500);
  }

  if (request.method === 'PATCH') {
    return updateImageTarget(request, env, deps, url, targetId, user);
  }

  if (request.method === 'DELETE') {
    return deleteImageTarget(env, deps, targetId, user);
  }

  return jsonResponse({ error: 'Only PATCH and DELETE requests are supported for image targets.' }, 405);
}

async function handleImageTargetScanRequest(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  scanId: string,
): Promise<Response> {
  if (!scanId) {
    return jsonResponse({ error: 'Image target not found.' }, 404);
  }
  const index = await readImageTargetsIndex(env);
  const target = index.targets.find((candidate) => candidate.scan_id === scanId);
  if (!target) {
    return jsonResponse({ error: 'Image target not found.' }, 404);
  }

  const viewer = await readOptionalStoredUser(request, env, deps);
  if (viewer?.user.role === 'admin' && viewer.user.email === getAdminEmail(env)) {
    return jsonResponse(
      imageTargetScanResponse(target, effectiveEntitlementsForUser(viewer.user)),
      200,
      { 'Cache-Control': 'no-store' },
    );
  }

  const owner = target.owner_email ? await reloadStoredUser(env, target.owner_email) : null;
  if (target.owner_email && !owner) {
    return jsonResponse({
      error: 'This scan URL is paused because its owner account no longer exists.',
      code: 'owner_account_missing',
    }, 423, { 'Cache-Control': 'no-store' });
  }
  let ownerEntitlements: EffectiveEntitlements | null = null;
  if (owner) {
    const ownerAccess = markArAccessContext(owner, index);
    ownerEntitlements = ownerAccess.entitlements;
    if (owner.status !== 'active' || ownerAccess.account.locked) {
      return jsonResponse({
        error: 'This scan URL is paused because its owner account is locked.',
        code: 'owner_account_locked',
      }, 423, { 'Cache-Control': 'no-store' });
    }
    if (!ownerAccess.entitlements.features.scan_links) {
      return jsonResponse({
        error: 'This scan URL is paused by the account administrator.',
        code: 'scan_links_disabled',
      }, 403, { 'Cache-Control': 'no-store' });
    }
    const sharingFeature = sharingFeatureForAccessMode(imageTargetAccessMode(target));
    if (sharingFeature && !ownerAccess.entitlements.features[sharingFeature]) {
      return jsonResponse({
        error: 'This target sharing mode is disabled.',
        code: 'sharing_mode_disabled',
      }, 403, { 'Cache-Control': 'no-store' });
    }
  }

  if (viewer) {
    if (viewer.user.status !== 'active') {
      return jsonResponse({
        error: viewer.user.status === 'disabled'
          ? 'Account disabled by admin.'
          : 'Account pending admin approval.',
        code: 'viewer_account_locked',
      }, 403, { 'Cache-Control': 'no-store' });
    }
    const viewerAccess = markArAccessContext(viewer.user, index);
    if (viewerAccess.account.state === 'over_quota') {
      return accountOverQuotaResponse(viewerAccess.account, { 'Cache-Control': 'no-store' });
    }
    if (!viewerAccess.entitlements.features.scan) {
      return featureDeniedResponse('scan', { 'Cache-Control': 'no-store' });
    }
  }

  if (imageTargetAccessMode(target) === 'anyone_with_link') {
    return jsonResponse(imageTargetScanResponse(target, ownerEntitlements), 200, { 'Cache-Control': 'no-store' });
  }
  if (!viewer) {
    return jsonResponse({ error: 'Login required.' }, 401, { 'Cache-Control': 'no-store' });
  }
  if (!canScanImageTarget(target, viewer.user)) {
    return jsonResponse({ error: 'You do not have access to this image target.' }, 403);
  }
  return jsonResponse(imageTargetScanResponse(target, ownerEntitlements), 200, { 'Cache-Control': 'no-store' });
}

async function updateImageTarget(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
  url: URL,
  targetId: string,
  user: StoredUser,
): Promise<Response> {
  const body = await readJsonBody<ImageTargetRequestBody>(request);
  if (!body.ok) {
    return jsonResponse({ error: body.error }, 400);
  }

  const index = await readImageTargetsIndex(env);
  const targetIndex = index.targets.findIndex((target) => target.id === targetId);
  if (targetIndex === -1) {
    return jsonResponse({ error: 'Image target not found.' }, 404);
  }

  const existingTarget = index.targets[targetIndex];
  if (!canManageImageTarget(existingTarget, user)) {
    return jsonResponse({ error: 'Only the owner or an admin can manage this image target.' }, 403);
  }
  const accessContext = markArAccessContext(user, index);
  if (user.role !== 'admin' && accessContext.account.state === 'over_quota') {
    return accountOverQuotaResponse(accessContext.account);
  }
  if (user.role !== 'admin' && !accessContext.entitlements.features.target_edit) {
    return featureDeniedResponse('target_edit');
  }

  const requestedGroups = body.value.groups !== undefined
    ? normalizeImageTargetGroups(body.value.groups)
    : normalizeImageTargetGroups(existingTarget.groups);
  const nextObjects = nextImageTargetObjectsForUpdate(existingTarget, body.value, requestedGroups);
  if (nextObjects.length === 0) {
    return jsonResponse({ error: 'objects must include at least one valid model or text object.' }, 400);
  }
  const nextGroups = usedImageTargetGroups(requestedGroups, nextObjects);
  const firstModel = nextObjects.find(isImageTargetModelObject);
  const access = normalizeRequestedImageTargetAccess(
    body.value,
    existingTarget.owner_email ?? user.email,
    {
      access_mode: imageTargetAccessMode(existingTarget),
      allowed_emails: normalizeStoredAllowedEmails(existingTarget.allowed_emails, existingTarget.owner_email),
    },
  );
  if ('error' in access) {
    return jsonResponse({ error: access.error }, 400);
  }
  if (user.role !== 'admin') {
    const entitlementError = validateImageTargetUpdateEntitlements(
      accessContext.entitlements,
      existingTarget,
      nextObjects,
      nextGroups,
      access.access_mode,
    );
    if (entitlementError) {
      return entitlementError;
    }
  }
  const { model: _existingModel, placement: _existingPlacement, ...existingWithoutAliases } = existingTarget;
  const now = deps.now();
  const nextTarget: ImageTargetEntry = {
    ...existingWithoutAliases,
    label: normalizeModelLabel(body.value.label) ?? existingTarget.label,
    ...(firstModel ? { model: firstModel.model, placement: firstModel.placement } : {}),
    objects: nextObjects,
    groups: nextGroups,
    visibility: normalizeModelVisibility(body.value.visibility) ?? existingTarget.visibility ?? 'private',
    scan_id: existingTarget.scan_id ?? deps.randomUUID?.() ?? crypto.randomUUID(),
    access_mode: access.access_mode,
    allowed_emails: access.allowed_emails,
    updated_at: now.toISOString(),
  };

  const imageMimeType = normalizeImageTargetMimeType(body.value.image_mime_type);
  if (body.value.image_mime_type !== undefined && !imageMimeType) {
    return jsonResponse({ error: 'image_mime_type must be image/png, image/jpeg, or image/webp.' }, 400);
  }
  let replacement: { objectKey: string; imageBytes: ArrayBuffer; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' } | undefined;
  if (typeof body.value.image_base64 === 'string' && body.value.image_base64.length > 0) {
    if (!imageMimeType) {
      return jsonResponse({ error: 'image_mime_type is required when image_base64 is provided.' }, 400);
    }
    const mimeType = imageMimeType;
    const imageBytes = base64ToArrayBuffer(stripDataUrlPrefix(body.value.image_base64));
    if (imageBytes.byteLength > maxImageTargetBytes) {
      return jsonResponse({ error: 'Image target uploads must be 5 MB or smaller.' }, 400);
    }
    const objectKey = replacementImageTargetObjectKey(targetId, mimeType, body.value.image_base64, now);
    replacement = { objectKey, imageBytes, mimeType };
    nextTarget.image_object_key = objectKey;
    nextTarget.image_url = `${getPublicOrigin(env, url.origin)}/${objectKey}`;
  }

  const recordKey = imageTargetRecordKey(targetId);
  let previousStoredRecord: ImageTargetEntry | null = null;
  let recordWritten = false;
  try {
    previousStoredRecord = await readJsonObject<ImageTargetEntry | null>(env, recordKey, null);
    if (replacement) {
      await env.MODEL_BUCKET.put(replacement.objectKey, replacement.imageBytes, {
        httpMetadata: { contentType: replacement.mimeType },
      });
    }
    await writeJsonObject(env, recordKey, nextTarget);
    recordWritten = true;
    index.targets[targetIndex] = nextTarget;
    await writeImageTargetsIndex(env, index);
  } catch {
    const rollbackTasks: Promise<unknown>[] = [];
    if (recordWritten) {
      if (previousStoredRecord) {
        rollbackTasks.push(writeJsonObject(env, recordKey, previousStoredRecord));
      } else if (env.MODEL_BUCKET.delete) {
        rollbackTasks.push(env.MODEL_BUCKET.delete(recordKey));
      }
    }
    if (replacement && env.MODEL_BUCKET.delete) {
      rollbackTasks.push(env.MODEL_BUCKET.delete(replacement.objectKey));
    }
    await Promise.allSettled(rollbackTasks);
    return jsonResponse({ error: 'Unable to update image target.' }, 500);
  }

  if (replacement && replacement.objectKey !== existingTarget.image_object_key && env.MODEL_BUCKET.delete) {
    try {
      await env.MODEL_BUCKET.delete(existingTarget.image_object_key);
    } catch {
      // The versioned replacement is already durable; a stale object can be cleaned up later.
    }
  }
  await appendAuditEvent(env, deps, {
    actor: user.email,
    action: 'image-target.update',
    target: targetId,
    status: 'ok',
  });

  return jsonResponse(nextTarget);
}

async function deleteImageTarget(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  targetId: string,
  user: StoredUser,
): Promise<Response> {
  const index = await readImageTargetsIndex(env);
  const target = index.targets.find((entry) => entry.id === targetId);
  if (!target) {
    return jsonResponse({ error: 'Image target not found.' }, 404);
  }
  if (!canManageImageTarget(target, user)) {
    return jsonResponse({ error: 'Only the owner or an admin can manage this image target.' }, 403);
  }
  const accessContext = markArAccessContext(user, index);
  if (
    user.role !== 'admin'
    && accessContext.account.state !== 'over_quota'
    && !accessContext.entitlements.features.target_delete
  ) {
    return featureDeniedResponse('target_delete');
  }

  await writeImageTargetsIndex(env, {
    targets: index.targets.filter((entry) => entry.id !== targetId),
  });
  await env.MODEL_BUCKET.delete?.(target.image_object_key);
  await env.MODEL_BUCKET.delete?.(imageTargetRecordKey(targetId));
  await appendAuditEvent(env, deps, {
    actor: user.email,
    action: 'image-target.delete',
    target: targetId,
    status: 'ok',
  });

  return jsonResponse({ deleted: true, id: targetId });
}

async function rotateImageTargetScanLink(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  targetId: string,
  admin: StoredUser,
): Promise<Response> {
  const index = await readImageTargetsIndex(env);
  const targetIndex = index.targets.findIndex((target) => target.id === targetId);
  if (targetIndex === -1) {
    return jsonResponse({ error: 'Image target not found.' }, 404);
  }

  const existingTarget = index.targets[targetIndex];
  const baseScanId = deps.randomUUID?.() ?? crypto.randomUUID();
  let scanId = baseScanId;
  let suffix = 2;
  while (index.targets.some((target) => target.id !== targetId && target.scan_id === scanId)) {
    scanId = `${baseScanId}-${suffix}`;
    suffix += 1;
  }
  const nextTarget: ImageTargetEntry = {
    ...existingTarget,
    scan_id: scanId,
    updated_at: deps.now().toISOString(),
  };
  index.targets[targetIndex] = nextTarget;
  await writeJsonObject(env, imageTargetRecordKey(targetId), nextTarget);
  await writeImageTargetsIndex(env, index);
  await appendAuditEvent(env, deps, {
    actor: admin.email,
    action: 'image-target.rotate-link',
    target: targetId,
    status: 'ok',
    metadata: {
      previous_scan_id: existingTarget.scan_id ?? null,
      scan_id: scanId,
    },
  });
  return jsonResponse(nextTarget);
}

async function updateGeneratedModel(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  modelId: string,
  user: StoredUser,
  update: {
    label?: string;
    previewBase64?: string;
    previewMimeType: string;
    visibility?: ModelVisibility;
    publicOrigin: string;
  },
): Promise<Response> {
  const index = await readGeneratedModelsIndex(env);
  const modelIndex = index.models.findIndex((model) => model.id === modelId);
  if (modelIndex === -1) {
    return jsonResponse({ error: 'Generated model not found.' }, 404);
  }

  const existingModel = index.models[modelIndex];
  if (!canManageGeneratedModel(existingModel, user)) {
    return jsonResponse({ error: 'Only the owner or an admin can manage this model.' }, 403);
  }

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
    visibility: update.visibility ?? existingModel.visibility ?? 'public',
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
      visibility: update.visibility ?? job.visibility ?? renamedModel.visibility,
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

async function deleteGeneratedModel(env: WorkerEnv, modelId: string, user: StoredUser): Promise<Response> {
  const index = await readGeneratedModelsIndex(env);
  const model = index.models.find((entry) => entry.id === modelId);
  if (!model) {
    return jsonResponse({ error: 'Generated model not found.' }, 404);
  }

  if (!canManageGeneratedModel(model, user)) {
    return jsonResponse({ error: 'Only the owner or an admin can manage this model.' }, 403);
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

async function handleAdminJobsList(env: WorkerEnv): Promise<Response> {
  const jobs = await readKnownJobs(env);
  return jsonResponse({
    jobs: jobs.sort((left, right) => right.updated_at.localeCompare(left.updated_at)).map(toJobResponse),
  });
}

async function handleAdminJobRetry(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  jobId: string,
  adminUser: StoredUser,
): Promise<Response> {
  const job = await readJob(env, jobId);
  if (!job) {
    return jsonResponse({ error: 'Job not found.' }, 404);
  }
  if (job.status !== 'failed') {
    return jsonResponse({ error: 'Only failed jobs can be retried.' }, 400);
  }

  const runningJob: StoredJob = {
    ...job,
    status: 'running',
    error: undefined,
    failed_at: undefined,
    updated_at: deps.now().toISOString(),
  };
  await saveJob(env, runningJob);
  await addPendingJob(env, runningJob.id);
  await appendAuditEvent(env, deps, {
    actor: adminUser.email,
    action: 'job.retry',
    target: jobId,
    status: 'ok',
  });
  return jsonResponse(toJobResponse(runningJob));
}

async function handleFailedJobArtifactCleanup(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  adminUser: StoredUser,
): Promise<Response> {
  const jobs = await readKnownJobs(env);
  let cleaned = 0;

  for (const job of jobs) {
    if (job.model_url || !job.preview_object_key || !env.MODEL_BUCKET.delete) {
      continue;
    }

    await env.MODEL_BUCKET.delete(job.preview_object_key);
    cleaned += 1;
    await saveJob(env, {
      ...job,
      preview_url: undefined,
      preview_object_key: undefined,
      updated_at: deps.now().toISOString(),
    });
  }

  await appendAuditEvent(env, deps, {
    actor: adminUser.email,
    action: 'job.cleanup',
    status: `cleaned:${cleaned}`,
  });
  return jsonResponse({ cleaned });
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
    return jsonResponse(toJobResponse(result.job), 202);
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
  if (isInputTo3DJob(job) && !job.modal_call_id) {
    try {
      const resumedJob = await advanceSpeechGenerationJob(
        {
          job,
          requestOrigin,
        },
        env,
        deps,
      );
      return { state: 'running', job: resumedJob };
    } catch (error) {
      const failedJob = await failSpeechGenerationJob(env, deps, job, error);
      return { state: 'failed', job: failedJob };
    }
  }
  const resultUrl = new URL(modalConfigForPipeline(env, job.pipeline ?? 'trellis').resultUrl);
  resultUrl.searchParams.set('call_id', job.modal_call_id ?? jobId);

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
      stage: job.stage ?? (isInputTo3DJob(job) ? 'generating_3d' : undefined),
      updated_at: now.toISOString(),
    };
    await saveJob(env, runningJob);
    return { state: 'running', job: runningJob };
  }

  if (!modalResponse.ok) {
    const failedJob: StoredJob = {
      ...job,
      status: 'failed',
      stage: 'failed',
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
    stage: 'completed',
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

function isInputTo3DJob(job: StoredJob): boolean {
  return job.pipeline === 'speech' || job.pipeline === 'text';
}

function validateEnv(env: WorkerEnv, pipeline?: GenerationPipeline): string | null {
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

  if (pipeline === 'dynamic' && !env.MODAL_OBJECT_PREPROCESS_QUALITY_URL) {
    return 'Modal dynamic image generation endpoint URL is not configured.';
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

async function generateDynamicImageFor3D(
  input: {
    imageBase64: string;
    imageMimeType: string;
    targetObject: string | null;
  },
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<{ imageBase64: string; imageMimeType: string }> {
  if (!env.MODAL_OBJECT_PREPROCESS_QUALITY_URL) {
    throw new Error('Modal dynamic image generation endpoint URL is not configured.');
  }

  const response = await deps.fetch(env.MODAL_OBJECT_PREPROCESS_QUALITY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Modal-Key': env.MODAL_KEY,
      'Modal-Secret': env.MODAL_SECRET,
    },
    body: JSON.stringify({
      image_base64: input.imageBase64,
      target_text: dynamicTargetText(input.targetObject),
      force_image_gen: true,
      return_debug_images: false,
      validate_output: true,
      auto_image_gen_on_validation_fail: true,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Dynamic image generation failed: ${responseText}`);
  }

  let body: DynamicImageResponse;
  try {
    body = JSON.parse(responseText) as DynamicImageResponse;
  } catch {
    throw new Error('Dynamic image generation failed: invalid JSON response.');
  }

  if (typeof body.error === 'string' && body.error) {
    throw new Error(`${body.error}${typeof body.detail === 'string' && body.detail ? `: ${body.detail}` : ''}`);
  }

  if (typeof body.image_base64 !== 'string' || !body.image_base64) {
    throw new Error('Dynamic image generation failed: endpoint response did not include image_base64.');
  }

  return {
    imageBase64: body.image_base64,
    imageMimeType: imageMimeTypeFromDynamicResponse(body),
  };
}

function dynamicTargetText(targetObject: string | null): string {
  return targetObject?.trim() || 'main object';
}

function imageMimeTypeFromDynamicResponse(body: DynamicImageResponse): string {
  if (typeof body.image_mime_type === 'string' && body.image_mime_type.startsWith('image/')) {
    return body.image_mime_type;
  }

  if (typeof body.image_format === 'string') {
    const normalized = body.image_format.trim().toLowerCase();
    if (normalized === 'jpg' || normalized === 'jpeg') {
      return 'image/jpeg';
    }
    if (normalized === 'webp') {
      return 'image/webp';
    }
  }

  return 'image/png';
}

async function transcribeSpeechFor3D(
  input: {
    audioBase64: string;
    audioMimeType: string;
  },
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', new Blob([base64ToArrayBuffer(input.audioBase64)], { type: input.audioMimeType }), audioFileName(input.audioMimeType));
  formData.append('model', env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe');
  formData.append('response_format', 'json');
  formData.append(
    'prompt',
    'Transcribe the user request exactly for a 3D model generation pipeline. Preserve object names, materials, colors, dimensions, style, and shape details. Ignore filler words and do not add new objects.',
  );

  const response = await deps.fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OpenAI speech transcription failed: ${await response.text()}`);
  }

  const body = (await response.json()) as { text?: unknown };
  const transcript = typeof body.text === 'string' ? body.text.trim() : '';
  if (!transcript) {
    throw new Error('OpenAI speech transcription did not detect a usable object request.');
  }
  return transcript;
}

async function createSpeechImagePromptFor3D(
  transcript: string,
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<{ object: string; prompt: string }> {
  const response = await deps.fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_PROMPT_MODEL || 'gpt-5.5',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You convert a user object request into a single-object image prompt for image-to-3D reconstruction. The final product is a 3D model, so prioritize clean geometry, full visibility, a centered object, clear silhouette, neutral background, and practical physical structure.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `User object request: ${transcript}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'speech_to_3d_prompt',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              object: {
                type: 'string',
                description: 'A short noun phrase naming the single object to generate.',
              },
              prompt: {
                type: 'string',
                description: 'A detailed image generation prompt optimized for image-to-3D reconstruction.',
              },
            },
            required: ['object', 'prompt'],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI speech prompt optimization failed: ${await response.text()}`);
  }

  const responseText = extractOpenAiResponseText(await response.json());
  let parsed: { object?: unknown; prompt?: unknown };
  try {
    parsed = JSON.parse(responseText) as { object?: unknown; prompt?: unknown };
  } catch {
    throw new Error('OpenAI speech prompt optimization returned invalid JSON.');
  }

  const object = normalizeTargetObject(parsed.object);
  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';
  if (!object || !prompt) {
    throw new Error('OpenAI speech prompt optimization did not return an object and prompt.');
  }

  return {
    object,
    prompt: enforce3DImagePrompt(prompt, object),
  };
}

async function generateSpeechImageFor3D(prompt: string, env: WorkerEnv, deps: GenerateModelDeps): Promise<string> {
  const response = await deps.fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      prompt,
      n: 1,
      size: '1024x1024',
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI speech image generation failed: ${await response.text()}`);
  }

  const body = (await response.json()) as { data?: Array<{ b64_json?: unknown; url?: unknown }> };
  const image = body.data?.[0];
  if (typeof image?.b64_json === 'string' && image.b64_json) {
    return image.b64_json;
  }

  if (typeof image?.url === 'string' && image.url) {
    const imageResponse = await deps.fetch(image.url);
    if (!imageResponse.ok) {
      throw new Error(`OpenAI speech image generation failed: could not download image (${imageResponse.status}).`);
    }
    return arrayBufferToBase64(await imageResponse.arrayBuffer());
  }

  throw new Error('OpenAI speech image generation failed: no image data returned.');
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

function extractOpenAiResponseText(body: unknown): string {
  if (body && typeof body === 'object' && 'output_text' in body && typeof body.output_text === 'string') {
    return body.output_text;
  }

  if (!body || typeof body !== 'object' || !('output' in body) || !Array.isArray(body.output)) {
    throw new Error('OpenAI response did not include output text.');
  }

  const textParts: string[] = [];
  for (const output of body.output) {
    if (!output || typeof output !== 'object' || !('content' in output) || !Array.isArray(output.content)) {
      continue;
    }
    for (const content of output.content) {
      if (content && typeof content === 'object' && 'text' in content && typeof content.text === 'string') {
        textParts.push(content.text);
      }
    }
  }

  const text = textParts.join('\n').trim();
  if (!text) {
    throw new Error('OpenAI response did not include output text.');
  }
  return text;
}

function enforce3DImagePrompt(prompt: string, object: string): string {
  const requiredTail =
    'Single centered object, full object visible, clean silhouette, white or light neutral background, studio lighting, no text, no logos, no people, no hands, no clutter, no watermark, optimized for image-to-3D reconstruction and TRELLIS 3D model generation.';
  const normalizedPrompt = prompt.trim().replace(/\s+/g, ' ');
  if (normalizedPrompt.toLowerCase().includes('image-to-3d') && normalizedPrompt.toLowerCase().includes('single')) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt || object}. ${requiredTail}`;
}

function audioFileName(audioMimeType: string): string {
  if (audioMimeType.includes('wav')) {
    return 'speech.wav';
  }
  if (audioMimeType.includes('mpeg') || audioMimeType.includes('mp3')) {
    return 'speech.mp3';
  }
  if (audioMimeType.includes('mp4') || audioMimeType.includes('m4a')) {
    return 'speech.m4a';
  }
  return 'speech.webm';
}

function speechAudioObjectKey(jobId: string, audioMimeType: string): string {
  return `${speechAudioKeyPrefix}${safeObjectKeyPart(jobId)}.${audioExtensionForMimeType(audioMimeType)}`;
}

function audioExtensionForMimeType(audioMimeType: string): string {
  if (audioMimeType.includes('wav')) {
    return 'wav';
  }
  if (audioMimeType.includes('mpeg') || audioMimeType.includes('mp3')) {
    return 'mp3';
  }
  if (audioMimeType.includes('mp4') || audioMimeType.includes('m4a')) {
    return 'm4a';
  }
  return 'webm';
}

function pipelineFromGeneratePath(pathname: string): GenerationPipeline {
  if (pathname === '/generate-3d/openai') {
    return 'openai-to-3d';
  }

  if (pathname === '/generate-3d/dynamic') {
    return 'dynamic';
  }

  if (pathname === '/generate-3d/speech') {
    return 'speech';
  }

  if (pathname === '/generate-3d/text') {
    return 'text';
  }

  return 'trellis';
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

function normalizeModelVisibility(value: unknown): ModelVisibility | null {
  return value === 'public' || value === 'private' ? value : null;
}

function normalizeImageTargetAccessMode(value: unknown): ImageTargetAccessMode | null {
  return value === 'anyone_with_link'
    || value === 'any_signed_in'
    || value === 'owner_only'
    || value === 'specific_accounts'
    ? value
    : null;
}

function normalizeStoredAllowedEmails(value: unknown, ownerEmail?: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const owner = ownerEmail?.trim().toLowerCase();
  return [...new Set(value.flatMap((candidate) => {
    if (typeof candidate !== 'string') {
      return [];
    }
    const email = candidate.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email !== owner ? [email] : [];
  }))];
}

function imageTargetAccessMode(target: Pick<ImageTargetEntry, 'access_mode' | 'visibility'>): ImageTargetAccessMode {
  return normalizeImageTargetAccessMode(target.access_mode)
    ?? (target.visibility === 'public' ? 'anyone_with_link' : 'owner_only');
}

function normalizeRequestedImageTargetAccess(
  body: ImageTargetRequestBody,
  ownerEmail: string,
  fallback: Pick<Required<ImageTargetEntry>, 'access_mode' | 'allowed_emails'>,
): Pick<Required<ImageTargetEntry>, 'access_mode' | 'allowed_emails'> | { error: string } {
  const accessMode = body.access_mode === undefined
    ? fallback.access_mode
    : normalizeImageTargetAccessMode(body.access_mode);
  if (!accessMode) {
    return { error: 'access_mode is invalid.' };
  }
  const allowedEmails = normalizeStoredAllowedEmails(
    body.allowed_emails === undefined ? fallback.allowed_emails : body.allowed_emails,
    ownerEmail,
  );
  if (body.allowed_emails !== undefined && !Array.isArray(body.allowed_emails)) {
    return { error: 'allowed_emails must be an array of account emails.' };
  }
  if (accessMode === 'specific_accounts' && allowedEmails.length === 0) {
    return { error: 'specific_accounts requires at least one account email other than the owner.' };
  }
  return {
    access_mode: accessMode,
    allowed_emails: accessMode === 'specific_accounts' ? allowedEmails : [],
  };
}

function normalizeImageTargetMimeType(value: unknown): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  return typeof value === 'string' && allowedImageTargetMimeTypes.includes(value as 'image/png' | 'image/jpeg' | 'image/webp')
    ? (value as 'image/png' | 'image/jpeg' | 'image/webp')
    : null;
}

function imageTargetExtension(mimeType: 'image/png' | 'image/jpeg' | 'image/webp'): string {
  if (mimeType === 'image/png') {
    return 'png';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  return 'jpg';
}

function replacementImageTargetObjectKey(
  targetId: string,
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  imageBase64: string,
  now: Date,
): string {
  const version = `${now.getTime().toString(36)}-${fnv1aHash(stripDataUrlPrefix(imageBase64))}`;
  return `${imageTargetImagePrefix}${safeObjectKeyPart(targetId)}-${version}.${imageTargetExtension(mimeType)}`;
}

function normalizeImageTargetModel(value: unknown): ImageTargetModel | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
    return null;
  }
  if (typeof candidate.label !== 'string' || !candidate.label.trim()) {
    return null;
  }
  if (typeof candidate.url !== 'string' || !candidate.url.trim()) {
    return null;
  }
  return {
    id: candidate.id.trim(),
    label: candidate.label.trim(),
    url: candidate.url.trim(),
    ...(typeof candidate.preview_url === 'string' && candidate.preview_url.trim()
      ? { preview_url: candidate.preview_url.trim() }
      : {}),
  };
}

function normalizeImageTargetObjects(
  objectsValue: unknown,
  legacyModelValue?: unknown,
  legacyPlacementValue?: unknown,
  groups: ImageTargetGroup[] = [],
): ImageTargetObject[] {
  if (Array.isArray(objectsValue)) {
    const seenIds = new Set<string>();
    return objectsValue.flatMap((value, index) => {
      const object = normalizeImageTargetObject(value, index, groups);
      if (!object || seenIds.has(object.id)) {
        return [];
      }
      seenIds.add(object.id);
      return [object];
    });
  }

  const legacyModel = normalizeImageTargetModel(legacyModelValue);
  if (!legacyModel) {
    return [];
  }

  return [{
    kind: 'model',
    id: 'object-1',
    model: legacyModel,
    placement: normalizeImageTargetPlacement(legacyPlacementValue),
  }];
}

function normalizeImageTargetObject(
  value: unknown,
  index: number,
  groups: ImageTargetGroup[],
): ImageTargetObject | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `object-${index + 1}`;
  const placement = normalizeImageTargetPlacement(candidate.placement);
  const groupId = typeof candidate.group_id === 'string' ? candidate.group_id.trim() : '';
  const group = groupId ? groups.find((item) => item.id === groupId) : undefined;
  const groupFields = group && candidate.local_placement && typeof candidate.local_placement === 'object'
    ? { group_id: group.id, local_placement: normalizeLocalImageTargetPlacement(candidate.local_placement) }
    : {};
  const animationFields = candidate.animation
    ? { animation: normalizeImageTargetAnimation(candidate.animation) }
    : {};

  if (candidate.kind === 'text') {
    const text = normalizeImageTargetText(candidate.text);
    return text ? { kind: 'text', id, text, placement, ...groupFields, ...animationFields } : null;
  }
  if (candidate.kind !== undefined && candidate.kind !== 'model') {
    return null;
  }
  const model = normalizeImageTargetModel(candidate.model);
  if (!model) {
    return null;
  }

  return {
    kind: 'model',
    id,
    model,
    placement,
    ...groupFields,
    ...animationFields,
  };
}

function imageTargetObjectsFromStoredTarget(target: ImageTargetEntry): ImageTargetObject[] {
  const groups = normalizeImageTargetGroups(target.groups);
  const objects = normalizeImageTargetObjects(target.objects, undefined, undefined, groups);
  if (objects.length > 0) {
    return objects;
  }

  return normalizeImageTargetObjects(undefined, target.model, target.placement);
}

function nextImageTargetObjectsForUpdate(
  existingTarget: ImageTargetEntry,
  body: ImageTargetRequestBody,
  groups: ImageTargetGroup[],
): ImageTargetObject[] {
  if (body.objects !== undefined) {
    return normalizeImageTargetObjects(body.objects, undefined, undefined, groups);
  }

  const existingObjects = normalizeImageTargetObjects(
    imageTargetObjectsFromStoredTarget(existingTarget),
    undefined,
    undefined,
    groups,
  );
  const firstModelIndex = existingObjects.findIndex(isImageTargetModelObject);
  if (firstModelIndex === -1) {
    return existingObjects.length > 0
      ? existingObjects
      : normalizeImageTargetObjects(undefined, body.model, body.placement, groups);
  }

  if (body.model === undefined && body.placement === undefined) {
    return existingObjects;
  }

  return existingObjects.map((object, index) => index === firstModelIndex && isImageTargetModelObject(object)
    ? {
        ...object,
        model: normalizeImageTargetModel(body.model) ?? object.model,
        placement: normalizeImageTargetPlacement(body.placement, object.placement),
      }
    : object);
}

function normalizeImageTargetPlacement(
  value: unknown,
  fallback: ImageTargetPlacement = defaultImageTargetPlacement(),
): ImageTargetPlacement {
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const candidate = value as Record<string, unknown>;
  return {
    scale: normalizeFinitePlacementNumber(candidate.scale, fallback.scale, 0.1, 5),
    offset_x: normalizeFinitePlacementNumber(candidate.offset_x, fallback.offset_x, -1, 1),
    offset_y: normalizeFinitePlacementNumber(candidate.offset_y, fallback.offset_y, -1, 1),
    height: normalizeFinitePlacementNumber(candidate.height, fallback.height, 0, 1),
    rotation_x: normalizeImageTargetDegrees(candidate.rotation_x, fallback.rotation_x),
    rotation_y: normalizeImageTargetDegrees(candidate.rotation_y, fallback.rotation_y),
    rotation_z: normalizeImageTargetDegrees(candidate.rotation_z, fallback.rotation_z),
  };
}

function defaultImageTargetPlacement(): ImageTargetPlacement {
  return { scale: 1, offset_x: 0, offset_y: 0, height: 0.12, rotation_x: 0, rotation_y: 0, rotation_z: 0 };
}

function defaultLocalImageTargetPlacement(): ImageTargetPlacement {
  return { scale: 1, offset_x: 0, offset_y: 0, height: 0, rotation_x: 0, rotation_y: 0, rotation_z: 0 };
}

function normalizeLocalImageTargetPlacement(value: unknown): ImageTargetPlacement {
  const fallback = defaultLocalImageTargetPlacement();
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const candidate = value as Record<string, unknown>;
  return {
    scale: normalizeFinitePlacementNumber(candidate.scale, fallback.scale, 0.1, 5),
    offset_x: normalizeFinitePlacementNumber(candidate.offset_x, fallback.offset_x, -2, 2),
    offset_y: normalizeFinitePlacementNumber(candidate.offset_y, fallback.offset_y, -2, 2),
    height: normalizeFinitePlacementNumber(candidate.height, fallback.height, -2, 2),
    rotation_x: normalizeImageTargetDegrees(candidate.rotation_x, fallback.rotation_x),
    rotation_y: normalizeImageTargetDegrees(candidate.rotation_y, fallback.rotation_y),
    rotation_z: normalizeImageTargetDegrees(candidate.rotation_z, fallback.rotation_z),
  };
}

function normalizeFinitePlacementNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeImageTargetDegrees(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : Number(wrapped.toFixed(3));
}

function normalizeImageTargetAnimation(value: unknown): ImageTargetAnimation {
  if (!value || typeof value !== 'object') {
    return defaultImageTargetAnimation();
  }

  const candidate = value as Record<string, unknown>;
  if (Array.isArray(candidate.tracks)) {
    const tracks = candidate.tracks
      .map(normalizeImageTargetAnimationTrack)
      .filter((track): track is ImageTargetAnimationTrack => Boolean(track))
      .slice(0, 16);
    return {
      preset: normalizeImageTargetAnimationPreset(candidate.preset) ?? (tracks.length > 0 ? 'custom' : 'none'),
      tracks,
      ...(candidate.spin_axis !== undefined ? { spin_axis: normalizeImageTargetSpinAxis(candidate.spin_axis) } : {}),
      ...(typeof candidate.spin_speed === 'number' ? { spin_speed: normalizeFiniteAnimationNumber(candidate.spin_speed, 0, -6, 6) } : {}),
      ...(typeof candidate.bob_height === 'number' ? { bob_height: normalizeFiniteAnimationNumber(candidate.bob_height, 0, 0, 1) } : {}),
      ...(typeof candidate.bob_speed === 'number' ? { bob_speed: normalizeFiniteAnimationNumber(candidate.bob_speed, 0, 0, 8) } : {}),
    };
  }
  return {
    spin_axis: normalizeImageTargetSpinAxis(candidate.spin_axis),
    spin_speed: normalizeFiniteAnimationNumber(candidate.spin_speed, 0.22, -6, 6),
    bob_height: normalizeFiniteAnimationNumber(candidate.bob_height, 0, 0, 1),
    bob_speed: normalizeFiniteAnimationNumber(candidate.bob_speed, 0, 0, 8),
  };
}

function defaultImageTargetAnimation(): ImageTargetAnimation {
  return { preset: 'none', tracks: [] };
}

function normalizeImageTargetSpinAxis(value: unknown): ImageTargetSpinAxis {
  return value === 'none' || value === 'x' || value === 'y' || value === 'z' ? value : 'z';
}

function normalizeFiniteAnimationNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeImageTargetAnimationPreset(value: unknown): ImageTargetAnimationPreset | null {
  return value === 'none' || value === 'gentle-float' || value === 'turntable' || value === 'showcase'
    || value === 'sway' || value === 'pulse' || value === 'orbit' || value === 'bounce' || value === 'custom'
    ? value
    : null;
}

function normalizeImageTargetAnimationTrack(value: unknown): ImageTargetAnimationTrack | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const property = normalizeImageTargetAnimationProperty(candidate.property);
  if (!property) {
    return null;
  }
  const requestedMotion = candidate.motion === 'smooth' || candidate.motion === 'triangle' || candidate.motion === 'spin'
    ? candidate.motion
    : 'smooth';
  const motion = requestedMotion === 'spin' && !property.startsWith('rotation_') ? 'smooth' : requestedMotion;
  const amountBounds = property.startsWith('position_') ? [-2, 2]
    : property.startsWith('rotation_') ? [-720, 720]
      : [-0.9, 3];
  const rawPhase = normalizeFiniteAnimationNumber(candidate.phase, 0, -3600, 3600) % 360;
  return {
    property,
    motion,
    amount: normalizeFiniteAnimationNumber(candidate.amount, 0, amountBounds[0], amountBounds[1]),
    speed: normalizeFiniteAnimationNumber(candidate.speed, 0, -4, 4),
    phase: rawPhase < 0 ? rawPhase + 360 : rawPhase,
  };
}

function normalizeImageTargetAnimationProperty(value: unknown): ImageTargetAnimationProperty | null {
  return value === 'position_x' || value === 'position_y' || value === 'position_z'
    || value === 'rotation_x' || value === 'rotation_y' || value === 'rotation_z' || value === 'scale'
    ? value
    : null;
}

function normalizeImageTargetGroups(value: unknown): ImageTargetGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenIds = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const candidate = item as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    if (!id || !label || seenIds.has(id)) {
      return [];
    }
    seenIds.add(id);
    return [{
      id,
      label,
      placement: normalizeImageTargetPlacement(candidate.placement),
      animation: normalizeImageTargetAnimation(candidate.animation),
    }];
  });
}

function usedImageTargetGroups(groups: ImageTargetGroup[], objects: ImageTargetObject[]): ImageTargetGroup[] {
  const usedIds = new Set(objects.flatMap((object) => object.group_id ? [object.group_id] : []));
  return groups.filter((group) => usedIds.has(group.id));
}

function isImageTargetModelObject(object: ImageTargetObject): object is ImageTargetModelObject {
  return object.kind === 'model';
}

function normalizeImageTargetText(value: unknown): ImageTargetText | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const textValue = typeof candidate.value === 'string' ? candidate.value.trim() : '';
  if (!textValue || [...textValue].length > 512) {
    return null;
  }
  const language = normalizeImageTargetTextEnum(candidate.language, imageTargetTextLanguages, 'english');
  const font = normalizeImageTargetTextEnum(candidate.font, imageTargetTextFonts, 'studio-sans');
  const fillMode = normalizeImageTargetTextEnum(candidate.fill_mode, imageTargetTextFillModes, 'solid');
  const gradientDirection = normalizeImageTargetTextEnum(
    candidate.gradient_direction,
    imageTargetTextGradientDirections,
    'horizontal',
  );
  const stylePreset = normalizeImageTargetTextEnum(candidate.style_preset, imageTargetTextStylePresets, 'blue-shine');
  const color = normalizeImageTargetColor(candidate.color, '#2563eb');
  const gradientStart = normalizeImageTargetColor(candidate.gradient_start, '#2563eb');
  const gradientEnd = normalizeImageTargetColor(candidate.gradient_end, '#60a5fa');
  const sideColor = normalizeImageTargetColor(candidate.side_color, '#1d4ed8');
  if (!language || !font || !fillMode || !gradientDirection || !stylePreset || !color || !gradientStart || !gradientEnd || !sideColor) {
    return null;
  }
  return {
    value: textValue,
    language: language as ImageTargetText['language'],
    font,
    color,
    fill_mode: fillMode as ImageTargetText['fill_mode'],
    gradient_start: gradientStart,
    gradient_end: gradientEnd,
    gradient_direction: gradientDirection as ImageTargetText['gradient_direction'],
    side_color: sideColor,
    depth: normalizeFiniteAnimationNumber(candidate.depth, 0.055, 0.02, 0.16),
    bevel: normalizeFiniteAnimationNumber(candidate.bevel, 0.004, 0, 0.024),
    gloss: normalizeFiniteAnimationNumber(candidate.gloss, 0.68, 0, 1),
    style_preset: stylePreset,
  };
}

function normalizeImageTargetTextEnum(
  value: unknown,
  allowed: Set<string>,
  fallback: string,
): string | null {
  if (value === undefined) {
    return fallback;
  }
  return typeof value === 'string' && allowed.has(value) ? value : null;
}

function normalizeImageTargetColor(value: unknown, fallback: string): string | null {
  if (value === undefined) {
    return fallback;
  }
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
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

function toSessionUser(user: StoredUser, targetIndex: ImageTargetsIndex): Record<string, unknown> {
  const entitlements = effectiveEntitlementsForUser(user);
  const usage = imageTargetUsageForUser(user.email, targetIndex.targets);
  const accountAccess = resolveAccountAccess(user, entitlements, usage.targets);
  return {
    ...toPublicUser(user),
    plan: entitlements.plan,
    effective_entitlements: effectiveEntitlementsResponse(entitlements),
    usage,
    account_access: accountAccessResponse(accountAccess),
  };
}

function toAdminUser(
  user: StoredUser,
  targetIndex: ImageTargetsIndex,
  auditEvents: AuditEvent[],
): Record<string, unknown> {
  const lastActivityAt = auditEvents.find((event) => event.actor === user.email || event.target === user.email)?.created_at;
  return {
    ...toSessionUser(user, targetIndex),
    entitlement_overrides: normalizeEntitlementOverrides(user.entitlement_overrides),
    created_at: user.created_at,
    updated_at: user.updated_at,
    ...(user.approved_at ? { approved_at: user.approved_at } : {}),
    ...(user.approved_by ? { approved_by: user.approved_by } : {}),
    ...(lastActivityAt ? { last_activity_at: lastActivityAt } : {}),
  };
}

function effectiveEntitlementsForUser(user: StoredUser): EffectiveEntitlements {
  return resolveEffectiveEntitlements({
    role: user.role,
    plan: normalizePlanId(user.plan) ?? undefined,
    entitlementOverrides: normalizeEntitlementOverrides(user.entitlement_overrides),
  });
}

function effectiveEntitlementsResponse(entitlements: EffectiveEntitlements): Record<string, unknown> {
  return {
    plan: entitlements.plan,
    features: { ...entitlements.features },
    max_targets: entitlements.maxTargets,
    max_objects_per_target: entitlements.maxObjectsPerTarget,
  };
}

function accountAccessResponse(access: AccountAccess): Record<string, unknown> {
  return {
    state: access.state,
    locked: access.locked,
    target_count: access.targetCount,
    max_targets: access.maxTargets,
    excess_targets: access.excessTargets,
  };
}

function imageTargetUsageForUser(email: string, targets: ImageTargetEntry[]): {
  targets: number;
  objects: number;
  model_objects: number;
  text_objects: number;
  groups: number;
  links: Record<ImageTargetAccessMode | 'total', number>;
} {
  const ownedTargets = targets.filter((target) => normalizeEmail(target.owner_email) === email);
  const links: Record<ImageTargetAccessMode | 'total', number> = {
    total: 0,
    owner_only: 0,
    anyone_with_link: 0,
    any_signed_in: 0,
    specific_accounts: 0,
  };
  let objects = 0;
  let modelObjects = 0;
  let textObjects = 0;
  let groups = 0;
  for (const target of ownedTargets) {
    objects += target.objects.length;
    modelObjects += target.objects.filter(isImageTargetModelObject).length;
    textObjects += target.objects.filter((object) => object.kind === 'text').length;
    groups += target.groups.length;
    const accessMode = imageTargetAccessMode(target);
    links.total += 1;
    links[accessMode] += 1;
  }
  return {
    targets: ownedTargets.length,
    objects,
    model_objects: modelObjects,
    text_objects: textObjects,
    groups,
    links,
  };
}

function normalizeAccountStatus(value: unknown): AccountStatus | null {
  return value === 'active' || value === 'pending' || value === 'disabled' ? value : null;
}

type MarkArAccessContext = {
  user: StoredUser;
  entitlements: EffectiveEntitlements;
  account: AccountAccess;
  targetCount: number;
};

function markArAccessContext(user: StoredUser, targetIndex: ImageTargetsIndex): MarkArAccessContext {
  const entitlements = effectiveEntitlementsForUser(user);
  const targetCount = targetIndex.targets.filter((target) => target.owner_email === user.email).length;
  return {
    user,
    entitlements,
    account: resolveAccountAccess(user, entitlements, targetCount),
    targetCount,
  };
}

type ImageTargetFeatureUsage = {
  objects: number;
  modelObjects: number;
  textObjects: number;
  groups: number;
  animations: number;
};

function validateImageTargetCreateEntitlements(
  entitlements: EffectiveEntitlements,
  objects: ImageTargetObject[],
  groups: ImageTargetGroup[],
  accessMode: ImageTargetAccessMode,
): Response | null {
  const usage = imageTargetFeatureUsage(objects, groups);
  if (
    entitlements.maxObjectsPerTarget !== null
    && usage.objects > entitlements.maxObjectsPerTarget
  ) {
    return objectQuotaExceededResponse(0, usage.objects, entitlements.maxObjectsPerTarget);
  }
  const featureError = disabledImageTargetUsageFeature(entitlements, usage, {
    objects: 0,
    modelObjects: 0,
    textObjects: 0,
    groups: 0,
    animations: 0,
  });
  if (featureError) {
    return featureError;
  }
  const sharingFeature = sharingFeatureForAccessMode(accessMode);
  return sharingFeature && !entitlements.features[sharingFeature]
    ? featureDeniedResponse(sharingFeature)
    : null;
}

function validateImageTargetUpdateEntitlements(
  entitlements: EffectiveEntitlements,
  existingTarget: ImageTargetEntry,
  nextObjects: ImageTargetObject[],
  nextGroups: ImageTargetGroup[],
  nextAccessMode: ImageTargetAccessMode,
): Response | null {
  const existingObjects = imageTargetObjectsFromStoredTarget(existingTarget);
  const existingGroups = usedImageTargetGroups(
    normalizeImageTargetGroups(existingTarget.groups),
    existingObjects,
  );
  const existingUsage = imageTargetFeatureUsage(existingObjects, existingGroups);
  const nextUsage = imageTargetFeatureUsage(nextObjects, nextGroups);
  const maxObjects = entitlements.maxObjectsPerTarget;
  if (
    maxObjects !== null
    && (
      (existingUsage.objects > maxObjects && nextUsage.objects >= existingUsage.objects)
      || (existingUsage.objects <= maxObjects && nextUsage.objects > maxObjects)
    )
  ) {
    return objectQuotaExceededResponse(existingUsage.objects, nextUsage.objects, maxObjects);
  }

  const featureError = disabledImageTargetUsageFeature(entitlements, nextUsage, existingUsage);
  if (featureError) {
    return featureError;
  }

  const existingAccessMode = imageTargetAccessMode(existingTarget);
  const sharingFeature = sharingFeatureForAccessMode(nextAccessMode);
  return nextAccessMode !== existingAccessMode
    && sharingFeature
    && !entitlements.features[sharingFeature]
    ? featureDeniedResponse(sharingFeature)
    : null;
}

function disabledImageTargetUsageFeature(
  entitlements: EffectiveEntitlements,
  nextUsage: ImageTargetFeatureUsage,
  existingUsage: ImageTargetFeatureUsage,
): Response | null {
  const guardedUsage: Array<{
    feature: FeatureKey;
    next: number;
    existing: number;
  }> = [
    { feature: 'model_objects', next: nextUsage.modelObjects, existing: existingUsage.modelObjects },
    { feature: 'text_objects', next: nextUsage.textObjects, existing: existingUsage.textObjects },
    { feature: 'groups', next: nextUsage.groups, existing: existingUsage.groups },
    { feature: 'animations', next: nextUsage.animations, existing: existingUsage.animations },
  ];
  const disabledIncrease = guardedUsage.find(
    (usage) => !entitlements.features[usage.feature] && usage.next > usage.existing,
  );
  return disabledIncrease ? featureDeniedResponse(disabledIncrease.feature) : null;
}

function imageTargetFeatureUsage(
  objects: ImageTargetObject[],
  groups: ImageTargetGroup[],
): ImageTargetFeatureUsage {
  return {
    objects: objects.length,
    modelObjects: objects.filter(isImageTargetModelObject).length,
    textObjects: objects.filter((object) => object.kind === 'text').length,
    groups: groups.length,
    animations:
      objects.filter((object) => hasActiveImageTargetAnimation(object.animation)).length
      + groups.filter((group) => hasActiveImageTargetAnimation(group.animation)).length,
  };
}

function hasActiveImageTargetAnimation(animation: ImageTargetAnimation | undefined): boolean {
  if (!animation) {
    return false;
  }
  if (animation.preset && animation.preset !== 'none') {
    return true;
  }
  if (
    animation.tracks?.some(
      (track) => Math.abs(track.amount) > 0 && Math.abs(track.speed) > 0,
    )
  ) {
    return true;
  }
  if (
    animation.spin_axis
    && animation.spin_axis !== 'none'
    && Math.abs(animation.spin_speed ?? 0) > 0
  ) {
    return true;
  }
  return Math.abs(animation.bob_height ?? 0) > 0 && Math.abs(animation.bob_speed ?? 0) > 0;
}

function objectQuotaExceededResponse(
  currentObjects: number,
  requestedObjects: number,
  maxObjectsPerTarget: number,
): Response {
  return jsonResponse({
    error: 'This target exceeds the account object limit.',
    code: 'object_quota_exceeded',
    current_objects: currentObjects,
    requested_objects: requestedObjects,
    max_objects_per_target: maxObjectsPerTarget,
  }, 403);
}

function imageTargetScanResponse(
  target: ImageTargetEntry,
  entitlements: EffectiveEntitlements | null,
): Record<string, unknown> {
  const animationsEnabled = entitlements?.features.animations ?? true;
  const floorPlacementEnabled = entitlements?.features.floor_placement ?? true;
  const objects = animationsEnabled
    ? target.objects
    : target.objects.map(({ animation: _animation, ...object }) => object);
  const groups = animationsEnabled
    ? target.groups
    : target.groups.map(({ animation: _animation, ...group }) => group);
  return {
    ...target,
    objects,
    groups,
    runtime_capabilities: {
      animations: animationsEnabled,
      floor_placement: floorPlacementEnabled,
    },
  };
}

function accountOverQuotaResponse(
  account: AccountAccess,
  headers?: Record<string, string>,
): Response {
  return jsonResponse({
    error: 'This account must delete extra targets before Mark-AR can be used.',
    code: 'account_over_quota',
    account_access: accountAccessResponse(account),
  }, 423, headers);
}

function featureDeniedResponse(feature: FeatureKey, headers?: Record<string, string>): Response {
  return jsonResponse({
    error: 'This Mark-AR functionality is disabled for the account.',
    code: 'feature_disabled',
    feature,
  }, 403, headers);
}

function sharingFeatureForAccessMode(mode: ImageTargetAccessMode): FeatureKey | null {
  if (mode === 'anyone_with_link') {
    return 'share_link';
  }
  if (mode === 'any_signed_in') {
    return 'share_signed_in';
  }
  if (mode === 'specific_accounts') {
    return 'share_specific_accounts';
  }
  return null;
}

async function reloadStoredUser(env: WorkerEnv, email: string): Promise<StoredUser | null> {
  const index = await readUsersIndex(env);
  return index.users.find((user) => user.email === email) ?? null;
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
  if (await isSessionRevoked(env, payload.jti)) {
    return jsonResponse({ error: 'Login required.' }, 401);
  }

  const index = await readUsersIndex(env);
  const user = index.users.find((entry) => entry.email === payload.sub);
  if (!user) {
    return jsonResponse({ error: 'Login required.' }, 401);
  }

  if (user.status !== 'active') {
    return jsonResponse({
      error: user.status === 'disabled'
        ? 'Account disabled by admin.'
        : 'Account pending admin approval.',
    }, 403);
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

  if (auth.user.role !== 'admin' || auth.user.email !== getAdminEmail(env)) {
    return jsonResponse({ error: 'Admin access required.' }, 403);
  }

  return auth;
}

async function readOptionalApprovedUser(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<{ user: StoredUser } | null> {
  const auth = await readOptionalStoredUser(request, env, deps);
  return auth?.user.status === 'active' ? auth : null;
}

async function readOptionalStoredUser(
  request: Request,
  env: WorkerEnv,
  deps: GenerateModelDeps,
): Promise<{ user: StoredUser } | null> {
  const token = readBearerToken(request);
  if (!token || !env.AUTH_SECRET) {
    return null;
  }

  const payload = await verifySessionToken(token, env, deps.now());
  if (!payload || (await isSessionRevoked(env, payload.jti))) {
    return null;
  }

  const index = await readUsersIndex(env);
  const user = index.users.find((entry) => entry.email === payload.sub);
  return user ? { user } : null;
}

function isModelVisibleToUser(model: GeneratedModelEntry, user: StoredUser | null): boolean {
  if (user?.role === 'admin') {
    return true;
  }
  if ((model.visibility ?? 'public') === 'public') {
    return true;
  }
  return Boolean(user && model.owner_email === user.email);
}

function canManageGeneratedModel(model: GeneratedModelEntry, user: StoredUser): boolean {
  if (user.role === 'admin') {
    return true;
  }
  return Boolean(model.owner_email && model.owner_email === user.email);
}

function isImageTargetVisibleToUser(target: ImageTargetEntry, user: StoredUser | null): boolean {
  if (user?.role === 'admin') {
    return true;
  }
  if ((target.visibility ?? 'private') === 'public') {
    return true;
  }
  return Boolean(user && target.owner_email === user.email);
}

function canScanImageTarget(target: ImageTargetEntry, user: StoredUser): boolean {
  if (user.role === 'admin') {
    return true;
  }
  const ownerEmail = target.owner_email?.trim().toLowerCase();
  const userEmail = user.email.trim().toLowerCase();
  if (ownerEmail && ownerEmail === userEmail) {
    return true;
  }
  const accessMode = imageTargetAccessMode(target);
  if (accessMode === 'any_signed_in') {
    return true;
  }
  return accessMode === 'specific_accounts'
    && normalizeStoredAllowedEmails(target.allowed_emails, ownerEmail).includes(userEmail);
}

function canManageImageTarget(target: ImageTargetEntry, user: StoredUser): boolean {
  if (user.role === 'admin') {
    return true;
  }
  return Boolean(target.owner_email && target.owner_email === user.email);
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

async function serveImageTarget(objectKey: string, env: WorkerEnv): Promise<Response> {
  if (!env.MODEL_BUCKET) {
    return jsonResponse({ error: 'Model bucket binding is not configured.' }, 500);
  }
  if (!objectKey.startsWith(imageTargetImagePrefix)) {
    return jsonResponse({ error: 'Image target not found.' }, 404);
  }

  const object = await env.MODEL_BUCKET.get(objectKey);
  if (!object?.body) {
    return jsonResponse({ error: 'Image target not found.' }, 404);
  }

  return new Response(object.body, {
    headers: {
      ...corsHeaders,
      'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

async function readJob(env: WorkerEnv, jobId: string): Promise<StoredJob | null> {
  return readJsonObject<StoredJob | null>(env, jobStorageKey(jobId), null);
}

async function saveJob(env: WorkerEnv, job: StoredJob): Promise<void> {
  await writeJsonObject(env, jobStorageKey(job.id), job);
  await rememberJob(env, job.id);
}

async function readJobsIndex(env: WorkerEnv): Promise<JobsIndex> {
  return readJsonObject<JobsIndex>(env, pendingJobsIndexKey, { pending: [] });
}

async function readJobsHistoryIndex(env: WorkerEnv): Promise<JobsHistoryIndex> {
  return readJsonObject<JobsHistoryIndex>(env, jobHistoryIndexKey, { jobs: [] });
}

async function rememberJob(env: WorkerEnv, jobId: string): Promise<void> {
  const history = await readJobsHistoryIndex(env);
  if (history.jobs.includes(jobId)) {
    return;
  }
  await writeJsonObject(env, jobHistoryIndexKey, { jobs: [jobId, ...history.jobs].slice(0, 500) });
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

async function readKnownJobs(env: WorkerEnv): Promise<StoredJob[]> {
  const [pending, history] = await Promise.all([readJobsIndex(env), readJobsHistoryIndex(env)]);
  const jobIds = [...new Set([...history.jobs, ...pending.pending])];
  const jobs = await Promise.all(jobIds.map((jobId) => readJob(env, jobId)));
  return jobs.filter((job): job is StoredJob => Boolean(job));
}

async function readGeneratedModelsIndex(env: WorkerEnv): Promise<GeneratedModelsIndex> {
  return readJsonObject<GeneratedModelsIndex>(env, generatedModelsIndexKey, { models: [] });
}

async function readImageTargetsIndex(env: WorkerEnv): Promise<ImageTargetsIndex> {
  const index = await readJsonObject<ImageTargetsIndex>(env, imageTargetsIndexKey, { targets: [] });
  return {
    targets: index.targets.map((target) => normalizeStoredImageTarget(target)),
  };
}

async function writeImageTargetsIndex(env: WorkerEnv, index: ImageTargetsIndex): Promise<void> {
  await writeJsonObject(env, imageTargetsIndexKey, index);
}

async function ensureImageTargetScanIds(
  env: WorkerEnv,
  index: ImageTargetsIndex,
  user: StoredUser,
  deps: GenerateModelDeps,
): Promise<void> {
  const changedTargets = index.targets.filter((target) => !target.scan_id && canManageImageTarget(target, user));
  if (changedTargets.length === 0) {
    return;
  }
  for (const target of changedTargets) {
    target.scan_id = deps.randomUUID?.() ?? crypto.randomUUID();
  }
  await Promise.all(changedTargets.map((target) => writeJsonObject(env, imageTargetRecordKey(target.id), target)));
  await writeImageTargetsIndex(env, index);
}

async function upsertImageTargetEntry(env: WorkerEnv, entry: ImageTargetEntry): Promise<void> {
  const index = await readImageTargetsIndex(env);
  const existingIndex = index.targets.findIndex((target) => target.id === entry.id);
  if (existingIndex >= 0) {
    index.targets[existingIndex] = entry;
  } else {
    index.targets.push(entry);
  }
  await writeImageTargetsIndex(env, index);
  await writeJsonObject(env, imageTargetRecordKey(entry.id), entry);
}

function imageTargetRecordKey(targetId: string): string {
  return `${imageTargetRecordPrefix}${safeObjectKeyPart(targetId)}.json`;
}

function createUniqueImageTargetId(existingTargets: ImageTargetEntry[], now: Date, label: string): string {
  const baseId = `target-${formatTimestamp(now)}-${slugifyModelLabel(label)}`;
  if (!existingTargets.some((target) => target.id === baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingTargets.some((target) => target.id === `${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function normalizeStoredImageTarget(target: ImageTargetEntry): ImageTargetEntry {
  const normalizedGroups = normalizeImageTargetGroups(target.groups);
  const objects = normalizeImageTargetObjects(target.objects, target.model, target.placement, normalizedGroups);
  const groups = usedImageTargetGroups(normalizedGroups, objects);
  const firstModel = objects.find(isImageTargetModelObject);
  const { model: _storedModel, placement: _storedPlacement, ...targetWithoutAliases } = target;
  return {
    ...targetWithoutAliases,
    ...(firstModel ? {
      model: firstModel.model,
      placement: firstModel.placement,
    } : {}),
    objects,
    groups,
    visibility: target.visibility ?? 'private',
    access_mode: imageTargetAccessMode(target),
    allowed_emails: normalizeStoredAllowedEmails(target.allowed_emails, target.owner_email),
  };
}

async function readUsersIndex(env: WorkerEnv): Promise<UsersIndex> {
  const index = await readJsonObject<UsersIndex>(env, usersIndexKey, { users: [] });
  const adminEmail = getAdminEmail(env);
  return {
    users: index.users.map((user) => ({
      ...user,
      role: user.email === adminEmail ? 'admin' : 'user',
      status: normalizeAccountStatus(user.status) ?? 'pending',
      plan: normalizePlanId(user.plan) ?? 'starter',
      entitlement_overrides: normalizeEntitlementOverrides(user.entitlement_overrides),
    })),
  };
}

async function writeUsersIndex(env: WorkerEnv, index: UsersIndex): Promise<void> {
  const adminEmail = getAdminEmail(env);
  await writeJsonObject(env, usersIndexKey, {
    users: index.users.map((user) => ({
      ...user,
      role: user.email === adminEmail ? 'admin' : 'user',
      status: normalizeAccountStatus(user.status) ?? 'pending',
      plan: normalizePlanId(user.plan) ?? 'starter',
      entitlement_overrides: normalizeEntitlementOverrides(user.entitlement_overrides),
    })),
  });
}

async function withMutationLease(
  env: WorkerEnv,
  scope: 'auth' | 'targets',
  operation: () => Promise<Response>,
): Promise<Response> {
  if (!env.MUTATION_COORDINATOR) {
    return jsonResponse({ error: 'Secure mutation coordination is unavailable.' }, 503);
  }

  const leaseId = randomBase64UrlBytes(18);
  const stub = env.MUTATION_COORDINATOR.get(env.MUTATION_COORDINATOR.idFromName(scope));
  let acquired = false;
  try {
    const acquireResponse = await stub.fetch(new Request('https://mutation-coordinator.internal/lease', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'acquire', leaseId, ttlMs: 30_000 }),
    }));
    if (acquireResponse.status === 409) {
      return jsonResponse({ error: 'Another secure mutation is already in progress.' }, 409);
    }
    if (!acquireResponse.ok) {
      return jsonResponse({ error: 'Secure mutation coordination is unavailable.' }, 503);
    }
    acquired = true;
    return await operation();
  } catch {
    return jsonResponse({ error: 'Secure mutation coordination is unavailable.' }, 503);
  } finally {
    if (acquired) {
      try {
        await stub.fetch(new Request('https://mutation-coordinator.internal/lease', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'release', leaseId }),
        }));
      } catch {
        // The lease expires automatically after a short timeout.
      }
    }
  }
}

async function readRevokedSessionsIndex(env: WorkerEnv): Promise<RevokedSessionsIndex> {
  return readJsonObject<RevokedSessionsIndex>(env, revokedSessionsIndexKey, { revoked: [] });
}

async function revokeSession(env: WorkerEnv, sessionId: string): Promise<void> {
  const index = await readRevokedSessionsIndex(env);
  if (index.revoked.includes(sessionId)) {
    return;
  }
  await writeJsonObject(env, revokedSessionsIndexKey, { revoked: [sessionId, ...index.revoked].slice(0, 1000) });
}

async function isSessionRevoked(env: WorkerEnv, sessionId: string): Promise<boolean> {
  const index = await readRevokedSessionsIndex(env);
  return index.revoked.includes(sessionId);
}

async function consumeRateLimit(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  key: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<{ allowed: boolean }> {
  const storageKey = `${rateLimitKeyPrefix}${safeObjectKeyPart(key)}.json`;
  const now = deps.now();
  const existing = await readJsonObject<RateLimitEntry | null>(env, storageKey, null);
  const resetAt = existing ? new Date(existing.reset_at) : null;

  if (!existing || !resetAt || resetAt.getTime() <= now.getTime()) {
    await writeJsonObject(env, storageKey, {
      count: 1,
      reset_at: new Date(now.getTime() + windowSeconds * 1000).toISOString(),
    } satisfies RateLimitEntry);
    return { allowed: true };
  }

  if (existing.count >= maxAttempts) {
    return { allowed: false };
  }

  await writeJsonObject(env, storageKey, {
    count: existing.count + 1,
    reset_at: existing.reset_at,
  } satisfies RateLimitEntry);
  return { allowed: true };
}

async function appendAuditEvent(
  env: WorkerEnv,
  deps: GenerateModelDeps,
  event: Omit<AuditEvent, 'created_at'>,
): Promise<void> {
  try {
    const index = await readJsonObject<AuditLogIndex>(env, auditLogIndexKey, { events: [] });
    await writeJsonObject(env, auditLogIndexKey, {
      events: [
        {
          ...event,
          created_at: deps.now().toISOString(),
        },
        ...index.events,
      ].slice(0, 1000),
    } satisfies AuditLogIndex);
  } catch {
    // Audit logging should not block the user-facing request path.
  }
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
    owner_email: job.owner_email,
    visibility: job.visibility ?? 'private',
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
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
    completed_at: job.completed_at,
    failed_at: job.failed_at,
    owner_email: job.owner_email,
    visibility: job.visibility,
    target_object: job.target_object,
    pipeline: job.pipeline,
    stage: job.stage,
    source_transcript: job.source_transcript,
    generation_prompt: job.generation_prompt,
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

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function applyCorsHeaders(response: Response, request: Request, env: WorkerEnv): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  headers.set('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  const requestOrigin = request.headers.get('Origin');
  const allowedOrigin = requestOrigin ? allowedCorsOrigin(env, requestOrigin) : null;
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    headers.set('Vary', appendVaryOrigin(headers.get('Vary')));
  } else if (!requestOrigin) {
    headers.set('Access-Control-Allow-Origin', '*');
  } else {
    headers.delete('Access-Control-Allow-Origin');
    headers.set('Vary', appendVaryOrigin(headers.get('Vary')));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function allowedCorsOrigin(env: WorkerEnv, requestOrigin: string): string | null {
  const allowedOrigins =
    env.ALLOWED_ORIGINS?.split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean) ?? defaultAllowedOrigins;
  const normalizedOrigin = requestOrigin.replace(/\/+$/, '');
  if (allowedOrigins.includes(normalizedOrigin) || isLocalDevelopmentOrigin(normalizedOrigin)) {
    return normalizedOrigin;
  }
  return null;
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && localDevelopmentHostnames.has(url.hostname);
  } catch {
    return false;
  }
}

async function readAuditLogIndex(env: WorkerEnv): Promise<AuditLogIndex> {
  return readJsonObject<AuditLogIndex>(env, auditLogIndexKey, { events: [] });
}

function appendVaryOrigin(value: string | null): string {
  if (!value) {
    return 'Origin';
  }
  return value
    .split(',')
    .map((part) => part.trim())
    .some((part) => part.toLowerCase() === 'origin')
    ? value
    : `${value}, Origin`;
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

function createSpeechJobId(date: Date, audioBase64: string): string {
  return `speech-${formatTimestamp(date).replace('-', '')}-${fnv1aHash(audioBase64)}`;
}

function createTextJobId(date: Date, text: string): string {
  return `text-${formatTimestamp(date).replace('-', '')}-${fnv1aHash(text)}`;
}

function fnv1aHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
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
    jti: randomBase64UrlBytes(18),
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
    if (!payload.sub || !payload.jti || !payload.exp || payload.exp < Math.floor(now.getTime() / 1000)) {
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
