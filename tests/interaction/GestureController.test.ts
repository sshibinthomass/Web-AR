import { describe, expect, it } from 'vitest';
import { isInteractiveTarget } from '../../src/interaction/GestureController';
import { clampScale, getAngleBetweenTouches, getDistanceBetweenTouches } from '../../src/utils/math';

describe('gesture math', () => {
  it('clamps scale to mobile-safe limits', () => {
    expect(clampScale(0.01)).toBe(0.1);
    expect(clampScale(10)).toBe(5);
    expect(clampScale(1.5)).toBe(1.5);
  });

  it('calculates twist angle between two points', () => {
    expect(getAngleBetweenTouches({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
    expect(getAngleBetweenTouches({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0);
  });

  it('calculates distance between touches', () => {
    expect(getDistanceBetweenTouches({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('does not intercept actual controls', () => {
    const button = document.createElement('button');
    const span = document.createElement('span');
    button.appendChild(span);

    expect(isInteractiveTarget(button)).toBe(true);
    expect(isInteractiveTarget(span)).toBe(true);
    expect(isInteractiveTarget(document.createElement('div'))).toBe(false);
  });
});
