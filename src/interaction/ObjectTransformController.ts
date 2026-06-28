import * as THREE from 'three';
import { clampScale } from '../utils/math';

export class ObjectTransformController {
  private target: THREE.Group | null = null;
  private initialScale = 1;
  floorY: number | null = null;

  setTarget(target: THREE.Group): void {
    this.target = target;
    this.initialScale = target.scale.x;
  }

  placeAt(matrix: THREE.Matrix4): void {
    const target = this.requireTarget();
    matrix.decompose(target.position, target.quaternion, target.scale);
    target.visible = true;
    target.matrixAutoUpdate = true;
    this.floorY = target.position.y;
    this.initialScale = target.scale.x;
  }

  moveToFloorPoint(point: THREE.Vector3): void {
    const target = this.requireTarget();
    const floorY = this.floorY ?? point.y;
    target.position.set(point.x, floorY, point.z);
  }

  rotateBy(deltaRadians: number): void {
    this.requireTarget().rotation.y += deltaRadians;
  }

  scaleBy(multiplier: number): void {
    const target = this.requireTarget();
    const nextScale = clampScale(target.scale.x * multiplier);
    target.scale.setScalar(nextScale);
  }

  resetTransform(): void {
    const target = this.requireTarget();
    target.rotation.set(0, 0, 0);
    target.scale.setScalar(this.initialScale || 1);
    if (this.floorY !== null) {
      target.position.y = this.floorY;
    }
  }

  resetScale(): void {
    this.requireTarget().scale.setScalar(this.initialScale || 1);
  }

  private requireTarget(): THREE.Group {
    if (!this.target) {
      throw new Error('ObjectTransformController target has not been set.');
    }

    return this.target;
  }
}
