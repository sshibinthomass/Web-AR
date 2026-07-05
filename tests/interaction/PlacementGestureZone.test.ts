import { describe, expect, it } from 'vitest';
import { classifyPlacementGesture } from '../../src/interaction/PlacementGestureZone';

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

  it('ignores touches between the move area and marker line', () => {
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

  it('does not rotate when touch starts on the placement circle line', () => {
    expect(
      classifyPlacementGesture(
        { x: 180, y: 100 },
        {
          center: { x: 100, y: 100 },
          radiusPx: 80,
        },
      ),
    ).toBe('none');
  });

  it('does not use the outer placement circle as a touch rotation handle', () => {
    expect(
      classifyPlacementGesture(
        { x: 195, y: 100 },
        {
          center: { x: 100, y: 100 },
          radiusPx: 80,
        },
      ),
    ).toBe('none');
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
});
