import * as THREE from 'three';
import { BACKDROP_COLORS, BackdropLoop, createBackdropRenderer } from './backdropRenderer';

const { signalMint: SIGNAL_MINT, anchorGold: ANCHOR_GOLD, borderDark: BORDER_DARK } = BACKDROP_COLORS;

/** Pointer parallax stays inside the 2-3 degree limit the design system sets. */
const MAX_PARALLAX_RADIANS = THREE.MathUtils.degToRad(2.5);

function pointCount(): number {
  const area = window.innerWidth * window.innerHeight;
  return THREE.MathUtils.clamp(Math.round(area / 1600), 260, 1400);
}

function createLattice(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * 26;
    positions[index * 3 + 1] = (Math.random() - 0.5) * 14;
    positions[index * 3 + 2] = -Math.random() * 18;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: SIGNAL_MINT,
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}

/** The calibration grid that connects the field to a real floor plane. */
function createCalibrationGrid(): THREE.GridHelper {
  const grid = new THREE.GridHelper(60, 60, BORDER_DARK, BORDER_DARK);
  grid.position.set(0, -5, -8);
  const material = grid.material as THREE.Material;
  material.transparent = true;
  material.opacity = 0.22;
  material.depthWrite = false;
  return grid;
}

/** One gold signal point: the moment a location becomes active. */
function createSignalPoint(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 18, 18),
    new THREE.MeshBasicMaterial({ color: ANCHOR_GOLD, transparent: true, opacity: 0.9 }),
  );
  mesh.position.set(4.6, 1.6, -6);
  return mesh;
}

/**
 * The persistent point field behind every standard route.
 *
 * It is decorative only: no text, status or control ever lives inside it, and
 * it renders nothing at all until the host asks it to be active.
 */
export class SpatialField {
  readonly root: HTMLElement;

  private readonly renderer: THREE.WebGLRenderer | null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 80);
  private readonly lattice: THREE.Points | null;
  private readonly signalPoint: THREE.Mesh | null;
  private readonly loop = new BackdropLoop((time) => this.render(time));

  private active = false;
  private pointerX = 0;
  private pointerY = 0;

  private readonly handleResize = () => this.resize();
  private readonly handlePointerMove = (event: PointerEvent) => {
    this.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointerY = (event.clientY / window.innerHeight) * 2 - 1;
  };
  private readonly handleVisibilityChange = () => this.syncFrameLoop();

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'spatial-field';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.hidden = true;
    host.prepend(this.root);

    this.renderer = createBackdropRenderer();

    if (!this.renderer) {
      this.root.dataset.mode = 'static';
      this.lattice = null;
      this.signalPoint = null;
      return;
    }

    this.root.dataset.mode = 'live';
    this.lattice = createLattice(pointCount());
    this.signalPoint = createSignalPoint();
    this.scene.add(this.lattice, createCalibrationGrid(), this.signalPoint);
    this.camera.position.set(0, 0, 6);
    this.root.appendChild(this.renderer.domElement);
    this.resize();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /** Standard routes show the field; immersive AR and camera routes hide it. */
  setActive(active: boolean): void {
    if (this.active === active) {
      return;
    }
    this.active = active;
    this.root.hidden = !active;
    this.syncFrameLoop();
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.renderer?.dispose();
    this.root.remove();
  }

  private syncFrameLoop(): void {
    this.loop.sync(Boolean(this.renderer) && this.active);
  }

  private render(time: number): void {
    if (!this.renderer) {
      return;
    }

    if (this.lattice && !this.loop.reducedMotion) {
      this.lattice.rotation.y = time * 0.000045;
      this.lattice.position.y = Math.sin(time * 0.00016) * 0.16;
    }

    if (this.signalPoint && !this.loop.reducedMotion) {
      const material = this.signalPoint.material as THREE.MeshBasicMaterial;
      material.opacity = 0.72 + Math.sin(time * 0.0018) * 0.18;
    }

    this.camera.rotation.y = -this.pointerX * MAX_PARALLAX_RADIANS;
    this.camera.rotation.x = -this.pointerY * MAX_PARALLAX_RADIANS;
    this.renderer.render(this.scene, this.camera);
  }

  /** Reframe the camera on resize rather than stretching the canvas. */
  private resize(): void {
    if (!this.renderer) {
      return;
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.active) {
      this.syncFrameLoop();
    }
  }
}
