import * as THREE from 'three';
import { GestureController } from '../interaction/GestureController';
import { ObjectTransformController } from '../interaction/ObjectTransformController';
import {
  classifyPlacementGesture,
  rotationDeltaFromVerticalDrag,
  type PlacementGestureZone,
} from '../interaction/PlacementGestureZone';
import { MODEL_OPTIONS, type ModelOption } from './models';
import {
  captureVideoFrame,
  imageFileToCapturedImage,
  startCameraPreview,
  stopCameraPreview,
  type CapturedImage,
} from '../capture/cameraCapture';
import { createScene, type SceneContext } from '../scene/createScene';
import { loadGLBModel } from '../scene/loadModel';
import {
  extractImageFor3D,
  deleteGeneratedModel as deleteGeneratedModelRequest,
  generateModelFromImage,
  listGeneratedModels,
  renameGeneratedModel as renameGeneratedModelRequest,
  startGeneratedModelJob,
  type GenerationPipeline,
} from '../services/generatedModelClient';
import { AppState } from '../state/AppState';
import { ARHud } from '../ui/ARHud';
import { screenPointToFloorPoint, type Point2 } from '../utils/math';
import { HitTestManager } from '../xr/HitTestManager';
import { PlaneTrackingManager } from '../xr/PlaneTrackingManager';
import { checkXRSupport } from '../xr/XRSupport';
import { createARSessionButton } from '../xr/XRSessionManager';
import { getGenerateModelApiUrl } from './config';
import { createUploadedModelOption } from './uploadedModels';

export class WebARApp {
  private sceneContext: SceneContext | null = null;
  private hud: ARHud | null = null;
  private gestureController: GestureController | null = null;
  private hitTestManager: HitTestManager | null = null;
  private planeTrackingManager: PlaneTrackingManager | null = null;
  private readonly appState = new AppState();
  private readonly transformController = new ObjectTransformController();
  private readonly clock = new THREE.Clock();
  private cameraStream: MediaStream | null = null;
  private capturedImage: CapturedImage | null = null;
  private capturedImageGenerationPipeline: GenerationPipeline = 'openai-to-3d';
  private capturedImagePreviewUrl: string | null = null;
  private placementDragMode: PlacementGestureZone | null = null;
  private placementDragStart: Point2 | null = null;
  private lastPlacementDragPoint: Point2 | null = null;
  private lastHudMode = this.appState.mode;
  private availableModels = [...MODEL_OPTIONS];
  private generatedModelOptions: ModelOption[] = [];
  private uploadedModelOptions: ModelOption[] = [];

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    const sceneContext = createScene(this.root);
    this.sceneContext = sceneContext;
    this.hitTestManager = new HitTestManager(sceneContext.reticle);
    this.planeTrackingManager = new PlaneTrackingManager(sceneContext.floorGrid);

    this.hud = new ARHud(this.root, MODEL_OPTIONS, {
      onPlace: () => this.placeAtLatestHit(),
      onEdit: () => this.setEditing(),
      onReset: () => this.resetObject(),
      onResetScale: () => this.resetScale(),
      onRotateLeft: () => this.rotateBy(-THREE.MathUtils.degToRad(15)),
      onRotateRight: () => this.rotateBy(THREE.MathUtils.degToRad(15)),
      onModelSelect: (modelId) => void this.loadSelectedModel(modelId),
      onStartCamera: () => void this.startCamera(),
      onCaptureImage: () => void this.captureImage(),
      onUploadImage: (file) => void this.uploadImage(file),
      onUploadModel: (file) => void this.uploadModel(file),
      onSubmitTarget: (targetObject) => void this.submitCapturedImageToGpt(targetObject),
      onGenerateModel: (targetObject) => void this.generateModel(targetObject),
      onFullFlowCapture: (targetObject) => void this.runFullFlow(targetObject),
      onRenameGeneratedModel: (modelId, label) => void this.renameGeneratedModel(modelId, label),
      onDeleteGeneratedModel: (modelId) => void this.deleteGeneratedModel(modelId),
      onDeleteUploadedModel: (modelId) => this.deleteUploadedModel(modelId),
      onReturnHome: () => void this.returnHome(),
    });
    this.hud.updateModelSource('Cloudflare only');
    void this.refreshGeneratedModels();
    window.setInterval(() => {
      void this.refreshGeneratedModels();
    }, 60_000);
    window.addEventListener('focus', () => {
      void this.refreshGeneratedModels();
    });

    this.gestureController = new GestureController(this.hud.gestureSurface, {
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

  private async loadSelectedModel(modelId: string): Promise<void> {
    const modelOption = this.availableModels.find((model) => model.id === modelId);
    if (!modelOption) {
      return;
    }

    const isUploadedModel = modelOption.id.startsWith('uploaded-');
    const sourceLabel = isUploadedModel ? 'uploaded file' : 'Cloudflare';
    await this.loadModelFromUrl(modelOption.url, modelOption.label, {
      loadingMessage: `Loading ${modelOption.label} from ${sourceLabel}...`,
      successMessage: `${modelOption.label} loaded from ${sourceLabel}.`,
      sourceMessage: isUploadedModel ? 'Uploaded GLB' : 'Cloudflare hosted model',
      selectedModelId: modelId,
    });
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
    const sceneContext = this.requireScene();
    const wasPlaced = this.appState.mode === 'placed' || this.appState.mode === 'editing';
    this.appState.modelLoaded = false;
    this.hud?.updateModelReady(false);
    if (options.selectedModelId) {
      this.hud?.updateSelectedModel(options.selectedModelId);
    }
    this.hud?.updateModelSource(options.sourceMessage);
    this.hud?.update(this.appState.mode, options.loadingMessage);

    try {
      const model = await loadGLBModel(modelUrl);
      this.removeLoadedModels(sceneContext.modelRoot);
      sceneContext.modelRoot.add(model);
      this.transformController.setTarget(sceneContext.modelRoot);
      this.appState.modelLoaded = true;
      this.hud?.updateModelReady(true);
      if (!wasPlaced) {
        sceneContext.modelRoot.visible = false;
      }
      this.hud?.update(this.appState.mode, options.successMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown model loading error.';
      this.appState.modelLoaded = false;
      this.hud?.updateModelReady(false);
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
      this.hud?.showLiveCameraPreview();
      this.cameraStream = await startCameraPreview(preview);
      this.hud?.updateCameraStatus('Camera ready. Capture an image to generate a 3D model.', false);
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
      });

      await this.loadModelFromUrl(generatedModel.modelUrl, 'Generated object', {
        loadingMessage: 'Loading generated object into AR...',
        successMessage: 'Generated object loaded.',
        sourceMessage: 'Generated by Modal',
      });

      this.hud?.showFullFlowReady('You can place the object now. Start AR, scan the floor, then tap Place.');
      void this.refreshGeneratedModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Full Flow failed.';
      this.hud?.showFullFlowError(`Full Flow failed: ${message}`);
    }
  }

  private async returnHome(): Promise<void> {
    stopCameraPreview(this.cameraStream);
    this.cameraStream = null;
    this.capturedImage = null;
    this.capturedImageGenerationPipeline = 'openai-to-3d';
    this.clearCapturedImagePreview();

    const session = this.sceneContext?.renderer.xr.getSession();
    if (session) {
      await session.end().catch(() => undefined);
    }
  }

  private async refreshGeneratedModels(): Promise<void> {
    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);

    try {
      const generatedModels = await listGeneratedModels({ apiUrl });
      this.generatedModelOptions = generatedModels;
      this.syncAvailableModels();
    } catch (error) {
      console.warn('Could not refresh generated models.', error);
    }
  }

  private async uploadModel(file: File): Promise<void> {
    try {
      if (!file.name.toLowerCase().endsWith('.glb')) {
        throw new Error('Choose a .glb model file.');
      }
      const objectUrl = URL.createObjectURL(file);
      const uploadedModel = createUploadedModelOption(file, objectUrl);
      this.uploadedModelOptions = [...this.uploadedModelOptions, uploadedModel];
      this.syncAvailableModels();
      this.hud?.updateSelectedModel(uploadedModel.id);
      this.hud?.updateUploadedModelStatus(`${uploadedModel.label} added to AR View and Models.`);
      await this.loadSelectedModel(uploadedModel.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not upload model.';
      this.hud?.updateUploadedModelStatus(`Model upload failed: ${message}`);
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
    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);

    this.hud?.updateModelManagerStatus('Renaming model...');

    try {
      await renameGeneratedModelRequest({ apiUrl, modelId, label });
      await this.refreshGeneratedModels();
      this.hud?.updateModelManagerStatus('Model renamed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not rename model.';
      this.hud?.updateModelManagerStatus(`Rename failed: ${message}`);
    }
  }

  private async deleteGeneratedModel(modelId: string): Promise<void> {
    const apiUrl = getGenerateModelApiUrl(import.meta.env.VITE_GENERATE_MODEL_API_URL);

    this.hud?.updateModelManagerStatus('Deleting model...');

    try {
      await deleteGeneratedModelRequest({ apiUrl, modelId });
      await this.refreshGeneratedModels();
      this.hud?.updateModelManagerStatus('Model deleted.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete model.';
      this.hud?.updateModelManagerStatus(`Delete failed: ${message}`);
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

  private removeLoadedModels(root: THREE.Group): void {
    root.children
      .filter((child) => child.name === 'loaded-glb-model')
      .forEach((model) => {
        this.disposeModel(model);
        root.remove(model);
      });
  }

  private disposeModel(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  private async configureXR(sceneContext: SceneContext): Promise<void> {
    const support = await checkXRSupport();

    if (!support.supportsImmersiveAR) {
      this.appState.setMode('unsupported');
      this.hud?.update(this.appState.mode);
      return;
    }

    const overlay = this.hud?.overlay;
    if (!overlay) {
      throw new Error('HUD overlay has not been created.');
    }

    const button = createARSessionButton(sceneContext.renderer, overlay);
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
    const session = sceneContext.renderer.xr.getSession();
    const referenceSpace = sceneContext.renderer.xr.getReferenceSpace();

    if (frame && session && referenceSpace) {
      const hasFloorHit = this.hitTestManager?.update(frame, session, referenceSpace) ?? false;
      const floorY = this.transformController.floorY ?? this.hitTestManager?.latestPoint?.y ?? null;
      this.planeTrackingManager?.update(frame, referenceSpace, floorY);

      if (this.appState.mode === 'scanning' && hasFloorHit) {
        this.appState.setMode('readyToPlace');
      }
    }

    if (this.appState.mode !== this.lastHudMode) {
      this.hud?.update(this.appState.mode);
      this.lastHudMode = this.appState.mode;
    }

    this.clock.getDelta();
    sceneContext.renderer.render(sceneContext.scene, sceneContext.camera);
  }

  private handleTap(_point: Point2): void {
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
    const dragMode = this.getPlacementDragMode(startPoint, sceneContext);
    if (dragMode === 'none') {
      return;
    }

    if (dragMode === 'rotate') {
      const previousPoint = this.lastPlacementDragPoint ?? startPoint;
      this.transformController.rotateBy(rotationDeltaFromVerticalDrag(previousPoint, point));
      this.lastPlacementDragPoint = point;
      this.appState.setMode('editing');
      return;
    }

    const floorY = this.transformController.floorY;
    if (floorY === null) {
      return;
    }

    const floorPoint = screenPointToFloorPoint(point, sceneContext.renderer.domElement, sceneContext.camera, floorY);
    if (!floorPoint) {
      return;
    }

    this.transformController.moveToFloorPoint(floorPoint);
    this.lastPlacementDragPoint = point;
    this.appState.setMode('editing');
  }

  private handlePinch(multiplier: number): void {
    if (this.appState.mode !== 'placed' && this.appState.mode !== 'editing') {
      return;
    }

    this.transformController.scaleBy(multiplier);
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

    this.transformController.placeAt(placementMatrix);
    this.appState.floorLocked = true;
    this.appState.setMode('placed');
    this.planeTrackingManager?.hide();
    this.hud?.update(this.appState.mode);
  }

  private getPlacementDragMode(startPoint: Point2, sceneContext: SceneContext): PlacementGestureZone {
    if (!this.placementDragStart || this.placementDragStart.x !== startPoint.x || this.placementDragStart.y !== startPoint.y) {
      const bounds = this.getProjectedPlacementMarkerBounds(sceneContext);
      this.placementDragStart = startPoint;
      this.lastPlacementDragPoint = startPoint;
      this.placementDragMode = bounds ? classifyPlacementGesture(startPoint, bounds) : 'none';
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

  private worldToScreenPoint(worldPoint: THREE.Vector3, camera: THREE.Camera, rect: DOMRect): Point2 {
    const projected = worldPoint.clone().project(camera);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
  }

  private resetPlacementDrag(): void {
    this.placementDragMode = null;
    this.placementDragStart = null;
    this.lastPlacementDragPoint = null;
  }

  private createEstimatedPlacementMatrix(): THREE.Matrix4 {
    const sceneContext = this.requireScene();
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

    const latestMatrix = this.hitTestManager?.latestPoseMatrix;
    if (latestMatrix) {
      this.transformController.placeAt(latestMatrix);
    } else {
      this.transformController.resetTransform();
    }
    this.appState.setMode('placed');
    this.hud?.update(this.appState.mode);
  }

  private resetScale(): void {
    this.transformController.resetScale();
    this.appState.setMode('editing');
    this.hud?.update(this.appState.mode);
  }

  private rotateBy(deltaRadians: number): void {
    this.transformController.rotateBy(deltaRadians);
    this.appState.setMode('editing');
    this.hud?.update(this.appState.mode);
  }

  private requireScene(): SceneContext {
    if (!this.sceneContext) {
      throw new Error('Scene has not been created.');
    }

    return this.sceneContext;
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
