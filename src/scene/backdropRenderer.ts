import * as THREE from 'three';

/**
 * Creates a renderer for the decorative background scenes.
 *
 * These scenes are progressive enhancement: where WebGL is unavailable, or the
 * context is lost, the caller falls back to the static CSS composition instead.
 */
export function createBackdropRenderer(): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return renderer;
  } catch {
    return null;
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Brand colours shared by the decorative scenes. */
export const BACKDROP_COLORS = {
  signalMint: 0x5eead4,
  anchorGold: 0xf4b942,
  borderDark: 0x1d454a,
  spatialInk: 0x081d21,
} as const;

/**
 * The run/stop half of a decorative scene: both backdrops paused on hidden
 * documents, rendered a single frame under reduced motion, and otherwise drove
 * one rAF chain. Only that scheduling is shared; each scene owns its own
 * geometry, camera and animation.
 */
export class BackdropLoop {
  private frameId: number | null = null;

  constructor(
    private readonly renderFrame: (time: number) => void,
    readonly reducedMotion = prefersReducedMotion(),
  ) {}

  /** Runs while `shouldRun` and the document is visible; holds one frame under reduced motion. */
  sync(shouldRun: boolean): void {
    if (!shouldRun || document.visibilityState === 'hidden') {
      this.stop();
      return;
    }

    if (this.reducedMotion) {
      this.renderFrame(0);
      return;
    }

    if (this.frameId === null) {
      this.frameId = window.requestAnimationFrame((time) => this.tick(time));
    }
  }

  stop(): void {
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private tick(time: number): void {
    this.frameId = window.requestAnimationFrame((next) => this.tick(next));
    this.renderFrame(time);
  }
}
