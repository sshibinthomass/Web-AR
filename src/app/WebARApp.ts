import * as THREE from 'three';
import { GestureController } from '../interaction/GestureController';
import { ObjectTransformController } from '../interaction/ObjectTransformController';
import { MODEL_OPTIONS } from './models';
import { captureVideoFrame, startCameraPreview, stopCameraPreview, type CapturedImage } from '../capture/cameraCapture';
import { createScene, type SceneContext } from '../scene/createScene';
import { loadGLBModel } from '../scene/loadModel';
import { listGeneratedModels, startGeneratedModelJob } from '../services/generatedModelClient';
import { AppState } from '../state/AppState';
import { ARHud } from '../ui/ARHud';
import { screenPointToFloorPoint, type Point2 } from '../utils/math';
import { HitTestManager } from '../xr/HitTestManager';
import { PlaneTrackingManager } from '../xr/PlaneTrackingManager';
import { checkXRSupport } from '../xr/XRSupport';
import { createARSessionButton } from '../xr/XRSessionManager';

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
  private lastHudMode = this.appState.mode;
  private availableModels = [...MODEL_OPTIONS];

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
      onGenerateModel: () => void this.generateModel(),
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
      onDrag: (point) => this.handleDrag(point),
      onPinch: (multiplier) => this.handlePinch(multiplier),
      onTwist: (deltaRadians) => this.handleTwist(deltaRadians),
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

    await this.loadModelFromUrl(modelOption.url, modelOption.label, {
      loadingMessage: `Downloading ${modelOption.label} from Cloudflare...`,
      successMessage: `${modelOption.label} loaded from Cloudflare.`,
      sourceMessage: 'Cloudflare hosted model',
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
      this.hud?.updateCameraStatus('Image captured. Ready to generate.', true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not capture image.';
      this.hud?.updateCameraStatus(`Capture failed: ${message}`, false);
    }
  }

  private async generateModel(): Promise<void> {
    if (!this.capturedImage) {
      this.hud?.updateCameraStatus('Capture an image before generating a 3D model.', false);
      return;
    }

    this.hud?.updateCameraStatus('Starting background generation...', false);

    try {
      const job = await startGeneratedModelJob({
        apiUrl: import.meta.env.VITE_GENERATE_MODEL_API_URL ?? '',
        imageBase64: this.capturedImage.imageBase64,
        imageMimeType: this.capturedImage.imageMimeType,
      });
      this.capturedImage = null;
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

  private async refreshGeneratedModels(): Promise<void> {
    const apiUrl = import.meta.env.VITE_GENERATE_MODEL_API_URL ?? '';
    if (!apiUrl) {
      return;
    }

    try {
      const generatedModels = await listGeneratedModels({ apiUrl });
      this.availableModels = [...MODEL_OPTIONS, ...generatedModels];
      this.hud?.updateGeneratedModels(generatedModels);
    } catch (error) {
      console.warn('Could not refresh generated models.', error);
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
      this.hud?.setCameraPanelVisible(true);
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

  private handleDrag(point: Point2): void {
    if (this.appState.mode !== 'placed' && this.appState.mode !== 'editing') {
      return;
    }

    const sceneContext = this.requireScene();
    const floorY = this.transformController.floorY;
    if (floorY === null) {
      return;
    }

    const floorPoint = screenPointToFloorPoint(point, sceneContext.renderer.domElement, sceneContext.camera, floorY);
    if (!floorPoint) {
      return;
    }

    this.transformController.moveToFloorPoint(floorPoint);
    this.appState.setMode('editing');
  }

  private handlePinch(multiplier: number): void {
    if (this.appState.mode !== 'placed' && this.appState.mode !== 'editing') {
      return;
    }

    this.transformController.scaleBy(multiplier);
    this.appState.setMode('editing');
  }

  private handleTwist(deltaRadians: number): void {
    if (this.appState.mode !== 'placed' && this.appState.mode !== 'editing') {
      return;
    }

    this.transformController.rotateBy(deltaRadians);
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
