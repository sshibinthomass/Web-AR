import {
  getDistanceBetweenTouches,
  type Point2,
} from '../utils/math';

interface GestureHandlers {
  onGestureStart?(point: Point2): void;
  onLongPress?(point: Point2): void;
  onTap(point: Point2): void;
  onDrag(point: Point2, startPoint: Point2): void;
  onPinch(multiplier: number): void;
  onGestureEnd?(): void;
}

interface GestureOptions {
  longPressDurationMs?: number;
  longPressMoveTolerancePx?: number;
}

export class GestureController {
  private active = false;
  private startPoint: Point2 | null = null;
  private lastSinglePoint: Point2 | null = null;
  private lastPinchDistance: number | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressActivated = false;
  private readonly longPressDurationMs: number;
  private readonly longPressMoveTolerancePx: number;

  constructor(
    private readonly target: HTMLElement,
    private readonly handlers: GestureHandlers,
    {
      longPressDurationMs = 450,
      longPressMoveTolerancePx = 12,
    }: GestureOptions = {},
  ) {
    this.longPressDurationMs = longPressDurationMs;
    this.longPressMoveTolerancePx = longPressMoveTolerancePx;
  }

  connect(): void {
    this.target.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.target.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.target.addEventListener('touchend', this.onTouchEnd, { passive: false });
    this.target.addEventListener('touchcancel', this.onTouchCancel, { passive: false });
  }

  disconnect(): void {
    this.target.removeEventListener('touchstart', this.onTouchStart);
    this.target.removeEventListener('touchmove', this.onTouchMove);
    this.target.removeEventListener('touchend', this.onTouchEnd);
    this.target.removeEventListener('touchcancel', this.onTouchCancel);
    this.cancelLongPress();
  }

  private readonly onTouchStart = (event: TouchEvent) => {
    if (isInteractiveTarget(event.target)) {
      this.reset();
      return;
    }

    event.preventDefault();
    this.active = true;

    if (event.touches.length === 1) {
      const point = touchToPoint(event.touches[0]);
      this.startPoint = point;
      this.lastSinglePoint = point;
      this.lastPinchDistance = null;
      this.longPressActivated = false;
      this.startLongPress(point);
      this.handlers.onGestureStart?.(point);
      return;
    }

    if (event.touches.length >= 2) {
      this.cancelLongPress();
      const first = touchToPoint(event.touches[0]);
      const second = touchToPoint(event.touches[1]);
      this.lastPinchDistance = getDistanceBetweenTouches(first, second);
      this.handlers.onGestureStart?.(midpoint(first, second));
    }
  };

  private readonly onTouchMove = (event: TouchEvent) => {
    if (isInteractiveTarget(event.target)) {
      return;
    }

    event.preventDefault();

    if (!this.active) {
      return;
    }

    if (event.touches.length === 1) {
      const point = touchToPoint(event.touches[0]);
      this.lastSinglePoint = point;
      if (
        !this.longPressActivated
        && this.startPoint
        && getDistanceBetweenTouches(this.startPoint, point) >= this.longPressMoveTolerancePx
      ) {
        this.cancelLongPress();
      }
      this.handlers.onDrag(point, this.startPoint ?? point);
      return;
    }

    if (event.touches.length >= 2) {
      this.cancelLongPress();
      const first = touchToPoint(event.touches[0]);
      const second = touchToPoint(event.touches[1]);
      const distance = getDistanceBetweenTouches(first, second);

      if (this.lastPinchDistance && this.lastPinchDistance > 0) {
        this.handlers.onPinch(distance / this.lastPinchDistance);
      }

      this.lastPinchDistance = distance;
    }
  };

  private readonly onTouchEnd = (event: TouchEvent) => {
    if (isInteractiveTarget(event.target)) {
      this.reset();
      return;
    }

    event.preventDefault();

    if (event.touches.length > 0) {
      return;
    }

    if (this.startPoint && this.lastSinglePoint) {
      const distance = getDistanceBetweenTouches(this.startPoint, this.lastSinglePoint);
      if (!this.longPressActivated && distance < 12) {
        this.handlers.onTap(this.lastSinglePoint);
      }
    }

    this.reset();
  };

  private readonly onTouchCancel = (event: TouchEvent) => {
    event.preventDefault();
    this.reset();
  };

  private reset(): void {
    this.cancelLongPress();
    this.active = false;
    this.startPoint = null;
    this.lastSinglePoint = null;
    this.lastPinchDistance = null;
    this.longPressActivated = false;
    this.handlers.onGestureEnd?.();
  }

  private startLongPress(point: Point2): void {
    this.cancelLongPress();
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.longPressActivated = true;
      this.handlers.onLongPress?.(point);
    }, this.longPressDurationMs);
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}

function touchToPoint(touch: Touch): Point2 {
  return {
    x: touch.clientX,
    y: touch.clientY,
  };
}

function midpoint(a: Point2, b: Point2): Point2 {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    ? Boolean(target.closest('button, a, input, select, textarea, [role="button"], #ARButton'))
    : false;
}
