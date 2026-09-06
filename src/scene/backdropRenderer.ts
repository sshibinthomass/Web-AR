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
