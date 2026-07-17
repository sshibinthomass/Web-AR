import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ObjectReconstructionOverlay,
  computeCoverRect,
  type OverlayDependencies,
} from '../../src/ui/ObjectReconstructionOverlay';

type FrameCallback = (time: number) => void;

interface ContextRecord {
  arcs: Array<[number, number, number]>;
  compositeOperations: string[];
  drawImages: unknown[][];
  fillRects: Array<[number, number, number, number]>;
  globalAlphas: number[];
  lineSegments: Array<[number, number]>;
  putImageDataCalls: unknown[][];
  restore: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  setTransforms: unknown[][];
  context: CanvasRenderingContext2D;
}

interface Harness {
  advanceFrame(time: number): void;
  cancelAnimationFrame: ReturnType<typeof vi.fn>;
  canvases: HTMLCanvasElement[];
  clearTimeout: ReturnType<typeof vi.fn>;
  contexts: ContextRecord[];
  dependencies: OverlayDependencies;
  host: HTMLElement;
  preview: HTMLImageElement;
  requestAnimationFrame: ReturnType<typeof vi.fn>;
  resizeHost(width: number, height: number): void;
  runTimer(): void;
  setNow(time: number): void;
}

afterEach(() => {
  document.body.replaceChildren();
  delete (document as unknown as { visibilityState?: DocumentVisibilityState }).visibilityState;
});

describe('computeCoverRect', () => {
  it('mirrors a horizontally cropped object-fit cover image', () => {
    expect(computeCoverRect(1600, 900, 300, 300)).toEqual({
      x: -116.66666666666669,
      y: 0,
      width: 533.3333333333334,
      height: 300,
    });
  });

  it('mirrors a vertically cropped object-fit cover image', () => {
    expect(computeCoverRect(800, 1200, 400, 200)).toEqual({
      x: 0,
      y: -200,
      width: 400,
      height: 600,
    });
  });

  it('rejects non-positive and non-finite dimensions', () => {
    expect(() => computeCoverRect(0, 900, 300, 300)).toThrow('positive finite dimensions');
    expect(() => computeCoverRect(1600, 900, Number.NaN, 300)).toThrow('positive finite dimensions');
  });
});

describe('ObjectReconstructionOverlay', () => {
  it('creates one decorative display canvas capped at DPR 2 and aligns the mask to the preview cover crop', async () => {
    const harness = createHarness({ devicePixelRatio: 3 });
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);

    const playback = overlay.play(validPlayback());
    await flushSetup();

    expect(harness.host.querySelectorAll('canvas')).toHaveLength(1);
    const displayCanvas = harness.host.querySelector('canvas') as HTMLCanvasElement;
    expect(displayCanvas.className).toBe('object-reconstruction-overlay');
    expect(displayCanvas.getAttribute('aria-hidden')).toBe('true');
    expect(displayCanvas.width).toBe(600);
    expect(displayCanvas.height).toBe(600);
    expect(displayCanvas.style.width).toBe('300px');
    expect(displayCanvas.style.height).toBe('300px');
    expect(harness.contexts).toHaveLength(5);
    expect(harness.contexts.slice(0, 4).every(({ setTransforms }) =>
      setTransforms.some((args) => args.join(',') === '2,0,0,2,0,0'),
    )).toBe(true);

    const maskDraw = harness.contexts[1].drawImages[0];
    expect(maskDraw?.slice(1)).toEqual([
      -116.66666666666669,
      0,
      533.3333333333334,
      300,
    ]);

    overlay.cancel();
    await playback;
  });

  it('aligns the cover crop to the preview content box rather than its border box', async () => {
    const harness = createHarness({
      hostRect: [10, 20, 400, 300],
      previewBox: {
        border: [2, 4, 6, 8],
        padding: [3, 5, 7, 9],
      },
      previewRect: [30, 50, 320, 220],
    });
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    const contentWidth = 320 - 2 - 4 - 3 - 5;
    const contentHeight = 220 - 6 - 8 - 7 - 9;
    const cover = computeCoverRect(1600, 900, contentWidth, contentHeight);
    expect(harness.contexts[1].drawImages[0]?.slice(1)).toEqual([
      30 - 10 + 2 + 3 + cover.x,
      50 - 20 + 6 + 7 + cover.y,
      cover.width,
      cover.height,
    ]);
    const normalizedSourceMask = harness.contexts[4].putImageDataCalls[0][0] as ImageData;
    expect(normalizedSourceMask.data[3]).toBe(0);
    expect(normalizedSourceMask.data[(450 * normalizedSourceMask.width + 800) * 4 + 3]).toBe(255);

    overlay.cancel();
    await playback;
  });

  it('clips the animated cyan/gold effects with destination-in and restores canvas state', async () => {
    const harness = createHarness();
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    expect(harness.requestAnimationFrame).toHaveBeenCalledTimes(1);
    harness.advanceFrame(0);

    const [display, , effect] = harness.contexts;
    expect(effect.compositeOperations).toContain('destination-in');
    expect(effect.drawImages).toContainEqual([harness.canvases[1], 0, 0, 300, 300]);
    expect(effect.arcs.length).toBeGreaterThan(0);
    expect(effect.save).toHaveBeenCalled();
    expect(effect.restore).toHaveBeenCalledTimes(effect.save.mock.calls.length);
    expect(effect.context.globalCompositeOperation).toBe('source-over');
    expect(display.context.globalCompositeOperation).toBe('source-over');

    overlay.cancel();
    await playback;
  });

  it('derives a continuous transparent-interior edge ring from the mask alpha', async () => {
    const harness = createHarness();
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    const edge = harness.contexts[3];
    expect(edge.putImageDataCalls).toHaveLength(1);
    const edgeData = edge.putImageDataCalls[0][0] as ImageData;
    const centerAlpha = edgeData.data[(150 * edgeData.width + 150) * 4 + 3];
    const opaquePixels = edgeData.data.filter((_value, index) => index % 4 === 3 && edgeData.data[index] > 0).length;
    expect(centerAlpha).toBe(0);
    expect(opaquePixels).toBeGreaterThan(300);
    expect(opaquePixels).toBeLessThan(300 * 180);

    harness.advanceFrame(0);
    expect(harness.contexts[2].drawImages).toContainEqual([harness.canvases[3], 0, 0, 300, 300]);

    overlay.cancel();
    await playback;
  });

  it('converts the opaque grayscale PNG mask luminance into compositing alpha', async () => {
    const harness = createHarness();
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    expect(harness.contexts[4].putImageDataCalls).toHaveLength(1);
    const normalizedMask = harness.contexts[4].putImageDataCalls[0][0] as ImageData;
    expect(normalizedMask.data[3]).toBe(0);
    expect(normalizedMask.data[(450 * normalizedMask.width + 800) * 4 + 3]).toBe(255);

    overlay.cancel();
    await playback;
  });

  it('keeps particles deterministic across frames and fades during the final 20 percent', async () => {
    const harness = createHarness();
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    harness.advanceFrame(250);
    const firstParticles = [...harness.contexts[2].arcs];
    harness.contexts[2].arcs.length = 0;
    harness.setNow(2250);
    harness.advanceFrame(2250);

    expect(harness.contexts[2].arcs).toEqual(firstParticles);
    expect(harness.contexts[0].globalAlphas).toContainEqual(expect.closeTo(0.5, 5));

    overlay.cancel();
    await playback;
  });

  it('uses the default 2500ms duration, resolves, and removes the canvas', async () => {
    const harness = createHarness();
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    harness.setNow(2499);
    harness.advanceFrame(2499);
    expect(harness.host.querySelector('canvas')).not.toBeNull();

    harness.setNow(2500);
    harness.advanceFrame(2500);
    await expect(playback).resolves.toBeUndefined();
    expect(harness.host.querySelector('canvas')).toBeNull();
  });

  it('draws only a brief static object outline in reduced motion and schedules no moving frame', async () => {
    const harness = createHarness({ reducedMotion: true });
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    expect(harness.requestAnimationFrame).not.toHaveBeenCalled();
    expect(harness.contexts[2].drawImages).toContainEqual([harness.canvases[3], 0, 0, 300, 300]);
    expect(harness.contexts[2].lineSegments).toHaveLength(0);
    expect(harness.contexts[2].arcs).toHaveLength(0);
    expect(harness.contexts[2].fillRects).toHaveLength(0);
    expect(harness.host.querySelector('canvas')).not.toBeNull();

    harness.runTimer();
    await expect(playback).resolves.toBeUndefined();
    expect(harness.host.querySelector('canvas')).toBeNull();
  });

  it('cancels playback and releases the canvas when the document becomes hidden', async () => {
    const harness = createHarness();
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));

    await expect(playback).resolves.toBeUndefined();
    expect(harness.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(harness.host.querySelector('canvas')).toBeNull();
  });

  it('cancels playback when the host is removed from the document', async () => {
    const harness = createHarness();
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    harness.host.remove();
    await flushSetup();

    await expect(playback).resolves.toBeUndefined();
    expect(harness.host.querySelector('canvas')).toBeNull();
  });

  it('cancels safely when a resize would invalidate mask alignment', async () => {
    const harness = createHarness();
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    harness.resizeHost(420, 300);
    window.dispatchEvent(new Event('resize'));

    await expect(playback).resolves.toBeUndefined();
    expect(harness.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(harness.host.querySelector('canvas')).toBeNull();
  });

  it('cancels without creating resources when the host is removed during mask decoding', async () => {
    let resolveMask!: (image: CanvasImageSource) => void;
    const harness = createHarness({
      loadImage: vi.fn(() => new Promise<CanvasImageSource>((resolve) => {
        resolveMask = resolve;
      })),
    });
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    harness.host.remove();
    resolveMask(maskSource());

    await expect(playback).resolves.toBeUndefined();
    expect(harness.requestAnimationFrame).not.toHaveBeenCalled();
    expect(harness.host.querySelector('canvas')).toBeNull();
  });

  it('remeasures a resized host after deferred mask decoding before creating canvases', async () => {
    let resolveMask!: (image: CanvasImageSource) => void;
    const harness = createHarness({
      loadImage: vi.fn(() => new Promise<CanvasImageSource>((resolve) => {
        resolveMask = resolve;
      })),
    });
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    harness.resizeHost(420, 300);
    resolveMask(maskSource());
    await flushSetup();

    const displayCanvas = harness.host.querySelector('canvas') as HTMLCanvasElement;
    expect(displayCanvas.width).toBe(420);
    expect(displayCanvas.style.width).toBe('420px');

    overlay.cancel();
    await playback;
  });

  it('honors an explicit reducedMotion override over matchMedia', async () => {
    const harness = createHarness({ reducedMotion: true });
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play({ ...validPlayback(), reducedMotion: false });
    await flushSetup();

    expect(harness.requestAnimationFrame).toHaveBeenCalledTimes(1);

    overlay.cancel();
    await playback;
  });

  it('cancel resolves pending playback, cancels scheduled work, and removes only its own node', async () => {
    const harness = createHarness();
    const retained = document.createElement('span');
    harness.host.append(retained);
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    overlay.cancel();
    overlay.cancel();

    await expect(playback).resolves.toBeUndefined();
    expect(harness.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(harness.host.querySelector('canvas')).toBeNull();
    expect(retained.parentElement).toBe(harness.host);
  });

  it('a concurrent play resolves the superseded playback and starts one fresh canvas', async () => {
    const harness = createHarness();
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const first = overlay.play(validPlayback());
    await flushSetup();
    const second = overlay.play({ ...validPlayback(), durationMs: 1000 });
    await flushSetup();

    await expect(first).resolves.toBeUndefined();
    expect(harness.host.querySelectorAll('canvas')).toHaveLength(1);

    overlay.cancel();
    await second;
  });

  it('dispose is idempotent and permanently rejects later playback without leaks', async () => {
    const harness = createHarness();
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    overlay.dispose();
    overlay.dispose();

    await expect(playback).resolves.toBeUndefined();
    await expect(overlay.play(validPlayback())).rejects.toThrow('disposed');
    expect(harness.host.querySelector('canvas')).toBeNull();
  });

  it('rejects mask loading errors after cleanup', async () => {
    const harness = createHarness({ loadImage: vi.fn().mockRejectedValue(new Error('mask decode failed')) });
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);

    await expect(overlay.play(validPlayback())).rejects.toThrow('mask decode failed');
    expect(harness.host.querySelector('canvas')).toBeNull();
    expect(harness.cancelAnimationFrame).not.toHaveBeenCalled();
  });

  it('rejects missing canvas contexts after removing the display canvas', async () => {
    const harness = createHarness({ nullContextAt: 2 });
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);

    await expect(overlay.play(validPlayback())).rejects.toThrow('canvas context');
    expect(harness.host.querySelector('canvas')).toBeNull();
  });

  it('rejects render exceptions, restores composite state, and removes scheduled resources', async () => {
    const harness = createHarness({ throwOnEffectFill: true });
    const overlay = new ObjectReconstructionOverlay(harness.host, harness.preview, harness.dependencies);
    const playback = overlay.play(validPlayback());
    await flushSetup();

    harness.advanceFrame(0);

    await expect(playback).rejects.toThrow('effect draw failed');
    expect(harness.contexts[2].context.globalCompositeOperation).toBe('source-over');
    expect(harness.host.querySelector('canvas')).toBeNull();
  });

  it('rejects invalid bounds and zero-sized host or preview before scheduling work', async () => {
    const invalidBoundsHarness = createHarness();
    const invalidBoundsOverlay = new ObjectReconstructionOverlay(
      invalidBoundsHarness.host,
      invalidBoundsHarness.preview,
      invalidBoundsHarness.dependencies,
    );
    await expect(
      invalidBoundsOverlay.play({ ...validPlayback(), bounds: { x: 0.8, y: 0, width: 0.3, height: 1 } }),
    ).rejects.toThrow('bounds');

    const zeroHost = createHarness({ hostSize: [0, 300] });
    const zeroHostOverlay = new ObjectReconstructionOverlay(zeroHost.host, zeroHost.preview, zeroHost.dependencies);
    await expect(zeroHostOverlay.play(validPlayback())).rejects.toThrow('dimensions');

    const zeroPreview = createHarness({ previewSize: [0, 300] });
    const zeroPreviewOverlay = new ObjectReconstructionOverlay(
      zeroPreview.host,
      zeroPreview.preview,
      zeroPreview.dependencies,
    );
    await expect(zeroPreviewOverlay.play(validPlayback())).rejects.toThrow('dimensions');

    expect(invalidBoundsHarness.requestAnimationFrame).not.toHaveBeenCalled();
    expect(zeroHost.requestAnimationFrame).not.toHaveBeenCalled();
    expect(zeroPreview.requestAnimationFrame).not.toHaveBeenCalled();
  });
});

function validPlayback() {
  return {
    maskUrl: 'data:image/png;base64,mask',
    bounds: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 },
  };
}

function createHarness(options: {
  devicePixelRatio?: number;
  hostSize?: [number, number];
  hostRect?: [number, number, number, number];
  loadImage?: OverlayDependencies['loadImage'];
  nullContextAt?: number;
  previewSize?: [number, number];
  previewBox?: {
    border: [number, number, number, number];
    padding: [number, number, number, number];
  };
  previewRect?: [number, number, number, number];
  reducedMotion?: boolean;
  throwOnEffectFill?: boolean;
} = {}): Harness {
  let [hostLeft, hostTop, hostWidth, hostHeight] = options.hostRect ?? [20, 30, ...(options.hostSize ?? [300, 300])];
  const [previewLeft, previewTop, previewWidth, previewHeight] =
    options.previewRect ?? [20, 30, ...(options.previewSize ?? [300, 300])];
  const host = document.createElement('div');
  const preview = document.createElement('img');
  host.append(preview);
  document.body.append(host);
  Object.defineProperties(preview, {
    naturalWidth: { configurable: true, value: 1600 },
    naturalHeight: { configurable: true, value: 900 },
  });
  host.getBoundingClientRect = () => domRect(hostLeft, hostTop, hostWidth, hostHeight);
  preview.getBoundingClientRect = () => domRect(previewLeft, previewTop, previewWidth, previewHeight);
  Object.defineProperties(preview, {
    offsetHeight: { configurable: true, value: previewHeight },
    offsetWidth: { configurable: true, value: previewWidth },
  });
  if (options.previewBox) {
    const [borderLeft, borderRight, borderTop, borderBottom] = options.previewBox.border;
    const [paddingLeft, paddingRight, paddingTop, paddingBottom] = options.previewBox.padding;
    Object.assign(preview.style, {
      borderBottomStyle: 'solid',
      borderBottomWidth: `${borderBottom}px`,
      borderLeftStyle: 'solid',
      borderLeftWidth: `${borderLeft}px`,
      borderRightStyle: 'solid',
      borderRightWidth: `${borderRight}px`,
      borderTopStyle: 'solid',
      borderTopWidth: `${borderTop}px`,
      paddingBottom: `${paddingBottom}px`,
      paddingLeft: `${paddingLeft}px`,
      paddingRight: `${paddingRight}px`,
      paddingTop: `${paddingTop}px`,
    });
  }

  let now = 0;
  let nextFrameId = 1;
  let nextTimerId = 100;
  const frames = new Map<number, FrameCallback>();
  const timers = new Map<number, () => void>();
  const canvases: HTMLCanvasElement[] = [];
  const contexts: ContextRecord[] = [];
  const cancelAnimationFrame = vi.fn((id: number) => frames.delete(id));
  const requestAnimationFrame = vi.fn((callback: FrameCallback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  });
  const clearTimeout = vi.fn((id: number) => timers.delete(id));
  const setTimeout = vi.fn((callback: () => void) => {
    const id = nextTimerId++;
    timers.set(id, callback);
    return id;
  });
  const createCanvas = vi.fn(() => {
    const canvas = document.createElement('canvas');
    const index = canvases.length;
    const record = createContextRecord(
      canvas,
      index === 2 && options.throwOnEffectFill === true,
      index === 4,
    );
    canvases.push(canvas);
    contexts.push(record);
    canvas.getContext = vi.fn(() => index === options.nullContextAt ? null : record.context) as typeof canvas.getContext;
    return canvas;
  });
  const dependencies: OverlayDependencies = {
    cancelAnimationFrame,
    clearTimeout: clearTimeout as OverlayDependencies['clearTimeout'],
    createCanvas,
    devicePixelRatio: () => options.devicePixelRatio ?? 1,
    loadImage: options.loadImage ?? vi.fn().mockResolvedValue(maskSource()),
    matchMedia: vi.fn(() => ({ matches: options.reducedMotion ?? false } as MediaQueryList)),
    now: () => now,
    requestAnimationFrame,
    setTimeout: setTimeout as OverlayDependencies['setTimeout'],
  };

  return {
    advanceFrame(time: number) {
      const pending = [...frames.entries()];
      expect(pending.length).toBeGreaterThan(0);
      const [id, callback] = pending[0];
      frames.delete(id);
      callback(time);
    },
    cancelAnimationFrame,
    canvases,
    clearTimeout,
    contexts,
    dependencies,
    host,
    preview,
    requestAnimationFrame,
    resizeHost(width: number, height: number) {
      hostWidth = width;
      hostHeight = height;
    },
    runTimer() {
      const pending = [...timers.entries()];
      expect(pending.length).toBeGreaterThan(0);
      const [id, callback] = pending[0];
      timers.delete(id);
      callback();
    },
    setNow(time: number) {
      now = time;
    },
  };
}

function maskSource(): CanvasImageSource {
  return {
    naturalHeight: 900,
    naturalWidth: 1600,
    height: 900,
    width: 1600,
  } as unknown as CanvasImageSource;
}

function createContextRecord(
  canvas: HTMLCanvasElement,
  throwOnFill: boolean,
  simulateOpaqueLumaMask: boolean,
): ContextRecord {
  let composite = 'source-over';
  let alpha = 1;
  const state: Array<{ alpha: number; composite: string }> = [];
  const arcs: Array<[number, number, number]> = [];
  const compositeOperations: string[] = [];
  const drawImages: unknown[][] = [];
  const fillRects: Array<[number, number, number, number]> = [];
  const globalAlphas: number[] = [];
  const lineSegments: Array<[number, number]> = [];
  const putImageDataCalls: unknown[][] = [];
  let storedImageData: ImageData | null = null;
  const setTransforms: unknown[][] = [];
  const save = vi.fn(() => state.push({ alpha, composite }));
  const restore = vi.fn(() => {
    const restored = state.pop();
    if (restored) {
      alpha = restored.alpha;
      composite = restored.composite;
    }
  });
  const context = {
    arc: vi.fn((x: number, y: number, radius: number) => arcs.push([x, y, radius])),
    beginPath: vi.fn(),
    canvas,
    clearRect: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      height,
      width,
    })),
    drawImage: vi.fn((...args: unknown[]) => drawImages.push(args)),
    fill: vi.fn(),
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      if (throwOnFill) {
        throw new Error('effect draw failed');
      }
      fillRects.push([x, y, width, height]);
    }),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
      if (storedImageData?.width === width && storedImageData.height === height) {
        return storedImageData;
      }
      const data = new Uint8ClampedArray(width * height * 4);
      if (simulateOpaqueLumaMask) {
        for (let index = 3; index < data.length; index += 4) {
          data[index] = 255;
        }
      }
      for (let y = Math.floor(height * 0.2); y < Math.ceil(height * 0.8); y += 1) {
        for (let x = Math.floor(width * 0.25); x < Math.ceil(width * 0.75); x += 1) {
          const offset = (y * width + x) * 4;
          if (simulateOpaqueLumaMask) {
            data[offset] = 255;
            data[offset + 1] = 255;
            data[offset + 2] = 255;
          }
          data[offset + 3] = 255;
        }
      }
      return { data, height, width } as ImageData;
    }),
    lineTo: vi.fn((x: number, y: number) => lineSegments.push([x, y])),
    moveTo: vi.fn((x: number, y: number) => lineSegments.push([x, y])),
    putImageData: vi.fn((...args: unknown[]) => {
      putImageDataCalls.push(args);
      storedImageData = args[0] as ImageData;
    }),
    restore,
    save,
    setLineDash: vi.fn(),
    setTransform: vi.fn((...args: unknown[]) => setTransforms.push(args)),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperties(context, {
    globalAlpha: {
      configurable: true,
      get: () => alpha,
      set: (value: number) => {
        alpha = value;
        globalAlphas.push(value);
      },
    },
    globalCompositeOperation: {
      configurable: true,
      get: () => composite,
      set: (value: string) => {
        composite = value;
        compositeOperations.push(value);
      },
    },
  });

  return {
    arcs,
    compositeOperations,
    context,
    drawImages,
    fillRects,
    globalAlphas,
    lineSegments,
    putImageDataCalls,
    restore,
    save,
    setTransforms,
  };
}

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  };
}

async function flushSetup(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
