import * as THREE from 'three';
import type { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';

type DisposableEstimatedLight = XREstimatedLight & {
  environment: THREE.Texture | null;
  dispose(): void;
};

export class EstimatedLightingController {
  private started = false;
  private disposed = false;
  private estimationActive = false;
  private previousEnvironment: THREE.Texture | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly estimatedLight: DisposableEstimatedLight,
    private readonly fallbackLights: readonly [THREE.HemisphereLight, THREE.DirectionalLight],
  ) {}

  start(): void {
    if (this.started || this.disposed) {
      return;
    }
    this.started = true;
    this.scene.add(this.estimatedLight);
    this.estimatedLight.addEventListener('estimationstart', this.handleEstimationStart);
    this.estimatedLight.addEventListener('estimationend', this.handleEstimationEnd);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.handleEstimationEnd();
    this.estimatedLight.removeEventListener('estimationstart', this.handleEstimationStart);
    this.estimatedLight.removeEventListener('estimationend', this.handleEstimationEnd);
    this.estimatedLight.removeFromParent();
    this.started = false;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.stop();
    this.estimatedLight.dispose();
    this.disposed = true;
  }

  private readonly handleEstimationStart = (): void => {
    if (this.estimationActive) {
      return;
    }
    this.estimationActive = true;
    this.previousEnvironment = this.scene.environment;
    this.fallbackLights.forEach((light) => {
      light.visible = false;
    });
    this.estimatedLight.directionalLight.castShadow = true;
    if (this.estimatedLight.environment) {
      this.scene.environment = this.estimatedLight.environment;
    }
  };

  private readonly handleEstimationEnd = (): void => {
    if (!this.estimationActive) {
      return;
    }
    if (this.scene.environment === this.estimatedLight.environment) {
      this.scene.environment = this.previousEnvironment;
    }
    this.previousEnvironment = null;
    this.estimationActive = false;
    this.fallbackLights.forEach((light) => {
      light.visible = true;
    });
  };
}
