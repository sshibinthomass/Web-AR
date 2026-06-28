import { describe, expect, it, vi } from 'vitest';
import { ARHud } from '../../src/ui/ARHud';

const modelOptions = [
  {
    id: 'trellis-fast-output',
    label: 'Fast output',
    url: 'https://web-ar-model-assets.pages.dev/models/trellis-2-4b-fast-output.glb',
  },
  {
    id: 'img4-output',
    label: 'Image 4 output',
    url: 'https://web-ar-model-assets.pages.dev/models/img4_20260628_153027.glb',
  },
];

function createHandlers(overrides: Partial<ConstructorParameters<typeof ARHud>[2]> = {}) {
  return {
    onPlace: vi.fn(),
    onEdit: vi.fn(),
    onReset: vi.fn(),
    onResetScale: vi.fn(),
    onRotateLeft: vi.fn(),
    onRotateRight: vi.fn(),
    onModelSelect: vi.fn(),
    ...overrides,
  };
}

describe('ARHud', () => {
  it('enables Place while scanning after a model is ready', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    hud.updateModelReady(true);
    hud.update('scanning');

    const placeButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Place',
    );
    expect(placeButton).toBeInstanceOf(HTMLButtonElement);
    expect((placeButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('provides a full-screen gesture surface behind controls', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    expect(hud.gestureSurface.className).toBe('gesture-surface');
    expect(hud.overlay.contains(hud.gestureSurface)).toBe(true);
  });

  it('uses gestures instead of rotate buttons', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());

    expect(root.textContent).not.toContain('-15 deg');
    expect(root.textContent).not.toContain('+15 deg');
  });

  it('shows the current model source in the HUD', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    hud.updateModelSource('Cloudflare');

    expect(root.textContent).toContain('Model source: Cloudflare');
  });

  it('lists selectable models without selecting one by default', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());

    const select = root.querySelector('select');

    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect((select as HTMLSelectElement).value).toBe('');
    expect(root.textContent).toContain('Select model');
    expect(root.textContent).toContain('Fast output');
    expect(root.textContent).toContain('Image 4 output');
  });

  it('requests a model load only when a model is selected', () => {
    const root = document.createElement('div');
    const onModelSelect = vi.fn();
    new ARHud(root, modelOptions, createHandlers({ onModelSelect }));
    const select = root.querySelector('select') as HTMLSelectElement;

    expect(onModelSelect).not.toHaveBeenCalled();

    select.value = 'img4-output';
    select.dispatchEvent(new Event('change'));

    expect(onModelSelect).toHaveBeenCalledWith('img4-output');
  });
});
