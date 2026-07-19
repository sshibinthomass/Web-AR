import * as THREE from 'three';

const MIN_STABLE_FRAMES = 8;
const POSITION_TOLERANCE_METERS = 0.025;
const MAX_JUMP_METERS = 0.35;
const DAMPING_LAMBDA = 18;

export class PoseStabilizer {
  isStable = false;

  private stableFrames = 0;
  private lastRawPosition: THREE.Vector3 | null = null;
  private smoothedPosition: THREE.Vector3 | null = null;
  private smoothedQuaternion: THREE.Quaternion | null = null;

  update(rawMatrix: THREE.Matrix4, deltaSeconds: number): THREE.Matrix4 | null {
    const rawPosition = new THREE.Vector3();
    const rawQuaternion = new THREE.Quaternion();
    const rawScale = new THREE.Vector3();
    rawMatrix.decompose(rawPosition, rawQuaternion, rawScale);

    if (!this.lastRawPosition || !this.smoothedPosition || !this.smoothedQuaternion) {
      this.startSequence(rawPosition, rawQuaternion);
      return null;
    }

    const movement = rawPosition.distanceTo(this.lastRawPosition);
    if (movement > MAX_JUMP_METERS) {
      this.startSequence(rawPosition, rawQuaternion);
      return null;
    }

    this.stableFrames = movement <= POSITION_TOLERANCE_METERS ? this.stableFrames + 1 : 1;
    this.isStable = this.stableFrames >= MIN_STABLE_FRAMES;
    this.lastRawPosition.copy(rawPosition);

    const alpha = 1 - Math.exp(-DAMPING_LAMBDA * Math.max(0, deltaSeconds));
    this.smoothedPosition.lerp(rawPosition, alpha);
    this.smoothedQuaternion.slerp(rawQuaternion, alpha);

    if (!this.isStable) {
      return null;
    }

    return new THREE.Matrix4().compose(
      this.smoothedPosition,
      this.smoothedQuaternion,
      new THREE.Vector3(1, 1, 1),
    );
  }

  reset(): void {
    this.isStable = false;
    this.stableFrames = 0;
    this.lastRawPosition = null;
    this.smoothedPosition = null;
    this.smoothedQuaternion = null;
  }

  private startSequence(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    this.isStable = false;
    this.stableFrames = 1;
    this.lastRawPosition = position.clone();
    this.smoothedPosition = position.clone();
    this.smoothedQuaternion = quaternion.clone();
  }
}
