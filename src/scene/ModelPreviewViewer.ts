import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ModelOption } from '../app/models';
import { loadGLBModel } from './loadModel';

type PreviewRenderer = {
  domElement: HTMLCanvasElement;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
};

type PreviewControls = {
  target: THREE.Vector3;
  enableDamping: boolean;
  enablePan: boolean;
  minDistance: number;
  maxDistance: number;
  update(): void;
  dispose(): void;
};

type FrameCallback = (time: number) => void;

export type ModelPreviewViewerOptions = {
  loadModel?: (url: string) => Promise<THREE.Group>;
  createRenderer?: () => PreviewRenderer;
  createControls?: (camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement) => PreviewControls;
  requestFrame?: (callback: FrameCallback) => number;
  cancelFrame?: (frameId: number) => void;
  observeResize?: (element: HTMLElement, callback: () => void) => () => void;
};

export class ModelPreviewViewer {
  private readonly loadModel: (url: string) => Promise<THREE.Group>;
  private readonly createRenderer: () => PreviewRenderer;
  private readonly createControls: (camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement) => PreviewControls;
  private readonly requestFrame: (callback: FrameCallback) => number;
  private readonly cancelFrame: (frameId: number) => void;
  private readonly observeResize: (element: HTMLElement, callback: () => void) => () => void;

  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: PreviewRenderer | null = null;
  private controls: PreviewControls | null = null;
  private model: THREE.Object3D | null = null;
  private frameId: number | null = null;
  private disconnectResize: (() => void) | null = null;
  private requestVersion = 0;

  constructor(
    private readonly container: HTMLElement,
    options: ModelPreviewViewerOptions = {},
  ) {
    this.loadModel = options.loadModel ?? loadGLBModel;
    this.createRenderer = options.createRenderer ?? createDefaultRenderer;
    this.createControls = options.createControls ?? createDefaultControls;
    this.requestFrame = options.requestFrame ?? ((callback) => window.requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? ((frameId) => window.cancelAnimationFrame(frameId));
    this.observeResize = options.observeResize ?? observeElementResize;
  }

  async preview(modelOption: Pick<ModelOption, 'id' | 'label' | 'url'>): Promise<void> {
    this.dispose();
    const version = this.requestVersion + 1;
    this.requestVersion = version;

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    const renderer = this.createRenderer();
    const controls = this.createControls(camera, renderer.domElement);

    controls.enableDamping = true;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.45));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(2.5, 4, 3);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x8bd8ff, 1.15);
    rimLight.position.set(-3, 2, -2);
    scene.add(rimLight);

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.container.replaceChildren(renderer.domElement);
    this.resize();
    this.disconnectResize = this.observeResize(this.container, () => this.resize());

    try {
      const loadedModel = await this.loadModel(modelOption.url);
      if (this.requestVersion !== version) {
        disposeObject(loadedModel);
        return;
      }

      this.model = loadedModel;
      scene.add(loadedModel);
      this.frameCameraToModel(loadedModel);
      this.startRenderLoop();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose(): void {
    this.requestVersion += 1;

    if (this.frameId !== null) {
      this.cancelFrame(this.frameId);
      this.frameId = null;
    }

    this.disconnectResize?.();
    this.disconnectResize = null;

    this.controls?.dispose();
    this.controls = null;

    if (this.model) {
      disposeObject(this.model);
      this.model = null;
    }

    this.scene?.clear();
    this.scene = null;
    this.camera = null;

    this.renderer?.dispose();
    this.renderer = null;

    this.container.replaceChildren();
  }

  private resize(): void {
    if (!this.renderer || !this.camera) {
      return;
    }

    const width = Math.max(1, this.container.clientWidth || 360);
    const height = Math.max(1, this.container.clientHeight || 280);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderFrame();
  }

  private frameCameraToModel(model: THREE.Object3D): void {
    if (!this.camera || !this.controls) {
      return;
    }

    const bounds = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);

    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    const distance = maxDimension * 2.25;
    this.camera.near = Math.max(0.01, distance / 100);
    this.camera.far = distance * 100;
    this.camera.position.set(center.x + distance * 0.65, center.y + distance * 0.35, center.z + distance);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.minDistance = Math.max(0.2, distance * 0.25);
    this.controls.maxDistance = Math.max(3, distance * 4);
    this.controls.update();
    this.renderFrame();
  }

  private startRenderLoop(): void {
    const animate = () => {
      this.controls?.update();
      this.renderFrame();
      this.frameId = this.requestFrame(animate);
    };

    animate();
  }

  private renderFrame(): void {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

function createDefaultRenderer(): PreviewRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

function createDefaultControls(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement): PreviewControls {
  return new OrbitControls(camera, domElement);
}

function observeElementResize(element: HTMLElement, callback: () => void): () => void {
  const ResizeObserverCtor = globalThis.ResizeObserver;
  if (typeof ResizeObserverCtor !== 'undefined') {
    const observer = new ResizeObserverCtor(callback);
    observer.observe(element);
    return () => observer.disconnect();
  }

  globalThis.addEventListener('resize', callback);
  return () => globalThis.removeEventListener('resize', callback);
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}
