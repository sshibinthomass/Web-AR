import * as THREE from 'three';

export interface FloorPlane {
  center: THREE.Vector3;
  pointCount: number;
}

export class PlaneTrackingManager {
  latestFloor: FloorPlane | null = null;

  constructor(private readonly grid: THREE.GridHelper) {}

  update(frame: XRFrame, referenceSpace: XRReferenceSpace, fallbackFloorY: number | null): FloorPlane | null {
    const detectedPlanes = frame.detectedPlanes;

    if (!detectedPlanes || detectedPlanes.size === 0) {
      this.updateGridFromFallback(fallbackFloorY);
      return null;
    }

    for (const plane of detectedPlanes) {
      const pose = frame.getPose(plane.planeSpace, referenceSpace);
      if (!pose) {
        continue;
      }

      const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
      const center = new THREE.Vector3().setFromMatrixPosition(matrix);

      if (fallbackFloorY !== null && Math.abs(center.y - fallbackFloorY) > 0.35) {
        continue;
      }

      this.latestFloor = {
        center,
        pointCount: plane.polygon.length,
      };

      this.grid.visible = true;
      this.grid.position.copy(center);
      return this.latestFloor;
    }

    this.updateGridFromFallback(fallbackFloorY);
    return null;
  }

  hide(): void {
    this.grid.visible = false;
  }

  private updateGridFromFallback(fallbackFloorY: number | null): void {
    if (fallbackFloorY === null) {
      this.grid.visible = false;
      return;
    }

    this.grid.visible = true;
    this.grid.position.y = fallbackFloorY;
  }
}
