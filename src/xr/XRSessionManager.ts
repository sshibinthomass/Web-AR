import * as THREE from 'three';
import { ARButton, type ARButtonSessionInit } from 'three/addons/webxr/ARButton.js';

const WEBXR_FEATURES = {
  requiredFeatures: ['hit-test'],
  optionalFeatures: ['dom-overlay', 'anchors', 'plane-detection', 'light-estimation'],
} as const;

export function createARSessionButton(
  renderer: THREE.WebGLRenderer,
  overlayRoot: HTMLElement,
): HTMLElement {
  const sessionInit: Partial<ARButtonSessionInit> = {
    requiredFeatures: [...WEBXR_FEATURES.requiredFeatures],
    optionalFeatures: [...WEBXR_FEATURES.optionalFeatures],
    domOverlay: { root: overlayRoot },
  };

  return ARButton.createButton(renderer, sessionInit);
}
