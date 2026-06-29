import type { Point2 } from '../utils/math';

export type PlacementGestureZone = 'move' | 'rotate' | 'none';

export interface PlacementGestureBounds {
  center: Point2;
  radiusPx: number;
  ringTolerancePx?: number;
}

export function classifyPlacementGesture(
  point: Point2,
  { center, radiusPx, ringTolerancePx = 18 }: PlacementGestureBounds,
): PlacementGestureZone {
  if (radiusPx <= 0) {
    return 'none';
  }

  const distanceFromCenter = Math.hypot(point.x - center.x, point.y - center.y);
  if (Math.abs(distanceFromCenter - radiusPx) <= ringTolerancePx) {
    return 'rotate';
  }

  if (distanceFromCenter < radiusPx - ringTolerancePx) {
    return 'move';
  }

  return 'none';
}

export function rotationDeltaFromVerticalDrag(previousPoint: Point2, nextPoint: Point2): number {
  return (nextPoint.y - previousPoint.y) * 0.01;
}
