import {
  getAngleBetweenTouches,
  getDistanceBetweenTouches,
  type Point2,
} from '../utils/math';

interface GestureHandlers {
  onTap(point: Point2): void;
  onDrag(point: Point2): void;
  onPinch(multiplier: number): void;
  onTwist(deltaRadians: number): void;
}

export class GestureController {
  private active = false;
  private startPoint: Point2 | null = null;
  private lastSinglePoint: Point2 | null = null;
  private lastPinchDistance: number | null = null;
  private lastTwistAngle: number | null = null;

  constructor(
    private readonly target: HTMLElement,
    private readonly handlers: GestureHandlers,
  ) {}

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
      this.lastTwistAngle = null;
      return;
    }

    if (event.touches.length >= 2) {
      const first = touchToPoint(event.touches[0]);
      const second = touchToPoint(event.touches[1]);
      this.lastPinchDistance = getDistanceBetweenTouches(first, second);
      this.lastTwistAngle = getAngleBetweenTouches(first, second);
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
      this.handlers.onDrag(point);
      return;
    }

    if (event.touches.length >= 2) {
      const first = touchToPoint(event.touches[0]);
      const second = touchToPoint(event.touches[1]);
      const distance = getDistanceBetweenTouches(first, second);
      const angle = getAngleBetweenTouches(first, second);

      if (this.lastPinchDistance && this.lastPinchDistance > 0) {
        this.handlers.onPinch(distance / this.lastPinchDistance);
      }

      if (this.lastTwistAngle !== null) {
        this.handlers.onTwist(angle - this.lastTwistAngle);
      }

      this.lastPinchDistance = distance;
      this.lastTwistAngle = angle;
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
      if (distance < 12) {
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
    this.active = false;
    this.startPoint = null;
    this.lastSinglePoint = null;
    this.lastPinchDistance = null;
    this.lastTwistAngle = null;
  }
}

function touchToPoint(touch: Touch): Point2 {
  return {
    x: touch.clientX,
    y: touch.clientY,
  };
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    ? Boolean(target.closest('button, a, input, select, textarea, [role="button"], #ARButton'))
    : false;
}
