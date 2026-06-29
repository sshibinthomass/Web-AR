import { describe, expect, it } from 'vitest';
import {
  classifyPlacementGesture,
  rotationDeltaFromVerticalDrag,
} from '../../src/interaction/PlacementGestureZone';

describe('PlacementGestureZone', () => {
  it('classifies touches inside the placement circle as move gestures', () => {
    expect(
      classifyPlacementGesture(
        { x: 120, y: 100 },
        {
          center: { x: 100, y: 100 },
          radiusPx: 80,
        },
      ),
    ).toBe('move');
  });

  it('leaves a dead zone between move and rotate gestures', () => {
    expect(
      classifyPlacementGesture(
        { x: 160, y: 100 },
        {
          center: { x: 100, y: 100 },
          radiusPx: 80,
        },
      ),
    ).toBe('none');
  });

  it('classifies touches on the placement circle line as rotate gestures', () => {
    expect(
      classifyPlacementGesture(
        { x: 180, y: 100 },
        {
          center: { x: 100, y: 100 },
          radiusPx: 80,
        },
      ),
    ).toBe('rotate');
  });

  it('ignores touches outside the placement circle', () => {
    expect(
      classifyPlacementGesture(
        { x: 220, y: 100 },
        {
          center: { x: 100, y: 100 },
          radiusPx: 80,
        },
      ),
    ).toBe('none');
  });

  it('converts front-back screen drags into rotation deltas', () => {
    expect(rotationDeltaFromVerticalDrag({ x: 100, y: 100 }, { x: 100, y: 130 })).toBeCloseTo(0.3);
    expect(rotationDeltaFromVerticalDrag({ x: 100, y: 130 }, { x: 100, y: 100 })).toBeCloseTo(-0.3);
  });
});
