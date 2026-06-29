import type { Point2 } from '../utils/math';

export type PlacementGestureZone = 'move' | 'rotate' | 'none';

export interface PlacementGestureBounds {
  center: Point2;
  radiusPx: number;
  moveRadiusRatio?: number;
  rotateInnerRadiusRatio?: number;
  rotateOuterRadiusRatio?: number;
}

export function classifyPlacementGesture(
  point: Point2,
  {
    center,
    radiusPx,
    moveRadiusRatio = 0.55,
    rotateInnerRadiusRatio = 0.82,
    rotateOuterRadiusRatio = 1.25,
  }: PlacementGestureBounds,
): PlacementGestureZone {
  if (radiusPx <= 0) {
    return 'none';
  }

  const distanceFromCenter = Math.hypot(point.x - center.x, point.y - center.y);
  if (distanceFromCenter <= radiusPx * moveRadiusRatio) {
    return 'move';
  }

  if (distanceFromCenter >= radiusPx * rotateInnerRadiusRatio && distanceFromCenter <= radiusPx * rotateOuterRadiusRatio) {
    return 'rotate';
  }

  return 'none';
}

export function rotationDeltaFromVerticalDrag(previousPoint: Point2, nextPoint: Point2): number {
  return (nextPoint.y - previousPoint.y) * 0.01;
}
