import * as THREE from 'three';
import { PoseStabilizer } from './PoseStabilizer';

export class HitTestManager {
  latestPoseMatrix: THREE.Matrix4 | null = null;
  latestPoint: THREE.Vector3 | null = null;
  latestHitResult: XRHitTestResult | null = null;

  private hitTestSource: XRHitTestSource | null = null;
  private hitTestSourceRequested = false;
  private requestGeneration = 0;
  private readonly stabilizer = new PoseStabilizer();

  constructor(private readonly reticle: THREE.Mesh) {}

  get isStable(): boolean {
    return this.stabilizer.isStable;
  }

  reset(): void {
    this.requestGeneration += 1;
    this.hitTestSource?.cancel();
    this.latestPoseMatrix = null;
    this.latestPoint = null;
    this.latestHitResult = null;
    this.hitTestSource = null;
    this.hitTestSourceRequested = false;
    this.stabilizer.reset();
    this.reticle.visible = false;
  }

  update(
    frame: XRFrame,
    session: XRSession,
    referenceSpace: XRReferenceSpace,
    deltaSeconds: number,
  ): boolean {
    if (!this.hitTestSourceRequested) {
      this.hitTestSourceRequested = true;
      const requestGeneration = this.requestGeneration;
      void session.requestReferenceSpace('viewer')
        .then((viewerSpace) => session.requestHitTestSource?.({ space: viewerSpace }))
        .then((source) => {
          if (!source) {
            return;
          }
          if (requestGeneration !== this.requestGeneration) {
            source.cancel();
            return;
          }
          this.hitTestSource = source;
        })
        .catch(() => {
          if (requestGeneration === this.requestGeneration) {
            this.hitTestSource = null;
            this.hitTestSourceRequested = false;
          }
        });

      session.addEventListener(
        'end',
        () => {
          this.reset();
        },
        { once: true },
      );
    }

    if (!this.hitTestSource) {
      this.loseTracking();
      return false;
    }

    const hitTestResults = frame.getHitTestResults(this.hitTestSource);

    if (hitTestResults.length === 0) {
      this.loseTracking();
      return false;
    }

    const hit = hitTestResults[0];
    const pose = hit.getPose(referenceSpace);

    if (!pose) {
      this.loseTracking();
      return false;
    }

    const rawMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const stableMatrix = this.stabilizer.update(rawMatrix, deltaSeconds);
    if (!stableMatrix) {
      this.reticle.visible = false;
      this.latestPoseMatrix = null;
      this.latestPoint = null;
      this.latestHitResult = null;
      return false;
    }

    this.reticle.visible = true;
    this.reticle.matrix.copy(stableMatrix);
    this.latestPoseMatrix = stableMatrix;
    this.latestPoint = new THREE.Vector3().setFromMatrixPosition(stableMatrix);
    this.latestHitResult = hit;

    return true;
  }

  private loseTracking(): void {
    this.reticle.visible = false;
    this.latestPoseMatrix = null;
    this.latestPoint = null;
    this.latestHitResult = null;
    this.stabilizer.reset();
  }
}
