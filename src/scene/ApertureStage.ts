import * as THREE from 'three';
import { createBackdropRenderer, prefersReducedMotion } from './backdropRenderer';

const SIGNAL_MINT = 0x5eead4;
const ANCHOR_GOLD = 0xf4b942;
const SPATIAL_INK = 0x081d21;
const BORDER_DARK = 0x1d454a;

/**
 * The Aperture Engine: the dimensional reading of the Arvenilo aperture.
 *
 * A matte ink outer structure, an open centre, a mint reality plane, one gold
 * signal point, restrained calibration lines, and a single familiar object
 * moving through the aperture and revealing its digital layer.
 */
export class ApertureStage {
  private readonly renderer: THREE.WebGLRenderer | null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
  private readonly assembly = new THREE.Group();
  private readonly object = new THREE.Group();
  private readonly signalPoint: THREE.Mesh;
  private readonly reducedMotion: boolean;
  private readonly resizeObserver: ResizeObserver | null = null;

  private frameId: number | null = null;
  private visible = false;

  private readonly handleVisibilityChange = () => this.syncFrameLoop();

  constructor(private readonly host: HTMLElement) {
    this.reducedMotion = prefersReducedMotion();
    this.renderer = createBackdropRenderer();
    this.signalPoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 20, 20),
      new THREE.MeshBasicMaterial({ color: ANCHOR_GOLD }),
    );

    if (!this.renderer) {
      host.dataset.mode = 'static';
      return;
    }

    host.dataset.mode = 'live';
    this.buildScene();
    host.appendChild(this.renderer.domElement);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.resize();
  }

  /** The scene stops entirely when the hero is off-screen. */
  setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    this.syncFrameLoop();
  }

  dispose(): void {
    this.stopFrameLoop();
    this.resizeObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    delete this.host.dataset.mode;
  }

  private buildScene(): void {
    this.camera.position.set(0, 0.6, 5.4);
    this.camera.lookAt(0, 0, 0);

    // One neutral key light, one soft mint fill, one restrained edge light.
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(2.4, 3.2, 3);
    const fillLight = new THREE.DirectionalLight(SIGNAL_MINT, 0.7);
    fillLight.position.set(-3, 0.6, 1.6);
    const edgeLight = new THREE.DirectionalLight(0xffffff, 0.5);
    edgeLight.position.set(-1, -1.4, -3);
    this.scene.add(keyLight, fillLight, edgeLight, new THREE.AmbientLight(0xffffff, 0.28));

    // Matte, low-metalness outer aperture with an open centre.
    const aperture = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.17, 20, 72),
      new THREE.MeshStandardMaterial({ color: SPATIAL_INK, roughness: 0.72, metalness: 0.08 }),
    );

    // The mint reality plane sits behind the opening as a soft satin layer.
    const realityPlane = new THREE.Mesh(
      new THREE.CircleGeometry(1.34, 64),
      new THREE.MeshStandardMaterial({
        color: SIGNAL_MINT,
        roughness: 0.44,
        metalness: 0,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      }),
    );
    realityPlane.position.z = -0.28;

    const apertureRim = new THREE.Mesh(
      new THREE.RingGeometry(1.34, 1.37, 72),
      new THREE.MeshBasicMaterial({ color: SIGNAL_MINT, transparent: true, opacity: 0.5 }),
    );

    this.signalPoint.position.set(1.06, -1.06, 0.2);

    this.assembly.add(aperture, realityPlane, apertureRim, this.signalPoint);
    this.scene.add(this.assembly);

    // The familiar object, with its digital layer revealed alongside it.
    const physical = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 1.12, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x123c41, roughness: 0.58, metalness: 0.06 }),
    );
    const digitalLayer = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 1.12, 0.02),
      new THREE.MeshBasicMaterial({ color: SIGNAL_MINT, transparent: true, opacity: 0.34 }),
    );
    digitalLayer.position.set(0.16, 0.16, 0.28);
    this.object.add(physical, digitalLayer);
    this.object.rotation.set(0.12, -0.4, 0.05);
    this.scene.add(this.object);

    // Restrained calibration lines, low opacity, well away from the caption.
    const floor = new THREE.GridHelper(9, 18, BORDER_DARK, BORDER_DARK);
    floor.position.y = -1.9;
    const floorMaterial = floor.material as THREE.Material;
    floorMaterial.transparent = true;
    floorMaterial.opacity = 0.3;
    this.scene.add(floor);

    if (this.reducedMotion) {
      // Static composed state: layers already converged, object already through.
      this.object.position.set(0, 0, 0.9);
    } else {
      this.object.position.set(0, 0, -1.6);
    }
  }

  private syncFrameLoop(): void {
    if (!this.renderer || !this.visible || document.visibilityState === 'hidden') {
      this.stopFrameLoop();
      return;
    }

    if (this.reducedMotion) {
      this.render(0);
      return;
    }

    if (this.frameId === null) {
      this.frameId = window.requestAnimationFrame((time) => this.tick(time));
    }
  }

  private stopFrameLoop(): void {
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private tick(time: number): void {
    this.frameId = window.requestAnimationFrame((next) => this.tick(next));
    this.render(time);
  }

  private render(time: number): void {
    if (!this.renderer) {
      return;
    }

    if (!this.reducedMotion) {
      const seconds = time / 1000;
      // The camera holds still; the layers and the object are what move.
      this.assembly.rotation.z = Math.sin(seconds * 0.24) * 0.06;
      this.assembly.rotation.y = Math.sin(seconds * 0.18) * 0.12;
      this.object.position.z = -1.6 + (Math.sin(seconds * 0.42) + 1) * 1.25;
      this.object.rotation.y = -0.4 + Math.sin(seconds * 0.3) * 0.22;

      const material = this.signalPoint.material as THREE.MeshBasicMaterial;
      material.opacity = 0.7 + Math.sin(seconds * 1.9) * 0.3;
      material.transparent = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    if (!this.renderer) {
      return;
    }
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // A narrow stage pulls the camera back so the assembly stays fully framed.
    this.camera.position.z = width < 420 ? 6.6 : 5.4;
    this.camera.updateProjectionMatrix();
    if (this.visible) {
      this.syncFrameLoop();
    }
  }
}
