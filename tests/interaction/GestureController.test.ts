import { afterEach, describe, expect, it, vi } from 'vitest';
import { GestureController, isInteractiveTarget } from '../../src/interaction/GestureController';
import { clampScale, getAngleBetweenTouches, getDistanceBetweenTouches } from '../../src/utils/math';

describe('gesture math', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('reports the touched point when a gesture starts', () => {
    const target = document.createElement('div');
    const starts: Array<{ x: number; y: number }> = [];
    const controller = new GestureController(target, {
      onGestureStart: (point) => starts.push(point),
      onTap: () => undefined,
      onDrag: () => undefined,
      onPinch: () => undefined,
    } as ConstructorParameters<typeof GestureController>[1]);
    controller.connect();

    target.dispatchEvent(touchEvent('touchstart', [{ clientX: 20, clientY: 30 }]));
    target.dispatchEvent(touchEvent('touchcancel', []));
    target.dispatchEvent(touchEvent('touchstart', [
      { clientX: 10, clientY: 20 },
      { clientX: 30, clientY: 40 },
    ]));

    expect(starts).toEqual([
      { x: 20, y: 30 },
      { x: 20, y: 30 },
    ]);
  });

  it('activates a long press after the configured hold duration', () => {
    vi.useFakeTimers();
    const target = document.createElement('div');
    const longPresses = vi.fn();
    const controller = new GestureController(target, {
      onLongPress: longPresses,
      onTap: () => undefined,
      onDrag: () => undefined,
      onPinch: () => undefined,
    }, { longPressDurationMs: 450, longPressMoveTolerancePx: 12 });
    controller.connect();

    target.dispatchEvent(touchEvent('touchstart', [{ clientX: 20, clientY: 30 }]));
    vi.advanceTimersByTime(449);
    expect(longPresses).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(longPresses).toHaveBeenCalledOnce();
    expect(longPresses).toHaveBeenCalledWith({ x: 20, y: 30 });
  });

  it('cancels a pending long press at the movement tolerance', () => {
    vi.useFakeTimers();
    const target = document.createElement('div');
    const longPresses = vi.fn();
    const controller = new GestureController(target, {
      onLongPress: longPresses,
      onTap: () => undefined,
      onDrag: () => undefined,
      onPinch: () => undefined,
    }, { longPressDurationMs: 450, longPressMoveTolerancePx: 12 });
    controller.connect();

    target.dispatchEvent(touchEvent('touchstart', [{ clientX: 20, clientY: 30 }]));
    target.dispatchEvent(touchEvent('touchmove', [{ clientX: 32, clientY: 30 }]));
    vi.advanceTimersByTime(450);

    expect(longPresses).not.toHaveBeenCalled();
  });

  it.each(['touchend', 'touchcancel'])(
    'cancels a pending long press on %s',
    (eventType) => {
      vi.useFakeTimers();
      const target = document.createElement('div');
      const longPresses = vi.fn();
      const controller = new GestureController(target, {
        onLongPress: longPresses,
        onTap: () => undefined,
        onDrag: () => undefined,
        onPinch: () => undefined,
      }, { longPressDurationMs: 450 });
      controller.connect();

      target.dispatchEvent(touchEvent('touchstart', [{ clientX: 20, clientY: 30 }]));
      target.dispatchEvent(touchEvent(eventType, []));
      vi.advanceTimersByTime(450);

      expect(longPresses).not.toHaveBeenCalled();
    },
  );

  it('cancels a pending long press when a second touch begins', () => {
    vi.useFakeTimers();
    const target = document.createElement('div');
    const longPresses = vi.fn();
    const controller = new GestureController(target, {
      onLongPress: longPresses,
      onTap: () => undefined,
      onDrag: () => undefined,
      onPinch: () => undefined,
    }, { longPressDurationMs: 450 });
    controller.connect();

    target.dispatchEvent(touchEvent('touchstart', [{ clientX: 20, clientY: 30 }]));
    target.dispatchEvent(touchEvent('touchstart', [
      { clientX: 20, clientY: 30 },
      { clientX: 40, clientY: 30 },
    ]));
    vi.advanceTimersByTime(450);

    expect(longPresses).not.toHaveBeenCalled();
  });

  it('cancels a pending long press when disconnected', () => {
    vi.useFakeTimers();
    const target = document.createElement('div');
    const longPresses = vi.fn();
    const controller = new GestureController(target, {
      onLongPress: longPresses,
      onTap: () => undefined,
      onDrag: () => undefined,
      onPinch: () => undefined,
    }, { longPressDurationMs: 450 });
    controller.connect();

    target.dispatchEvent(touchEvent('touchstart', [{ clientX: 20, clientY: 30 }]));
    controller.disconnect();
    vi.advanceTimersByTime(450);

    expect(longPresses).not.toHaveBeenCalled();
  });

  it('continues dragging without emitting a tap after long-press activation', () => {
    vi.useFakeTimers();
    const target = document.createElement('div');
    const taps = vi.fn();
    const drags = vi.fn();
    const controller = new GestureController(target, {
      onLongPress: () => undefined,
      onTap: taps,
      onDrag: drags,
      onPinch: () => undefined,
    }, { longPressDurationMs: 450 });
    controller.connect();

    target.dispatchEvent(touchEvent('touchstart', [{ clientX: 20, clientY: 30 }]));
    vi.advanceTimersByTime(450);
    target.dispatchEvent(touchEvent('touchmove', [{ clientX: 24, clientY: 34 }]));
    target.dispatchEvent(touchEvent('touchend', []));

    expect(drags).toHaveBeenCalledWith({ x: 24, y: 34 }, { x: 20, y: 30 });
    expect(taps).not.toHaveBeenCalled();
  });
});

function touchEvent(type: string, touches: Array<{ clientX: number; clientY: number }>): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: touches });
  return event;
}
