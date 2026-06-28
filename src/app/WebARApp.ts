import * as THREE from 'three';
import { GestureController } from '../interaction/GestureController';
import { ObjectTransformController } from '../interaction/ObjectTransformController';
import { createScene, type SceneContext } from '../scene/createScene';
import { loadGLBModel } from '../scene/loadModel';
import { AppState } from '../state/AppState';
import { ARHud } from '../ui/ARHud';
import { resolvePublicAssetUrl } from '../utils/assets';
import { screenPointToFloorPoint, type Point2 } from '../utils/math';
import { HitTestManager } from '../xr/HitTestManager';
import { PlaneTrackingManager } from '../xr/PlaneTrackingManager';
import { checkXRSupport } from '../xr/XRSupport';
import { createARSessionButton } from '../xr/XRSessionManager';

const MODEL_URL = resolvePublicAssetUrl(
  'models/trellis-2-4b-fast-output.glb',
  import.meta.env.BASE_URL,
);

export class WebARApp {
  private sceneContext: SceneContext | null = null;
  private hud: ARHud | null = null;
  private gestureController: GestureController | null = null;
  private hitTestManager: HitTestManager | null = null;
  private planeTrackingManager: PlaneTrackingManager | null = null;
  private readonly appState = new AppState();
  private readonly transformController = new ObjectTransformController();
  private readonly clock = new THREE.Clock();
  private lastHudMode = this.appState.mode;

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    const sceneContext = createScene(this.root);
    this.sceneContext = sceneContext;
    this.hitTestManager = new HitTestManager(sceneContext.reticle);
    this.planeTrackingManager = new PlaneTrackingManager(sceneContext.floorGrid);

    this.hud = new ARHud(this.root, {
      onPlace: () => this.placeAtLatestHit(),
      onEdit: () => this.setEditing(),
      onReset: () => this.resetObject(),
      onResetScale: () => this.resetScale(),
      onRotateLeft: () => this.rotateBy(-THREE.MathUtils.degToRad(15)),
      onRotateRight: () => this.rotateBy(THREE.MathUtils.degToRad(15)),
    });

    this.gestureController = new GestureController(this.hud.gestureSurface, {
      onTap: (point) => this.handleTap(point),
      onDrag: (point) => this.handleDrag(point),
      onPinch: (multiplier) => this.handlePinch(multiplier),
      onTwist: (deltaRadians) => this.handleTwist(deltaRadians),
    });
    this.gestureController.connect();

    await this.loadModel(sceneContext);
    await this.configureXR(sceneContext);

    const controller = sceneContext.renderer.xr.getController(0);
    controller.addEventListener('select', () => this.placeAtLatestHit());
    sceneContext.scene.add(controller);

    sceneContext.renderer.setAnimationLoop((time, frame) => this.render(time, frame));
  }

  private async loadModel(sceneContext: SceneContext): Promise<void> {
    try {
      const model = await loadGLBModel(MODEL_URL);
      sceneContext.modelRoot.add(model);
      this.transformController.setTarget(sceneContext.modelRoot);
      this.appState.modelLoaded = true;
      this.hud?.update(this.appState.mode, 'Model loaded. Start AR on the phone.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown model loading error.';
      this.appState.setError(`Could not load GLB: ${message}`);
      this.hud?.update(this.appState.mode, this.appState.lastError ?? undefined);
    }
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
      this.hitTestManager?.reset();
      this.hud?.update(this.appState.mode);
    });

    sceneContext.renderer.xr.addEventListener('sessionend', () => {
      this.appState.setMode(this.appState.modelLoaded ? 'loading' : 'unsupported');
      this.sceneContext?.floorGrid && (this.sceneContext.floorGrid.visible = false);
      this.hud?.update(this.appState.mode, 'AR session ended. Start AR again to continue.');
    });

    this.appState.setMode('loading');
    this.hud?.update(this.appState.mode, 'Model loaded. Tap Start AR on the phone.');
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
