import * as THREE from 'three';

export interface Point2 {
  x: number;
  y: number;
}

export function clampScale(value: number): number {
  return Math.min(5, Math.max(0.1, value));
}

export function getAngleBetweenTouches(a: Point2, b: Point2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function getDistanceBetweenTouches(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function matrixToPosition(matrix: THREE.Matrix4): THREE.Vector3 {
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

export function screenPointToFloorPoint(
  clientPoint: Point2,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  floorY: number,
): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientPoint.x - rect.left) / rect.width) * 2 - 1,
    -(((clientPoint.y - rect.top) / rect.height) * 2 - 1),
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);

  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
  const intersection = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(floor, intersection);

  return hit ? intersection : null;
}
