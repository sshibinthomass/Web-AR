import type * as Three from 'three';
import type { GestureController } from '../interaction/GestureController';
import type { ObjectTransformController } from '../interaction/ObjectTransformController';
import type { HitTestManager } from '../xr/HitTestManager';
import type { PlaneTrackingManager } from '../xr/PlaneTrackingManager';
import { MODEL_OPTIONS, type ModelOption } from './models';
import {
  captureVideoFrame,
  imageFileToCapturedImage,
  startCameraPreview,
  stopCameraPreview,
  type CapturedImage,
} from '../capture/cameraCapture';
import {
  startAudioRecording,
  type AudioRecordingSession,
  type RecordedAudio,
} from '../capture/audioCapture';
import { compressThumbnailImage } from '../capture/thumbnailCompression';
import type { ModelPreviewViewer } from '../scene/ModelPreviewViewer';
import {
  cleanupFailedJobArtifacts as cleanupFailedJobArtifactsRequest,
  extractImageFor3D,
  deleteGeneratedModel as deleteGeneratedModelRequest,
  generateModelFromImage,
  getGeneratedModelJobStatus,
  listGeneratedModels,
  listAdminJobs as listAdminJobsRequest,
  renameGeneratedModel as renameGeneratedModelRequest,
  retryAdminJob as retryAdminJobRequest,
  startSpeechModelJob,
  startTextModelJob,
  startGeneratedModelJob,
  storeUploadedModel as storeUploadedModelRequest,
  toggleGeneratedModelVisibility as toggleGeneratedModelVisibilityRequest,
  updateGeneratedModelThumbnail as updateGeneratedModelThumbnailRequest,
  type GeneratedModelJobStatus,
  type GenerationPipeline,
  type StartSpeechModelJobResult,
} from '../services/generatedModelClient';
import {
  approveAccount as approveAccountRequest,
  clearAuthToken,
  getCurrentUser,
  listAccounts,
  loadAuthToken,
  login as loginRequest,
  logout as logoutRequest,
  removeAccount as removeAccountRequest,
  saveAuthToken,
  signup as signupRequest,
  type AuthUser,
} from '../services/authClient';
import { AppState } from '../state/AppState';
import { getAccountDisplayName } from '../ui/accountIdentity';
import { ARHud } from '../ui/ARHud';
import type { HudRoute } from '../ui/routes';
import { getGenerateModelApiUrl } from './config';
import type { ARRuntime, PlacementGestureZone, Point2, SceneContext } from './arRuntime';

export class WebARApp {
  private arRuntime: ARRuntime | null = null;
  private sceneContext: SceneContext | null = null;
  private hud: ARHud | null = null;
  private gestureController: GestureController | null = null;
  private hitTestManager: HitTestManager | null = null;
  private planeTrackingManager: PlaneTrackingManager | null = null;
  private readonly appState = new AppState();
  private transformController: ObjectTransformController | null = null;
  private layoutSceneManager: InstanceType<ARRuntime['LayoutSceneManager']> | null = null;
  private clock: Three.Clock | null = null;
  private activeModelAnimation: {
    mixer: Three.AnimationMixer;
    root: Three.Object3D;
    clips: Three.AnimationClip[];
    activeIndex: number;
  } | null = null;
  private cameraStream: MediaStream | null = null;
  private capturedImage: CapturedImage | null = null;
  private capturedImageGenerationPipeline: GenerationPipeline = 'openai-to-3d';
  private capturedImagePreviewUrl: string | null = null;
  private speechRecordingSession: AudioRecordingSession | null = null;
  private speechAudio: RecordedAudio | null = null;
  private speechJobWatchToken = 0;
  private readonly speechJobPollDelayMs = 5000;
  private placementDragMode: PlacementGestureZone | null = null;
  private placementDragStart: Point2 | null = null;
  private layoutGestureStartedOnObject = false;
  private lastHudMode = this.appState.mode;
  private availableModels = [...MODEL_OPTIONS];
  private generatedModelOptions: ModelOption[] = [];
  private uploadedModelOptions: ModelOption[] = [];
  private pendingUploadModelFile: File | null = null;
  private modelPreviewViewer: ModelPreviewViewer | null = null;
  private authToken: string | null = null;
  private currentUser: AuthUser | null = null;
  private layoutMode = false;

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    this.authToken = loadAuthToken();
    this.hud = new ARHud(this.root, MODEL_OPTIONS, {
      onPlace: () => this.placeAtLatestHit(),
      onEdit: () => this.setEditing(),
      onReset: () => this.resetObject(),
      onResetScale: () => this.resetScale(),
      onRotate: (deltaRadians) => this.rotateBy(deltaRadians),
      onModelSelect: (modelId) => void this.loadSelectedModel(modelId),
      onStartCamera: () => void this.startCamera(),
      onCaptureImage: () => void this.captureImage(),
      onUploadImage: (file) => void this.uploadImage(file),
      onUploadModel: (file) => void this.uploadModel(file),
      onSubmitTarget: (targetObject) => void this.submitCapturedImageToGpt(targetObject),
      onGenerateModel: (targetObject) => void this.generateModel(targetObject),
      onFullFlowCapture: (targetObject) => void this.runFullFlow(targetObject),
      onDynamicFlowCapture: (targetObject) => void this.runDynamicFlow(targetObject),
      onStoreUploadedModel: () => void this.storeUploadedModel(),
      onRenameGeneratedModel: (modelId, label) => void this.renameGeneratedModel(modelId, label),
      onDeleteGeneratedModel: (modelId) => void this.deleteGeneratedModel(modelId),
      onToggleGeneratedModelVisibility: (modelId, visibility) => void this.toggleGeneratedModelVisibility(modelId, visibility),
      onDeleteUploadedModel: (modelId) => this.deleteUploadedModel(modelId),
      onPreviewModel: (modelId) => void this.previewModel(modelId),
      onCloseModelPreview: () => this.closeModelPreview(),
      onPreviewLightingChange: (intensity) => this.updateModelPreviewLighting(intensity),
      onPreviewLightDirectionChange: (degrees) => this.updateModelPreviewLightDirection(degrees),
      onPreviewAnimationSelect: (animationIndex) => this.selectModelPreviewAnimation(animationIndex),
      onUpdateModelThumbnail: (modelId, file) => void this.updateModelThumbnail(modelId, file),
      onRouteExit: (previousRoute, nextRoute) => {
        void this.leaveRoute(previousRoute, nextRoute);
      },
      onLogin: (email, password) => void this.login(email, password),
      onSignup: (email, password, name) => void this.signup(email, password, name),
      onLogout: () => void this.logout(),
      onApproveAccount: (email) => void this.approveAccount(email),
      onRemoveAccount: (email) => void this.removeAccount(email),
      onRefreshAdminAccounts: () => void this.refreshAdminAccounts(),
      onRefreshAdminJobs: () => void this.refreshAdminJobs(),
      onRetryAdminJob: (jobId) => void this.retryAdminJob(jobId),
      onCleanupFailedJobArtifacts: () => void this.cleanupFailedJobArtifacts(),
      onStartSpeechRecording: () => void this.startSpeechRecording(),
      onStopSpeechRecording: () => void this.stopSpeechRecording(),
      onGenerateSpeechModel: () => void this.generateSpeechModel(),
      onGenerateTextModel: (text) => void this.generateTextModel(text),
      onAnimationSelect: (animationIndex) => this.selectModelAnimation(animationIndex),
      onStartMultiObject: () => void this.startMultiObjectSession(),
      onAddLayoutObject: () => this.promptForLayoutObject(),
      onDeleteLayoutObject: () => this.deleteSelectedLayoutObject(),
    }, {
      authRestoring: Boolean(this.authToken),
    });
    this.hud.updateModelSource('Cloudflare only');
    if (this.authToken) {
      await this.restoreSession();
    } else {
      this.hud.updateAuthState(null);
    }
    void this.refreshGeneratedModels();
    window.setInterval(() => {
      void this.refreshGeneratedModels();
    }, 60_000);
    window.addEventListener('focus', () => {
      void this.refreshGeneratedModels();
    });
  }

  private async restoreSession(): Promise<void> {
    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    if (!this.authToken) {
      return;
    }

    try {
      const user = await getCurrentUser({ apiUrl, token: this.authToken });
      if (!user) {
        this.clearInvalidSession();
        return;
      }
      this.currentUser = user;
      this.hud?.updateAuthState(user);
      await this.refreshGeneratedModels();
      void this.prepareMultiObject();
    } catch (error) {
      console.warn('Could not restore auth session.', error);
      this.clearInvalidSession();
    }
  }

  private clearInvalidSession(): void {
    this.authToken = null;
    this.currentUser = null;
    clearAuthToken();
    this.hud?.updateAuthState(null);
  }

  private async login(email: string, password: string): Promise<void> {
    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    this.hud?.showAuthMessage('Signing in...');

    try {
      const session = await loginRequest({ apiUrl, email, password });
      if (!session.token) {
        this.hud?.showAuthMessage('Account is waiting for admin approval.', false);
        return;
      }
      this.authToken = session.token;
      this.currentUser = session.user;
      saveAuthToken(session.token);
      this.hud?.updateAuthState(session.user);
      this.hud?.showSessionNotice(
        `Welcome back, ${getAccountDisplayName(session.user)}.`,
      );
      void this.refreshGeneratedModels();
      void this.prepareMultiObject();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed.';
      this.hud?.showAuthMessage(message, true);
    }
  }

  private async signup(email: string, password: string, name: string): Promise<void> {
    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    this.hud?.showAuthMessage('Creating account...');

    try {
      const session = await signupRequest({ apiUrl, email, password, name });
      if (!session.token) {
        this.hud?.showAuthMessage('Account created. Waiting for admin approval.');
        return;
      }
      this.authToken = session.token;
      this.currentUser = session.user;
      saveAuthToken(session.token);
      this.hud?.updateAuthState(session.user);
      this.hud?.showSessionNotice(
        `Welcome, ${getAccountDisplayName(session.user)}.`,
      );
      void this.refreshGeneratedModels();
      void this.prepareMultiObject();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Account creation failed.';
      this.hud?.showAuthMessage(message, true);
    }
  }

  private async logout(): Promise<void> {
    const token = this.authToken;
    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    if (token) {
      await logoutRequest({ apiUrl, token }).catch((error) => {
        console.warn('Could not revoke auth session.', error);
      });
    }
    this.authToken = null;
    this.currentUser = null;
    clearAuthToken();
    this.hud?.completeLogout();
    void this.refreshGeneratedModels();
  }

  private async refreshAdminAccounts(): Promise<void> {
    if (!this.authToken || this.currentUser?.role !== 'admin') {
      return;
    }

    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    try {
      this.hud?.updateAdminAccounts(await listAccounts({ apiUrl, token: this.authToken }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load accounts.';
      this.hud?.showAuthMessage(message, true);
    }
  }

  private async refreshAdminJobs(): Promise<void> {
    if (!this.authToken || this.currentUser?.role !== 'admin') {
      return;
    }

    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    try {
      this.hud?.updateAdminJobs(await listAdminJobsRequest({ apiUrl, authToken: this.authToken }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load jobs.';
      this.hud?.showAdminJobMessage(message, true);
    }
  }

  private async retryAdminJob(jobId: string): Promise<void> {
    if (!this.authToken || this.currentUser?.role !== 'admin') {
      return;
    }

    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    try {
      await retryAdminJobRequest({ apiUrl, jobId, authToken: this.authToken });
      await this.refreshAdminJobs();
      this.hud?.showAdminJobMessage(`Retry queued for ${jobId}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not retry job.';
      this.hud?.showAdminJobMessage(message, true);
    }
  }

  private async cleanupFailedJobArtifacts(): Promise<void> {
    if (!this.authToken || this.currentUser?.role !== 'admin') {
      return;
    }

    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    try {
      const result = await cleanupFailedJobArtifactsRequest({ apiUrl, authToken: this.authToken });
      await this.refreshAdminJobs();
      this.hud?.showAdminJobMessage(`Cleaned ${result.cleaned} orphaned preview${result.cleaned === 1 ? '' : 's'}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not clean failed previews.';
      this.hud?.showAdminJobMessage(message, true);
    }
  }

  private async approveAccount(email: string): Promise<void> {
    if (!this.authToken) {
      return;
    }

    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    try {
      await approveAccountRequest({ apiUrl, email, token: this.authToken });
      await this.refreshAdminAccounts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not approve account.';
      this.hud?.showAuthMessage(message, true);
    }
  }

  private async removeAccount(email: string): Promise<void> {
    if (!this.authToken) {
      return;
    }

    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    try {
      await removeAccountRequest({ apiUrl, email, token: this.authToken });
      await this.refreshAdminAccounts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove account.';
      this.hud?.showAuthMessage(message, true);
    }
  }

  private requireAuthToken(message: string): string | null {
    if (this.authToken) {
      return this.authToken;
    }

    this.hud?.navigateToLogin(message);
    return null;
  }

  private async ensureARRuntime(): Promise<ARRuntime> {
    if (this.arRuntime && this.sceneContext && this.transformController && this.clock) {
      return this.arRuntime;
    }

    const { arRuntime } = await import('./arRuntime');
    this.arRuntime = arRuntime;

    if (!this.sceneContext) {
      const sceneContext = arRuntime.createScene(this.root);
      this.sceneContext = sceneContext;
      this.hitTestManager = new arRuntime.HitTestManager(sceneContext.reticle);
      this.planeTrackingManager = new arRuntime.PlaneTrackingManager(sceneContext.floorGrid);
      this.transformController = new arRuntime.ObjectTransformController();
      const layoutRoot = new arRuntime.THREE.Group();
      layoutRoot.name = 'layout-root';
      sceneContext.scene.add(layoutRoot);
      this.layoutSceneManager = new arRuntime.LayoutSceneManager(layoutRoot);
      this.clock = new arRuntime.THREE.Clock();

      const hud = this.requireHud();
      this.gestureController = new arRuntime.GestureController(hud.gestureSurface, {
        onGestureStart: (point) => {
          this.layoutGestureStartedOnObject = this.selectLayoutObjectAtPoint(point);
        },
        onTap: (point) => this.handleTap(point),
        onDrag: (point, startPoint) => this.handleDrag(point, startPoint),
        onPinch: (multiplier) => this.handlePinch(multiplier),
        onGestureEnd: () => this.resetPlacementDrag(),
      });
      this.gestureController.connect();

      await this.configureXR(sceneContext);

      const controller = sceneContext.renderer.xr.getController(0);
      controller.addEventListener('select', () => this.placeAtLatestHit());
      sceneContext.scene.add(controller);
      sceneContext.renderer.setAnimationLoop((time, frame) => this.render(time, frame));
    }

    return arRuntime;
  }

  private async loadSelectedModel(modelId: string): Promise<void> {
    const modelOption = this.availableModels.find((model) => model.id === modelId);
    if (!modelOption) {
      return;
    }

    if (this.layoutMode) {
      await this.loadLayoutPendingObject(modelOption);
      return;
    }

    const isUploadedModel = modelOption.source === 'uploaded' || modelOption.id.startsWith('uploaded-');
    const sourceLabel = isUploadedModel ? 'uploaded file' : 'Cloudflare';
    await this.loadModelFromUrl(modelOption.url, modelOption.label, {
      loadingMessage: `Loading ${modelOption.label} from ${sourceLabel}...`,
      successMessage: `${modelOption.label} loaded from ${sourceLabel}.`,
      sourceMessage: isUploadedModel ? 'Uploaded GLB' : 'Cloudflare hosted model',
      selectedModelId: modelId,
    });
  }

  private async loadLayoutPendingObject(modelOption: ModelOption): Promise<void> {
    await this.ensureARRuntime();
    this.appState.modelLoaded = false;
    this.hud?.updateModelReady(false);
    this.hud?.updateSelectedModel(modelOption.id);
    const shouldMarkDownload = !(this.hud?.isModelDownloaded(modelOption.id) ?? false);
    if (shouldMarkDownload) {
      this.hud?.markModelDownloadStarted(modelOption.id);
    }
    this.hud?.updateModelSource('Layout object');
    this.hud?.showMultiObjectMessage(`Loading ${modelOption.label} for multi-object placement...`);

    try {
      const { loadGLBModel } = await import('../scene/loadModel');
      const model = await loadGLBModel(modelOption.url);
      this.requireLayoutSceneManager().addObject({
        modelId: modelOption.id,
        modelLabel: modelOption.label,
        modelUrl: modelOption.url,
        model,
      });
      this.appState.modelLoaded = true;
      this.appState.setMode('readyToPlace');
      this.hud?.updateModelReady(true);
      this.hud?.markModelDownloaded(modelOption.id);
      this.hud?.update(this.appState.mode, `${modelOption.label} ready. Tap Place to add it to this layout.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown model loading error.';
      this.appState.modelLoaded = false;
      this.hud?.updateModelReady(false);
      if (shouldMarkDownload) {
        this.hud?.markModelDownloadFailed(modelOption.id);
      }
      this.hud?.showMultiObjectMessage(`Could not load ${modelOption.label}: ${message}`);
    }
  }

  private async loadModelFromUrl(
    modelUrl: string,
    label: string,
    options: {
      loadingMessage: string;
      successMessage: string;
      sourceMessage: string;
      selectedModelId?: string;
    },
  ): Promise<void> {
    await this.ensureARRuntime();
    const sceneContext = this.requireScene();
    const transformController = this.requireTransformController();
    const wasPlaced = this.appState.mode === 'placed' || this.appState.mode === 'editing';
    this.appState.modelLoaded = false;
    this.hud?.updateModelReady(false);
    const shouldMarkDownload =
      options.selectedModelId ? !(this.hud?.isModelDownloaded(options.selectedModelId) ?? false) : false;
    if (options.selectedModelId) {
      this.hud?.updateSelectedModel(options.selectedModelId);
      if (shouldMarkDownload) {
        this.hud?.markModelDownloadStarted(options.selectedModelId);
      }
    }
    this.hud?.updateModelSource(options.sourceMessage);
    this.hud?.update(this.appState.mode, options.loadingMessage);

    try {
      const { loadGLBModel } = await import('../scene/loadModel');
      const model = await loadGLBModel(modelUrl);
      this.stopModelAnimations();
      this.removeLoadedModels(sceneContext.modelRoot);
      sceneContext.modelRoot.add(model);
      this.startModelAnimations(model);
      transformController.setTarget(sceneContext.modelRoot);
      this.appState.modelLoaded = true;
      this.hud?.updateModelReady(true);
      if (!wasPlaced) {
        sceneContext.modelRoot.visible = false;
      }
      this.hud?.update(this.appState.mode, options.successMessage);
      if (options.selectedModelId) {
        this.hud?.markModelDownloaded(options.selectedModelId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown model loading error.';
      this.appState.modelLoaded = false;
      this.hud?.updateModelReady(false);
      if (options.selectedModelId && shouldMarkDownload) {
        this.hud?.markModelDownloadFailed(options.selectedModelId);
      }
      this.appState.setError(`Could not load ${label}: ${message}`);
      this.hud?.update(this.appState.mode, this.appState.lastError ?? undefined);
    }
  }

  private async startCamera(): Promise<void> {
    const preview = this.hud?.cameraPreviewVideo;
    if (!preview) {
      return;
    }

    try {
      stopCameraPreview(this.cameraStream);
      this.clearCapturedImagePreview();
      this.cameraStream = await startCameraPreview(preview);
      this.hud?.updateCameraStatus('Camera ready. Capture one object when the frame is clear.', false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Camera permission was not granted.';
      this.hud?.updateCameraStatus(`Camera unavailable: ${message}`, false);
    }
  }

  private async captureImage(): Promise<void> {
    const preview = this.hud?.cameraPreviewVideo;
    if (!preview) {
      return;
    }

    try {
      this.capturedImage = await captureVideoFrame(preview);
      this.capturedImageGenerationPipeline = 'openai-to-3d';
      stopCameraPreview(this.cameraStream);
      this.cameraStream = null;
      this.setCapturedImagePreview(this.capturedImage.blob);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not capture image.';
      this.hud?.updateCameraStatus(`Capture failed: ${message}`, false);
    }
  }

  private async generateModel(targetObject: string): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to generate 3D models.');
    if (!authToken) {
      return;
    }

    if (!this.capturedImage) {
      this.hud?.updateCameraStatus('Capture an image before generating a 3D model.', false);
      return;
    }

    this.hud?.updateCameraStatus('Starting background generation...', false);

    try {
      const job = await startGeneratedModelJob({
        apiUrl: getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL),
        imageBase64: this.capturedImage.imageBase64,
        imageMimeType: this.capturedImage.imageMimeType,
        targetObject,
        generationPipeline: this.capturedImageGenerationPipeline,
        authToken,
      });
      this.capturedImage = null;
      this.capturedImageGenerationPipeline = 'openai-to-3d';
      this.clearCapturedImagePreview();
      this.hud?.updateGeneratedModelSource(`${job.label} (generating in background)`);
      this.hud?.updateCameraStatus(
        `Generation started: ${job.label}. You can close the app; it will appear in the Model dropdown when ready.`,
        false,
      );
      void this.refreshGeneratedModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown generation error.';
      this.hud?.updateCameraStatus(`Generation failed: ${message}`, true);
    }
  }

  private async submitCapturedImageToGpt(targetObject: string): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to submit images.');
    if (!authToken) {
      return;
    }

    if (!this.capturedImage) {
      this.hud?.updateCameraStatus('Capture an image before submitting it to GPT.', false);
      return;
    }

    this.hud?.updateCameraStatus('Submitting image to GPT for object extraction...', false);

    try {
      const extractedImage = await extractImageFor3D({
        apiUrl: getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL),
        imageBase64: this.capturedImage.imageBase64,
        imageMimeType: this.capturedImage.imageMimeType,
        targetObject,
        authToken,
      });
      const blob = base64ToBlob(extractedImage.imageBase64, extractedImage.imageMimeType);
      this.capturedImage = {
        imageBase64: extractedImage.imageBase64,
        imageMimeType: extractedImage.imageMimeType,
        blob,
      };
      this.capturedImageGenerationPipeline = 'trellis';
      this.setExtractedImagePreview(blob);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GPT extraction failed.';
      this.hud?.updateCameraStatus(`GPT extraction failed: ${message}`, true);
    }
  }

  private async runFullFlow(targetObject: string): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to use Full Flow.');
    if (!authToken) {
      return;
    }

    if (!this.capturedImage) {
      this.hud?.updateCameraStatus('Capture an image before generating a 3D model.', false);
      return;
    }

    try {
      const capturedImage = this.capturedImage;
      const generationPipeline = this.capturedImageGenerationPipeline;
      this.capturedImage = null;
      this.capturedImageGenerationPipeline = 'openai-to-3d';
      this.clearCapturedImagePreview();
      this.hud?.showFullFlowLoading('Building your 3D object in Modal. Keep this page open.');

      const generatedModel = await generateModelFromImage({
        apiUrl: getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL),
        imageBase64: capturedImage.imageBase64,
        imageMimeType: capturedImage.imageMimeType,
        targetObject,
        generationPipeline,
        authToken,
      });

      await this.loadModelFromUrl(generatedModel.modelUrl, 'Generated object', {
        loadingMessage: 'Loading generated object into AR...',
        successMessage: 'Generated object loaded.',
        sourceMessage: 'Generated by Modal',
      });

      this.hud?.showFullFlowReady('Generated object is ready. Scan the floor, then tap Place.', {
        id: 'full-flow-generated-object',
        label: 'Generated object',
        url: generatedModel.modelUrl,
      });
      void this.refreshGeneratedModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Full Flow failed.';
      this.hud?.showFullFlowError(`Full Flow failed: ${message}`);
    }
  }

  private async runDynamicFlow(targetObject: string): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to use Dynamic.');
    if (!authToken) {
      return;
    }

    if (!this.capturedImage) {
      this.hud?.updateCameraStatus('Capture an image before generating a dynamic 3D model.', false);
      return;
    }

    try {
      const capturedImage = this.capturedImage;
      this.capturedImage = null;
      this.capturedImageGenerationPipeline = 'openai-to-3d';
      this.clearCapturedImagePreview();
      this.hud?.showFullFlowLoading('Generating a dynamic image, then building your 3D object in Modal. Keep this page open.');

      const generatedModel = await generateModelFromImage({
        apiUrl: getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL),
        imageBase64: capturedImage.imageBase64,
        imageMimeType: capturedImage.imageMimeType,
        targetObject,
        generationPipeline: 'dynamic',
        authToken,
      });

      await this.loadModelFromUrl(generatedModel.modelUrl, 'Dynamic object', {
        loadingMessage: 'Loading dynamic object into AR...',
        successMessage: 'Dynamic object loaded.',
        sourceMessage: 'Generated by Dynamic Modal flow',
      });

      this.hud?.showFullFlowReady('Dynamic object is ready. Scan the floor, then tap Place.', {
        id: 'dynamic-generated-object',
        label: 'Dynamic object',
        url: generatedModel.modelUrl,
      });
      void this.refreshGeneratedModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dynamic flow failed.';
      this.hud?.showFullFlowError(`Dynamic flow failed: ${message}`);
    }
  }

  private async startSpeechRecording(): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to use Speech to 3D.');
    if (!authToken) {
      return;
    }

    if (this.speechRecordingSession) {
      this.hud?.showSpeechRecording();
      return;
    }

    try {
      stopCameraPreview(this.cameraStream);
      this.cameraStream = null;
      this.speechAudio = null;
      this.speechRecordingSession = await startAudioRecording();
      this.hud?.showSpeechRecording();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Microphone permission was not granted.';
      this.speechRecordingSession = null;
      this.hud?.showSpeechError(`Microphone unavailable: ${message}`);
    }
  }

  private async stopSpeechRecording(): Promise<void> {
    const session = this.speechRecordingSession;
    if (!session) {
      this.hud?.showSpeechError('Start recording before stopping.');
      return;
    }

    this.speechRecordingSession = null;

    try {
      this.speechAudio = await session.stop();
      this.hud?.showSpeechCaptured();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not record speech.';
      this.speechAudio = null;
      this.hud?.showSpeechError(`Speech recording failed: ${message}`);
    }
  }

  private async generateSpeechModel(): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to use Speech to 3D.');
    if (!authToken) {
      return;
    }

    if (!this.speechAudio) {
      this.hud?.showSpeechError('Record speech before generating a 3D model.');
      return;
    }

    const recordedAudio = this.speechAudio;
    this.hud?.showSpeechDetecting();

    try {
      const job = await startSpeechModelJob({
        apiUrl: getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL),
        audioBase64: recordedAudio.audioBase64,
        audioMimeType: recordedAudio.audioMimeType,
        authToken,
      });
      this.speechAudio = null;
      this.hud?.showSpeechBackgroundJob(job);
      void this.refreshGeneratedModels();
      void this.watchSpeechGenerationJob(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech to 3D failed.';
      this.hud?.showSpeechError(`Speech generation failed: ${message}`);
    }
  }

  private async generateTextModel(text: string): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to use Text or Voice to 3D.');
    if (!authToken) {
      return;
    }

    const normalizedText = text.trim().replace(/\s+/g, ' ');
    if (!normalizedText) {
      this.hud?.showSpeechError('Describe the object before generating a 3D model.');
      return;
    }

    this.hud?.showSpeechDetecting(normalizedText);

    try {
      const job = await startTextModelJob({
        apiUrl: getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL),
        text: normalizedText,
        authToken,
      });
      this.hud?.showSpeechBackgroundJob(job);
      void this.refreshGeneratedModels();
      void this.watchSpeechGenerationJob(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Text to 3D failed.';
      this.hud?.showSpeechError(`Text generation failed: ${message}`);
    }
  }

  private async watchSpeechGenerationJob(job: StartSpeechModelJobResult): Promise<void> {
    const watchToken = ++this.speechJobWatchToken;
    await this.pollSpeechGenerationJob(job, watchToken);
  }

  private async pollSpeechGenerationJob(job: StartSpeechModelJobResult, watchToken: number): Promise<void> {
    if (watchToken !== this.speechJobWatchToken) {
      return;
    }

    try {
      const status = await getGeneratedModelJobStatus({
        statusUrl: job.statusUrl,
        authToken: this.authToken,
      });
      this.updateSpeechJobStatus(status);

      if (status.status === 'completed') {
        await this.openCompletedSpeechModelInAR(status);
        return;
      }

      if (status.status === 'failed') {
        this.hud?.showSpeechError(`Speech generation failed: ${status.error ?? 'The background job failed.'}`);
        return;
      }

      window.setTimeout(() => {
        void this.pollSpeechGenerationJob(job, watchToken);
      }, this.speechJobPollDelayMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not check speech generation status.';
      this.hud?.showSpeechError(`Speech generation status failed: ${message}`);
    }
  }

  private updateSpeechJobStatus(status: GeneratedModelJobStatus): void {
    if (status.stage === 'generating_image') {
      this.hud?.showSpeechGeneratingImage(status.transcript);
      return;
    }

    if (status.stage === 'generating_3d' || status.status === 'running') {
      this.hud?.showSpeechBackgroundJob({
        label: status.label,
        transcript: status.transcript,
        stage: status.stage,
      });
    }
  }

  private async openCompletedSpeechModelInAR(status: GeneratedModelJobStatus): Promise<void> {
    if (!status.modelUrl) {
      this.hud?.showSpeechError('Speech model finished without a model URL.');
      return;
    }

    this.hud?.showSpeechCompleted(status);
    await this.refreshGeneratedModels();
    await this.loadModelFromUrl(status.modelUrl, 'Speech object', {
      loadingMessage: 'Loading speech-generated object into AR...',
      successMessage: 'Speech-generated object loaded.',
      sourceMessage: 'Generated from speech',
    });
    this.hud?.showFullFlowReady('Speech-generated object is ready. Opening AR camera.', {
      id: status.id,
      label: status.label,
      url: status.modelUrl,
    });
    this.hud?.startARCamera();
  }

  private async leaveRoute(previousRoute: HudRoute, _nextRoute: HudRoute): Promise<void> {
    const transientRoutes: HudRoute[] = [
      'camera',
      'upload',
      'upload-model',
      'full-flow',
      'dynamic',
      'speech',
      'ar',
      'multi-object',
    ];
    if (!transientRoutes.includes(previousRoute)) {
      return;
    }
    await this.resetTransientExperience();
  }

  private async resetTransientExperience(): Promise<void> {
    stopCameraPreview(this.cameraStream);
    this.cameraStream = null;
    this.capturedImage = null;
    this.capturedImageGenerationPipeline = 'openai-to-3d';
    this.speechRecordingSession?.cancel();
    this.speechRecordingSession = null;
    this.speechAudio = null;
    this.speechJobWatchToken += 1;
    this.pendingUploadModelFile = null;
    this.layoutMode = false;
    this.layoutSceneManager?.clear();
    this.clearCapturedImagePreview();
    this.closeModelPreview();

    const session = this.sceneContext?.renderer.xr.getSession();
    if (session) {
      await session.end().catch(() => undefined);
    }
  }

  private async refreshGeneratedModels(): Promise<void> {
    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);

    try {
      const generatedModels = await listGeneratedModels({ apiUrl, authToken: this.authToken });
      this.generatedModelOptions = generatedModels;
      this.syncAvailableModels();
    } catch (error) {
      console.warn('Could not refresh generated models.', error);
    }
  }

  private async prepareMultiObject(): Promise<void> {
    await this.ensureARRuntime().catch((error) => {
      console.warn('Could not prepare AR runtime for multi-object placement.', error);
    });
  }

  private async startMultiObjectSession(): Promise<void> {
    await this.ensureARRuntime();
    this.layoutMode = true;
    this.requireLayoutSceneManager().clear();
    this.appState.modelLoaded = false;
    this.hud?.updateModelReady(false);
    this.appState.setMode('scanning');
    this.hud?.showMultiObjectEditor();
    this.hud?.showMultiObjectMessage('This session starts empty each time. Choose a model, tap Place, then add more objects.');
  }

  private promptForLayoutObject(): void {
    if (!this.layoutMode) {
      return;
    }

    this.hud?.showMultiObjectMessage('Choose a model from the rail, then tap Place.');
  }

  private deleteSelectedLayoutObject(): void {
    if (!this.layoutMode) {
      return;
    }

    const deleted = this.requireLayoutSceneManager().deleteSelected();
    this.hud?.showMultiObjectMessage(deleted ? 'Object removed from this session.' : 'Select an object before deleting.');
  }

  private async uploadModel(file: File): Promise<void> {
    try {
      if (!file.name.toLowerCase().endsWith('.glb')) {
        throw new Error('Choose a .glb model file.');
      }
      this.pendingUploadModelFile = file;
      this.hud?.updateUploadModelStatus(`${file.name} ready to store. Press Store Model to save it.`, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not upload model.';
      this.pendingUploadModelFile = null;
      this.hud?.updateUploadModelStatus(`Model upload failed: ${message}`, false);
    }
  }

  private async storeUploadedModel(): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to upload models.');
    if (!authToken) {
      return;
    }

    if (!this.pendingUploadModelFile) {
      this.hud?.updateUploadModelStatus('Choose a .glb model before storing.', false);
      return;
    }

    const file = this.pendingUploadModelFile;
    this.hud?.updateUploadModelStatus(`Storing ${file.name}...`, false);

    try {
      const storedModel = await storeUploadedModelRequest({
        apiUrl: getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL),
        file,
        authToken,
      });
      this.pendingUploadModelFile = null;
      this.generatedModelOptions = [
        storedModel,
        ...this.generatedModelOptions.filter((model) => model.id !== storedModel.id),
      ];
      this.syncAvailableModels();
      this.hud?.updateSelectedModel(storedModel.id);
      this.hud?.updateUploadModelStatus(`${storedModel.label} stored. It is available in AR View and Models.`, false);
      await this.loadSelectedModel(storedModel.id);
      void this.refreshGeneratedModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not store model.';
      this.hud?.updateUploadModelStatus(`Store failed: ${message}`, true);
    }
  }

  private deleteUploadedModel(modelId: string): void {
    const model = this.uploadedModelOptions.find((option) => option.id === modelId);
    if (model) {
      URL.revokeObjectURL(model.url);
    }
    this.uploadedModelOptions = this.uploadedModelOptions.filter((option) => option.id !== modelId);
    this.syncAvailableModels();
    this.hud?.updateModelManagerStatus('Uploaded model removed.');
  }

  private syncAvailableModels(): void {
    this.availableModels = [...MODEL_OPTIONS, ...this.generatedModelOptions, ...this.uploadedModelOptions];
    this.hud?.updateGeneratedModels(this.generatedModelOptions);
    this.hud?.updateUploadedModels(this.uploadedModelOptions);
  }

  private async previewModel(modelId: string): Promise<void> {
    const modelOption = this.availableModels.find((model) => model.id === modelId);
    const previewViewport = this.hud?.modelPreviewViewport;
    if (!modelOption || !previewViewport) {
      this.hud?.showModelPreviewError('Model preview is unavailable.');
      return;
    }

    this.hud?.showModelPreviewLoading(modelOption.label);
    const shouldMarkDownload = !(this.hud?.isModelDownloaded(modelId) ?? false);
    if (shouldMarkDownload) {
      this.hud?.markModelDownloadStarted(modelId);
    }
    if (!this.modelPreviewViewer) {
      const { ModelPreviewViewer: ModelPreviewViewerCtor } = await import('../scene/ModelPreviewViewer');
      this.modelPreviewViewer = new ModelPreviewViewerCtor(previewViewport);
    }

    try {
      this.modelPreviewViewer.setLightingIntensity(this.hud?.getModelPreviewLightingIntensity() ?? 1);
      this.modelPreviewViewer.setLightDirectionDegrees(this.hud?.getModelPreviewLightDirectionDegrees() ?? 45);
      const result = await this.modelPreviewViewer.preview(modelOption);
      this.hud?.markModelDownloaded(modelId);
      this.hud?.updateModelPreviewAnimationOptions(result.animations, result.animations.length > 0 ? 0 : -1);
      this.hud?.showModelPreviewReady();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown model preview error.';
      if (shouldMarkDownload) {
        this.hud?.markModelDownloadFailed(modelId);
      }
      this.hud?.showModelPreviewError(`Preview failed: ${message}`);
    }
  }

  private closeModelPreview(): void {
    this.modelPreviewViewer?.dispose();
    this.modelPreviewViewer = null;
    this.hud?.hideModelPreview();
  }

  private updateModelPreviewLighting(intensity: number): void {
    this.modelPreviewViewer?.setLightingIntensity(intensity);
  }

  private updateModelPreviewLightDirection(degrees: number): void {
    this.modelPreviewViewer?.setLightDirectionDegrees(degrees);
  }

  private selectModelPreviewAnimation(animationIndex: number): void {
    if (this.modelPreviewViewer?.selectAnimation(animationIndex)) {
      this.hud?.updateSelectedModelPreviewAnimation(animationIndex);
    }
  }

  private async uploadImage(file: File): Promise<void> {
    try {
      stopCameraPreview(this.cameraStream);
      this.cameraStream = null;
      this.hud?.updateCameraStatus('Preparing uploaded image...', false);
      this.capturedImage = await imageFileToCapturedImage(file);
      this.capturedImageGenerationPipeline = 'openai-to-3d';
      this.setUploadedImagePreview(this.capturedImage.blob);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not prepare uploaded image.';
      this.hud?.updateCameraStatus(`Upload failed: ${message}`, false);
    }
  }

  private async renameGeneratedModel(modelId: string, label: string): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to rename models.');
    if (!authToken) {
      return;
    }

    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);

    this.hud?.updateModelManagerStatus('Renaming model...');

    try {
      await renameGeneratedModelRequest({ apiUrl, modelId, label, authToken });
      await this.refreshGeneratedModels();
      this.hud?.updateModelManagerStatus('Model renamed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not rename model.';
      this.hud?.updateModelManagerStatus(`Rename failed: ${message}`);
    }
  }

  private async deleteGeneratedModel(modelId: string): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to delete models.');
    if (!authToken) {
      return;
    }

    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);

    this.hud?.updateModelManagerStatus('Deleting model...');

    try {
      await deleteGeneratedModelRequest({ apiUrl, modelId, authToken });
      await this.refreshGeneratedModels();
      this.hud?.updateModelManagerStatus('Model deleted.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete model.';
      this.hud?.updateModelManagerStatus(`Delete failed: ${message}`);
    }
  }

  private async toggleGeneratedModelVisibility(modelId: string, visibility: 'public' | 'private'): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to change model visibility.');
    if (!authToken) {
      return;
    }

    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);
    this.hud?.updateModelManagerStatus('Updating visibility...');

    try {
      await toggleGeneratedModelVisibilityRequest({ apiUrl, modelId, visibility, authToken });
      await this.refreshGeneratedModels();
      this.hud?.updateModelManagerStatus(visibility === 'public' ? 'Model is public.' : 'Model is private.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update visibility.';
      this.hud?.updateModelManagerStatus(`Visibility update failed: ${message}`);
    }
  }

  private async updateModelThumbnail(modelId: string, file: File): Promise<void> {
    const authToken = this.requireAuthToken('Sign in to update thumbnails.');
    if (!authToken) {
      return;
    }

    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);

    this.hud?.updateModelManagerStatus('Compressing thumbnail...');

    try {
      const thumbnail = await compressThumbnailImage(file);
      this.hud?.updateModelManagerStatus('Uploading compressed thumbnail...');
      const updatedModel = await updateGeneratedModelThumbnailRequest({ apiUrl, modelId, thumbnail, authToken });
      this.generatedModelOptions = this.generatedModelOptions.map((model) =>
        model.id === updatedModel.id ? updatedModel : model,
      );
      this.syncAvailableModels();
      await this.refreshGeneratedModels();
      this.hud?.updateModelManagerStatus(`Thumbnail updated (${Math.max(1, Math.ceil(thumbnail.bytes / 1024))} KB).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update thumbnail.';
      this.hud?.updateModelManagerStatus(`Thumbnail update failed: ${message}`);
    }
  }

  private setCapturedImagePreview(blob: Blob): void {
    this.clearCapturedImagePreview();
    this.capturedImagePreviewUrl = URL.createObjectURL(blob);
    this.hud?.showCapturedImagePreview(this.capturedImagePreviewUrl);
  }

  private setExtractedImagePreview(blob: Blob): void {
    this.clearCapturedImagePreview();
    this.capturedImagePreviewUrl = URL.createObjectURL(blob);
    this.hud?.showExtractedImageReady(this.capturedImagePreviewUrl);
  }

  private setUploadedImagePreview(blob: Blob): void {
    this.clearCapturedImagePreview();
    this.capturedImagePreviewUrl = URL.createObjectURL(blob);
    this.hud?.showUploadedImagePreview(this.capturedImagePreviewUrl);
  }

  private clearCapturedImagePreview(): void {
    if (this.capturedImagePreviewUrl) {
      URL.revokeObjectURL(this.capturedImagePreviewUrl);
      this.capturedImagePreviewUrl = null;
    }
  }

  private removeLoadedModels(root: Three.Group): void {
    root.children
      .filter((child) => child.name === 'loaded-glb-model')
      .forEach((model) => {
        this.disposeModel(model);
        root.remove(model);
      });
  }

  private startModelAnimations(model: Three.Object3D): void {
    const clips = Array.isArray(model.userData.animations)
      ? (model.userData.animations as Three.AnimationClip[])
      : [];
    if (clips.length === 0) {
      this.hud?.updateAnimationOptions([], -1);
      return;
    }

    const { THREE } = this.requireARRuntime();
    const mixer = new THREE.AnimationMixer(model);
    this.activeModelAnimation = {
      mixer,
      root: model,
      clips,
      activeIndex: 0,
    };
    this.hud?.updateAnimationOptions(this.createAnimationOptions(clips), 0);
    this.playModelAnimation(0, false);
  }

  private selectModelAnimation(animationIndex: number): void {
    const activeAnimation = this.activeModelAnimation;
    if (!activeAnimation || !Number.isInteger(animationIndex)) {
      return;
    }

    if (animationIndex < 0 || animationIndex >= activeAnimation.clips.length) {
      return;
    }

    if (animationIndex === activeAnimation.activeIndex) {
      this.hud?.updateSelectedAnimation(animationIndex);
      return;
    }

    this.playModelAnimation(animationIndex, true);
  }

  private playModelAnimation(animationIndex: number, stopExisting: boolean): void {
    const activeAnimation = this.activeModelAnimation;
    if (!activeAnimation) {
      return;
    }

    const clip = activeAnimation.clips[animationIndex];
    if (!clip) {
      return;
    }

    if (stopExisting) {
      activeAnimation.mixer.stopAllAction();
    }
    activeAnimation.mixer.clipAction(clip).reset().play();
    activeAnimation.activeIndex = animationIndex;
    this.hud?.updateSelectedAnimation(animationIndex);
  }

  private createAnimationOptions(clips: Three.AnimationClip[]): Array<{ index: number; label: string }> {
    return clips.map((clip, index) => ({
      index,
      label: clip.name.trim() || `Animation ${index + 1}`,
    }));
  }

  private stopModelAnimations(): void {
    if (this.activeModelAnimation) {
      this.activeModelAnimation.mixer.stopAllAction();
      this.activeModelAnimation.mixer.uncacheRoot(this.activeModelAnimation.root);
      this.activeModelAnimation = null;
    }
    this.hud?.updateAnimationOptions([], -1);
  }

  private disposeModel(root: Three.Object3D): void {
    const { THREE } = this.requireARRuntime();
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  private async configureXR(sceneContext: SceneContext): Promise<void> {
    const runtime = this.requireARRuntime();
    const support = await runtime.checkXRSupport();

    if (!support.supportsImmersiveAR) {
      this.appState.setMode('unsupported');
      this.hud?.update(this.appState.mode);
      return;
    }

    const overlay = this.hud?.overlay;
    if (!overlay) {
      throw new Error('HUD overlay has not been created.');
    }

    const button = runtime.createARSessionButton(sceneContext.renderer, overlay);
    this.hud?.attachARButton(button);

    sceneContext.renderer.xr.addEventListener('sessionstart', () => {
      this.appState.setMode('scanning');
      stopCameraPreview(this.cameraStream);
      this.cameraStream = null;
      this.hitTestManager?.reset();
      this.hud?.setCameraPanelVisible(false);
      this.hud?.update(this.appState.mode, this.appState.modelLoaded ? undefined : 'Select a Cloudflare model to download it.');
    });

    sceneContext.renderer.xr.addEventListener('sessionend', () => {
      this.appState.setMode('loading');
      this.sceneContext?.floorGrid && (this.sceneContext.floorGrid.visible = false);
      this.hud?.setCameraPanelVisible(false);
      this.hud?.update(this.appState.mode, 'AR session ended. Start AR again to continue.');
    });

    this.appState.setMode('loading');
    this.hud?.update(this.appState.mode, 'Select a Cloudflare model to download it.');
  }

  private render(_time: number, frame?: XRFrame): void {
    const sceneContext = this.requireScene();
    const transformController = this.requireTransformController();
    const clock = this.requireClock();
    const session = sceneContext.renderer.xr.getSession();
    const referenceSpace = sceneContext.renderer.xr.getReferenceSpace();

    if (frame && session && referenceSpace) {
      const hasFloorHit = this.hitTestManager?.update(frame, session, referenceSpace) ?? false;
      const floorY = transformController.floorY ?? this.hitTestManager?.latestPoint?.y ?? null;
      this.planeTrackingManager?.update(frame, referenceSpace, floorY);

      if (this.appState.mode === 'scanning' && hasFloorHit) {
        this.appState.setMode('readyToPlace');
      }
    }

    if (this.appState.mode !== this.lastHudMode) {
      this.hud?.update(this.appState.mode);
      this.lastHudMode = this.appState.mode;
    }

    const delta = clock.getDelta();
    this.activeModelAnimation?.mixer.update(delta);
    sceneContext.renderer.render(sceneContext.scene, sceneContext.camera);
  }

  private handleTap(_point: Point2): void {
    if (this.layoutMode && (this.appState.mode === 'placed' || this.appState.mode === 'editing')) {
      this.selectLayoutObjectAtPoint(_point);
      return;
    }

    if (this.appState.mode === 'readyToPlace' || this.appState.mode === 'scanning') {
      this.placeAtLatestHit();
    }
  }

  private handleDrag(point: Point2, startPoint: Point2): void {
    if (this.appState.mode !== 'placed' && this.appState.mode !== 'editing') {
      this.resetPlacementDrag();
      return;
    }

    const sceneContext = this.requireScene();
    const runtime = this.requireARRuntime();
    if (this.layoutMode) {
      if (!this.layoutGestureStartedOnObject) {
        this.layoutGestureStartedOnObject = this.selectLayoutObjectAtPoint(startPoint);
      }
      if (!this.layoutGestureStartedOnObject) {
        return;
      }
      const floorY = this.requireLayoutSceneManager().selectedGroup()?.position.y ?? this.hitTestManager?.latestPoint?.y ?? null;
      if (floorY === null) {
        return;
      }
      const floorPoint = runtime.screenPointToFloorPoint(point, sceneContext.renderer.domElement, sceneContext.camera, floorY);
      if (!floorPoint) {
        return;
      }
      this.requireLayoutSceneManager().moveSelectedToFloorPoint(floorPoint);
      this.appState.setMode('editing');
      return;
    }

    const transformController = this.requireTransformController();
    const dragMode = this.getPlacementDragMode(startPoint, sceneContext);
    if (dragMode === 'none') {
      return;
    }

    const floorY = transformController.floorY;
    if (floorY === null) {
      return;
    }

    const floorPoint = runtime.screenPointToFloorPoint(point, sceneContext.renderer.domElement, sceneContext.camera, floorY);
    if (!floorPoint) {
      return;
    }

    transformController.moveToFloorPoint(floorPoint);
    this.appState.setMode('editing');
  }

  private handlePinch(multiplier: number): void {
    if (this.appState.mode !== 'placed' && this.appState.mode !== 'editing') {
      return;
    }

    if (this.layoutMode) {
      if (!this.layoutGestureStartedOnObject) {
        return;
      }
      this.requireLayoutSceneManager().scaleSelectedBy(multiplier);
      this.appState.setMode('editing');
      return;
    }

    this.requireTransformController().scaleBy(multiplier);
    this.appState.setMode('editing');
  }

  private placeAtLatestHit(): void {
    if (!this.appState.modelLoaded) {
      return;
    }

    if (this.appState.mode !== 'readyToPlace' && this.appState.mode !== 'scanning') {
      return;
    }

    const placementMatrix = this.hitTestManager?.latestPoseMatrix ?? this.createEstimatedPlacementMatrix();

    if (this.layoutMode) {
      const placedObject = this.requireLayoutSceneManager().placePendingAt(placementMatrix);
      if (!placedObject) {
        return;
      }
      this.appState.floorLocked = true;
      this.appState.setMode('placed');
      this.planeTrackingManager?.hide();
      this.hud?.update(this.appState.mode, `${placedObject.modelLabel} placed. Add another object or delete the selected one.`);
      return;
    }

    this.requireTransformController().placeAt(placementMatrix);
    this.appState.floorLocked = true;
    this.appState.setMode('placed');
    this.planeTrackingManager?.hide();
    this.hud?.update(this.appState.mode);
  }

  private getPlacementDragMode(startPoint: Point2, sceneContext: SceneContext): PlacementGestureZone {
    if (!this.placementDragStart || this.placementDragStart.x !== startPoint.x || this.placementDragStart.y !== startPoint.y) {
      const bounds = this.getProjectedPlacementMarkerBounds(sceneContext);
      this.placementDragStart = startPoint;
      this.placementDragMode = bounds ? this.requireARRuntime().classifyPlacementGesture(startPoint, bounds) : 'none';
    }

    return this.placementDragMode ?? 'none';
  }

  private getProjectedPlacementMarkerBounds(sceneContext: SceneContext): { center: Point2; radiusPx: number } | null {
    if (!sceneContext.modelRoot.visible || !sceneContext.placementMarker.visible) {
      return null;
    }

    const canvas = sceneContext.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const { THREE } = this.requireARRuntime();
    const centerWorld = new THREE.Vector3();
    sceneContext.placementMarker.getWorldPosition(centerWorld);
    const radiusWorld = sceneContext.placementMarker.localToWorld(new THREE.Vector3(0.24, 0, 0));

    const center = this.worldToScreenPoint(centerWorld, sceneContext.camera, rect);
    const radiusPoint = this.worldToScreenPoint(radiusWorld, sceneContext.camera, rect);
    return {
      center,
      radiusPx: Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y),
    };
  }

  private worldToScreenPoint(worldPoint: Three.Vector3, camera: Three.Camera, rect: DOMRect): Point2 {
    const projected = worldPoint.clone().project(camera);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
  }

  private resetPlacementDrag(): void {
    this.placementDragMode = null;
    this.placementDragStart = null;
    this.layoutGestureStartedOnObject = false;
  }

  private selectLayoutObjectAtPoint(point: Point2): boolean {
    if (!this.layoutMode || !this.sceneContext) {
      return false;
    }

    const selected = this.requireLayoutSceneManager().selectObjectAtScreenPoint(
      point,
      this.sceneContext.renderer.domElement,
      this.sceneContext.camera,
    );
    if (!selected) {
      return false;
    }

    this.appState.setMode('editing');
    this.hud?.update(this.appState.mode, `${selected.modelLabel} selected. Move, scale, use Rotate, or delete it.`);
    return true;
  }

  private createEstimatedPlacementMatrix(): Three.Matrix4 {
    const sceneContext = this.requireScene();
    const { THREE } = this.requireARRuntime();
    const camera = sceneContext.camera;
    const cameraPosition = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    camera.getWorldDirection(cameraDirection);

    const floorY = this.planeTrackingManager?.latestFloor?.center.y ?? cameraPosition.y - 1.1;
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
    const ray = new THREE.Ray(cameraPosition, cameraDirection.normalize());
    const point = new THREE.Vector3();
    const hasIntersection = ray.intersectPlane(floorPlane, point);

    if (!hasIntersection || point.distanceTo(cameraPosition) > 4) {
      point.copy(cameraPosition).add(cameraDirection.multiplyScalar(1.2));
      point.y = floorY;
    }

    const matrix = new THREE.Matrix4();
    matrix.compose(point, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    return matrix;
  }

  private setEditing(): void {
    if (this.appState.mode === 'placed' || this.appState.mode === 'editing') {
      this.appState.setMode('editing');
      this.hud?.update(this.appState.mode);
    }
  }

  private resetObject(): void {
    if (this.appState.mode !== 'placed' && this.appState.mode !== 'editing') {
      return;
    }

    if (this.layoutMode) {
      const latestMatrix = this.hitTestManager?.latestPoseMatrix;
      if (latestMatrix) {
        this.requireLayoutSceneManager().placeSelectedAt(latestMatrix);
      } else {
        this.requireLayoutSceneManager().resetSelectedTransform();
      }
      this.appState.setMode('placed');
      this.hud?.update(this.appState.mode);
      return;
    }

    const latestMatrix = this.hitTestManager?.latestPoseMatrix;
    const transformController = this.requireTransformController();
    if (latestMatrix) {
      transformController.placeAt(latestMatrix);
    } else {
      transformController.resetTransform();
    }
    this.appState.setMode('placed');
    this.hud?.update(this.appState.mode);
  }

  private resetScale(): void {
    if (this.layoutMode) {
      this.requireLayoutSceneManager().resetSelectedScale();
      this.appState.setMode('editing');
      this.hud?.update(this.appState.mode);
      return;
    }

    this.requireTransformController().resetScale();
    this.appState.setMode('editing');
    this.hud?.update(this.appState.mode);
  }

  private rotateBy(deltaRadians: number): void {
    if (this.layoutMode) {
      this.requireLayoutSceneManager().rotateSelectedBy(deltaRadians);
      this.appState.setMode('editing');
      this.hud?.update(this.appState.mode);
      return;
    }

    this.requireTransformController().rotateBy(deltaRadians);
    this.appState.setMode('editing');
    this.hud?.update(this.appState.mode);
  }

  private requireScene(): SceneContext {
    if (!this.sceneContext) {
      throw new Error('Scene has not been created.');
    }

    return this.sceneContext;
  }

  private requireHud(): ARHud {
    if (!this.hud) {
      throw new Error('HUD has not been created.');
    }

    return this.hud;
  }

  private requireARRuntime(): ARRuntime {
    if (!this.arRuntime) {
      throw new Error('AR runtime has not been loaded.');
    }

    return this.arRuntime;
  }

  private requireTransformController(): ObjectTransformController {
    if (!this.transformController) {
      throw new Error('Transform controller has not been created.');
    }

    return this.transformController;
  }

  private requireLayoutSceneManager(): InstanceType<ARRuntime['LayoutSceneManager']> {
    if (!this.layoutSceneManager) {
      throw new Error('Layout scene manager has not been created.');
    }

    return this.layoutSceneManager;
  }

  private requireClock(): Three.Clock {
    if (!this.clock) {
      throw new Error('Render clock has not been created.');
    }

    return this.clock;
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes.buffer], { type: mimeType });
}
