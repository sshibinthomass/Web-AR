import * as THREE from 'three';

export class HitTestManager {
  latestPoseMatrix: THREE.Matrix4 | null = null;
  latestPoint: THREE.Vector3 | null = null;
  stableFrames = 0;

  private hitTestSource: XRHitTestSource | null = null;
  private hitTestSourceRequested = false;

  constructor(private readonly reticle: THREE.Mesh) {}

  reset(): void {
    this.latestPoseMatrix = null;
    this.latestPoint = null;
    this.stableFrames = 0;
    this.hitTestSource = null;
    this.hitTestSourceRequested = false;
    this.reticle.visible = false;
  }

  update(frame: XRFrame, session: XRSession, referenceSpace: XRReferenceSpace): boolean {
    if (!this.hitTestSourceRequested) {
      this.hitTestSourceRequested = true;
      void session.requestReferenceSpace('viewer').then((viewerSpace) => {
        const requestHitTestSource = session.requestHitTestSource;
        if (!requestHitTestSource) {
          return undefined;
        }

        return requestHitTestSource({ space: viewerSpace })?.then((source) => {
          this.hitTestSource = source ?? null;
        });
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
      this.reticle.visible = false;
      return false;
    }

    const hitTestResults = frame.getHitTestResults(this.hitTestSource);

    if (hitTestResults.length === 0) {
      this.reticle.visible = false;
      this.stableFrames = 0;
      return false;
    }

    const hit = hitTestResults[0];
    const pose = hit.getPose(referenceSpace);

    if (!pose) {
      this.reticle.visible = false;
      this.stableFrames = 0;
      return false;
    }

    this.reticle.visible = true;
    this.reticle.matrix.fromArray(pose.transform.matrix);

    const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    this.latestPoseMatrix = matrix;
    this.latestPoint = new THREE.Vector3().setFromMatrixPosition(matrix);
    this.stableFrames += 1;

    return true;
  }
}
