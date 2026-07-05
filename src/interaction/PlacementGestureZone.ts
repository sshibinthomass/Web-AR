import type { Point2 } from '../utils/math';

export type PlacementGestureZone = 'move' | 'none';

export interface PlacementGestureBounds {
  center: Point2;
  radiusPx: number;
  moveRadiusRatio?: number;
}

export function classifyPlacementGesture(
  point: Point2,
  {
    center,
    radiusPx,
    moveRadiusRatio = 0.55,
  }: PlacementGestureBounds,
): PlacementGestureZone {
  if (radiusPx <= 0) {
    return 'none';
  }

  const distanceFromCenter = Math.hypot(point.x - center.x, point.y - center.y);
  if (distanceFromCenter <= radiusPx * moveRadiusRatio) {
    return 'move';
  }

  return 'none';
}
