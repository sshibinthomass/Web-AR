import { describe, expect, it, vi } from 'vitest';
import { ARHud } from '../../src/ui/ARHud';

describe('ARHud', () => {
  it('enables Place while scanning so users can use fallback placement', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, {
      onPlace: vi.fn(),
      onEdit: vi.fn(),
      onReset: vi.fn(),
      onResetScale: vi.fn(),
      onRotateLeft: vi.fn(),
      onRotateRight: vi.fn(),
    });

    hud.update('scanning');

    const placeButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Place',
    );
    expect(placeButton).toBeInstanceOf(HTMLButtonElement);
    expect((placeButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('provides a full-screen gesture surface behind controls', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, {
      onPlace: vi.fn(),
      onEdit: vi.fn(),
      onReset: vi.fn(),
      onResetScale: vi.fn(),
      onRotateLeft: vi.fn(),
      onRotateRight: vi.fn(),
    });

    expect(hud.gestureSurface.className).toBe('gesture-surface');
    expect(hud.overlay.contains(hud.gestureSurface)).toBe(true);
  });

  it('uses gestures instead of rotate buttons', () => {
    const root = document.createElement('div');
    new ARHud(root, {
      onPlace: vi.fn(),
      onEdit: vi.fn(),
      onReset: vi.fn(),
      onResetScale: vi.fn(),
      onRotateLeft: vi.fn(),
      onRotateRight: vi.fn(),
    });

    expect(root.textContent).not.toContain('-15 deg');
    expect(root.textContent).not.toContain('+15 deg');
  });
});
