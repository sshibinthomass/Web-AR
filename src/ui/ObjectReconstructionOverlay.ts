import type { ObjectBounds } from '../services/objectSegmentationClient';

export type { ObjectBounds } from '../services/objectSegmentationClient';

export interface ReconstructionPlayback {
  maskUrl: string;
  bounds: ObjectBounds;
  durationMs?: number;
  reducedMotion?: boolean;
}

export interface OverlayDependencies {
  cancelAnimationFrame?: (frameId: number) => void;
  clearTimeout?: (timerId: number) => void;
  createCanvas?: () => HTMLCanvasElement;
  devicePixelRatio?: () => number;
  loadImage?: (url: string) => Promise<CanvasImageSource>;
  matchMedia?: (query: string) => Pick<MediaQueryList, 'matches'>;
  now?: () => number;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  setTimeout?: (callback: () => void, delayMs: number) => number;
}

export interface CoverRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

interface PreparedPlayback {
  boundsRect: CoverRect;
  displayCanvas: HTMLCanvasElement;
  displayContext: CanvasRenderingContext2D;
  edgeCanvas: HTMLCanvasElement;
  effectCanvas: HTMLCanvasElement;
  effectContext: CanvasRenderingContext2D;
  geometry: OverlayGeometry;
  height: number;
  maskCanvas: HTMLCanvasElement;
  particles: Point[];
  width: number;
}

interface ActivePlayback {
  disconnectRemoval: (() => void) | null;
  frameId: number | null;
  node: HTMLCanvasElement | null;
  orientationListener: (() => void) | null;
  reject: (reason?: unknown) => void;
  resolve: () => void;
  settled: boolean;
  timerId: number | null;
  resizeListener: (() => void) | null;
  visibilityListener: (() => void) | null;
}

interface OverlayGeometry {
  height: number;
  hostRect: CoverRect;
  previewContentRect: CoverRect;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
}

const DEFAULT_DURATION_MS = 2500;
const REDUCED_MOTION_DISPLAY_MS = 360;
const MAX_DEVICE_PIXEL_RATIO = 2;
const MAX_PARTICLES = 18;

const colors = {
  cyan: '#55f3e3',
  cyanSoft: 'rgba(85, 243, 227, 0.22)',
  gold: '#e6b85c',
  goldSoft: 'rgba(230, 184, 92, 0.3)',
  grid: 'rgba(85, 243, 227, 0.34)',
} as const;

export function computeCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
): CoverRect {
  if (![sourceWidth, sourceHeight, destinationWidth, destinationHeight].every(isPositiveFiniteNumber)) {
    throw new Error('Cover geometry requires positive finite dimensions.');
  }

  const sourceAspectRatio = sourceWidth / sourceHeight;
  const destinationAspectRatio = destinationWidth / destinationHeight;
  const width = sourceAspectRatio > destinationAspectRatio
    ? destinationHeight * sourceWidth / sourceHeight
    : destinationWidth;
  const height = sourceAspectRatio > destinationAspectRatio
    ? destinationHeight
    : destinationWidth * sourceHeight / sourceWidth;
  return {
    x: (destinationWidth - width) / 2,
    y: (destinationHeight - height) / 2,
    width,
    height,
  };
}

export class ObjectReconstructionOverlay {
  private readonly cancelFrame: (frameId: number) => void;
  private readonly clearTimer: (timerId: number) => void;
  private readonly createCanvas: () => HTMLCanvasElement;
  private readonly getDevicePixelRatio: () => number;
  private readonly loadImage: (url: string) => Promise<CanvasImageSource>;
  private readonly matchMedia: (query: string) => Pick<MediaQueryList, 'matches'>;
  private readonly now: () => number;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => number;

  private active: ActivePlayback | null = null;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly preview: HTMLImageElement,
    dependencies: OverlayDependencies = {},
  ) {
    this.cancelFrame = dependencies.cancelAnimationFrame ?? ((frameId) => window.cancelAnimationFrame(frameId));
    this.clearTimer = dependencies.clearTimeout ?? ((timerId) => window.clearTimeout(timerId));
    this.createCanvas = dependencies.createCanvas ?? (() => document.createElement('canvas'));
    this.getDevicePixelRatio = dependencies.devicePixelRatio ?? (() => window.devicePixelRatio || 1);
    this.loadImage = dependencies.loadImage ?? loadCanvasImage;
    this.matchMedia = dependencies.matchMedia ?? ((query) => window.matchMedia(query));
    this.now = dependencies.now ?? (() => performance.now());
    this.requestFrame = dependencies.requestAnimationFrame ?? ((callback) => window.requestAnimationFrame(callback));
    this.setTimer = dependencies.setTimeout ?? ((callback, delayMs) => window.setTimeout(callback, delayMs));
  }

  play(options: ReconstructionPlayback): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('Object reconstruction overlay has been disposed.'));
    }

    this.cancel();
    return new Promise<void>((resolve, reject) => {
      const active: ActivePlayback = {
        disconnectRemoval: null,
        frameId: null,
        node: null,
        orientationListener: null,
        reject,
        resolve,
        settled: false,
        timerId: null,
        resizeListener: null,
        visibilityListener: null,
      };
      this.active = active;
      this.installVisibilityGuard(active);
      if (this.isActive(active)) {
        void this.start(active, options);
      }
    });
  }

  cancel(): void {
    const active = this.active;
    if (!active) {
      return;
    }
    this.active = null;
    this.cleanup(active);
    this.resolve(active);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cancel();
  }

  private async start(active: ActivePlayback, options: ReconstructionPlayback): Promise<void> {
    try {
      validatePlayback(options);
      this.readGeometry();
      const maskImage = await this.loadImage(options.maskUrl);
      if (!this.isActive(active)) {
        return;
      }
      if (!this.host.isConnected) {
        this.finish(active);
        return;
      }
      const maskDimensions = validateImageDimensions(maskImage);
      const geometry = this.readGeometry();
      const prepared = this.prepareCanvas(active, maskImage, maskDimensions, options.bounds, geometry);
      if (!this.isActive(active)) {
        return;
      }
      const reducedMotion = options.reducedMotion ?? this.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) {
        this.drawStaticOutline(prepared);
        active.timerId = this.setTimer(() => {
          active.timerId = null;
          this.finish(active);
        }, REDUCED_MOTION_DISPLAY_MS);
        return;
      }

      const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
      const startedAt = this.now();
      const render = () => {
        active.frameId = null;
        if (!this.isActive(active)) {
          return;
        }
        try {
          const elapsed = Math.max(0, this.now() - startedAt);
          const progress = Math.min(1, elapsed / durationMs);
          this.drawAnimatedFrame(prepared, progress);
          if (progress >= 1) {
            this.finish(active);
            return;
          }
          active.frameId = this.requestFrame(render);
        } catch (error) {
          this.finish(active, error);
        }
      };
      active.frameId = this.requestFrame(render);
    } catch (error) {
      this.finish(active, error);
    }
  }

  private readGeometry(): OverlayGeometry {
    const hostBorderRect = this.host.getBoundingClientRect();
    const previewBorderRect = this.preview.getBoundingClientRect();
    const previewContentRect = contentBoxRect(this.preview, previewBorderRect);
    const sourceWidth = this.preview.naturalWidth || this.preview.width;
    const sourceHeight = this.preview.naturalHeight || this.preview.height;
    if (
      ![
        hostBorderRect.width,
        hostBorderRect.height,
        previewContentRect.width,
        previewContentRect.height,
        sourceWidth,
        sourceHeight,
      ].every(isPositiveFiniteNumber)
    ) {
      throw new Error('Object reconstruction overlay requires positive finite dimensions.');
    }
    return {
      height: hostBorderRect.height,
      hostRect: domRectToCoverRect(hostBorderRect),
      previewContentRect,
      sourceHeight,
      sourceWidth,
      width: hostBorderRect.width,
    };
  }

  private prepareCanvas(
    active: ActivePlayback,
    maskImage: CanvasImageSource,
    maskDimensions: { height: number; width: number },
    bounds: ObjectBounds,
    geometry: OverlayGeometry,
  ): PreparedPlayback {
    const displayCanvas = this.createCanvas();
    const maskCanvas = this.createCanvas();
    const effectCanvas = this.createCanvas();
    const edgeCanvas = this.createCanvas();
    const sourceMaskCanvas = this.createCanvas();
    const ratioCandidate = this.getDevicePixelRatio();
    const ratio = Math.min(MAX_DEVICE_PIXEL_RATIO, Math.max(1, Number.isFinite(ratioCandidate) ? ratioCandidate : 1));
    const backingWidth = Math.max(1, Math.round(geometry.width * ratio));
    const backingHeight = Math.max(1, Math.round(geometry.height * ratio));
    for (const canvas of [displayCanvas, maskCanvas, effectCanvas, edgeCanvas]) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    sourceMaskCanvas.width = Math.max(1, Math.round(maskDimensions.width));
    sourceMaskCanvas.height = Math.max(1, Math.round(maskDimensions.height));
    displayCanvas.style.width = `${geometry.width}px`;
    displayCanvas.style.height = `${geometry.height}px`;
    displayCanvas.className = 'object-reconstruction-overlay';
    displayCanvas.setAttribute('aria-hidden', 'true');

    const displayContext = displayCanvas.getContext('2d');
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
    const effectContext = effectCanvas.getContext('2d');
    const edgeContext = edgeCanvas.getContext('2d');
    const sourceMaskContext = sourceMaskCanvas.getContext('2d', { willReadFrequently: true });
    if (!displayContext || !maskContext || !effectContext || !edgeContext || !sourceMaskContext) {
      throw new Error('Could not create object reconstruction canvas context.');
    }
    for (const context of [displayContext, maskContext, effectContext, edgeContext]) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    const coverRect = computeCoverRect(
      geometry.sourceWidth,
      geometry.sourceHeight,
      geometry.previewContentRect.width,
      geometry.previewContentRect.height,
    );
    const offsetX = geometry.previewContentRect.x - geometry.hostRect.x;
    const offsetY = geometry.previewContentRect.y - geometry.hostRect.y;
    const alignedCoverRect = {
      x: offsetX + coverRect.x,
      y: offsetY + coverRect.y,
      width: coverRect.width,
      height: coverRect.height,
    };
    sourceMaskContext.drawImage(maskImage, 0, 0, sourceMaskCanvas.width, sourceMaskCanvas.height);
    normalizeMaskAlpha(sourceMaskContext, sourceMaskCanvas.width, sourceMaskCanvas.height);
    withContextState(maskContext, () => {
      maskContext.clearRect(0, 0, geometry.width, geometry.height);
      maskContext.drawImage(
        sourceMaskCanvas,
        alignedCoverRect.x,
        alignedCoverRect.y,
        alignedCoverRect.width,
        alignedCoverRect.height,
      );
    });

    const boundsRect = {
      x: alignedCoverRect.x + bounds.x * alignedCoverRect.width,
      y: alignedCoverRect.y + bounds.y * alignedCoverRect.height,
      width: bounds.width * alignedCoverRect.width,
      height: bounds.height * alignedCoverRect.height,
    };
    const particles = buildEdgeLayer(maskContext, edgeContext, backingWidth, backingHeight, ratio);

    this.host.append(displayCanvas);
    active.node = displayCanvas;
    this.installPlaybackGuards(active, geometry);
    return {
      boundsRect,
      displayCanvas,
      displayContext,
      edgeCanvas,
      effectCanvas,
      effectContext,
      geometry,
      height: geometry.height,
      maskCanvas,
      particles,
      width: geometry.width,
    };
  }

  private drawStaticOutline(prepared: PreparedPlayback): void {
    const { displayContext, edgeCanvas, effectContext, height, maskCanvas, width } = prepared;
    withContextState(effectContext, () => {
      effectContext.clearRect(0, 0, width, height);
      effectContext.globalAlpha = 0.78;
      effectContext.shadowBlur = 8;
      effectContext.shadowColor = colors.cyan;
      effectContext.drawImage(edgeCanvas, 0, 0, width, height);
      effectContext.globalCompositeOperation = 'destination-in';
      effectContext.drawImage(maskCanvas, 0, 0, width, height);
    });
    withContextState(displayContext, () => {
      displayContext.clearRect(0, 0, width, height);
      displayContext.globalAlpha = 0.72;
      displayContext.drawImage(prepared.effectCanvas, 0, 0, width, height);
    });
  }

  private drawAnimatedFrame(prepared: PreparedPlayback, progress: number): void {
    const {
      boundsRect,
      displayContext,
      edgeCanvas,
      effectCanvas,
      effectContext,
      height,
      maskCanvas,
      particles,
      width,
    } = prepared;
    withContextState(effectContext, () => {
      effectContext.clearRect(0, 0, width, height);

      effectContext.globalAlpha = 0.38;
      effectContext.shadowBlur = 18;
      effectContext.shadowColor = colors.cyan;
      effectContext.drawImage(edgeCanvas, 0, 0, width, height);
      effectContext.globalAlpha = 0.28;
      effectContext.shadowBlur = 7;
      effectContext.shadowColor = colors.gold;
      effectContext.drawImage(edgeCanvas, 0, 0, width, height);

      drawGrid(effectContext, boundsRect);
      drawScanBand(effectContext, boundsRect, progress);
      drawParticles(effectContext, particles);

      effectContext.globalAlpha = 1;
      effectContext.globalCompositeOperation = 'destination-in';
      effectContext.drawImage(maskCanvas, 0, 0, width, height);
    });

    const fade = progress <= 0.8 ? 1 : Math.max(0, (1 - progress) / 0.2);
    withContextState(displayContext, () => {
      displayContext.clearRect(0, 0, width, height);
      displayContext.globalAlpha = fade;
      displayContext.fillStyle = 'rgba(4, 18, 22, 0.16)';
      displayContext.fillRect(0, 0, width, height);
      withContextState(displayContext, () => {
        displayContext.globalCompositeOperation = 'destination-out';
        displayContext.drawImage(maskCanvas, 0, 0, width, height);
      });
      displayContext.drawImage(effectCanvas, 0, 0, width, height);
    });
  }

  private isActive(active: ActivePlayback): boolean {
    return this.active === active && !active.settled;
  }

  private installVisibilityGuard(active: ActivePlayback): void {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        this.finish(active);
      }
    };
    active.visibilityListener = onVisibilityChange;
    document.addEventListener('visibilitychange', onVisibilityChange);
    onVisibilityChange();
  }

  private installPlaybackGuards(active: ActivePlayback, geometry: OverlayGeometry): void {
    const cancelIfInvalidated = () => {
      if (!this.isActive(active)) {
        return;
      }
      if (!this.host.isConnected || active.node?.parentElement !== this.host) {
        this.finish(active);
        return;
      }
      try {
        if (!sameGeometry(geometry, this.readGeometry())) {
          this.finish(active);
        }
      } catch {
        this.finish(active);
      }
    };
    active.resizeListener = cancelIfInvalidated;
    active.orientationListener = cancelIfInvalidated;
    window.addEventListener('resize', cancelIfInvalidated);
    window.addEventListener('orientationchange', cancelIfInvalidated);

    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(cancelIfInvalidated);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      active.disconnectRemoval = () => observer.disconnect();
    }
    cancelIfInvalidated();
  }

  private finish(active: ActivePlayback, error?: unknown): void {
    if (!this.isActive(active)) {
      return;
    }
    this.active = null;
    this.cleanup(active);
    if (error === undefined) {
      this.resolve(active);
    } else {
      this.reject(active, error);
    }
  }

  private cleanup(active: ActivePlayback): void {
    if (active.frameId !== null) {
      this.cancelFrame(active.frameId);
      active.frameId = null;
    }
    if (active.timerId !== null) {
      this.clearTimer(active.timerId);
      active.timerId = null;
    }
    active.disconnectRemoval?.();
    active.disconnectRemoval = null;
    if (active.resizeListener) {
      window.removeEventListener('resize', active.resizeListener);
      active.resizeListener = null;
    }
    if (active.orientationListener) {
      window.removeEventListener('orientationchange', active.orientationListener);
      active.orientationListener = null;
    }
    if (active.visibilityListener) {
      document.removeEventListener('visibilitychange', active.visibilityListener);
      active.visibilityListener = null;
    }
    active.node?.remove();
    active.node = null;
  }

  private resolve(active: ActivePlayback): void {
    if (active.settled) {
      return;
    }
    active.settled = true;
    active.resolve();
  }

  private reject(active: ActivePlayback, reason: unknown): void {
    if (active.settled) {
      return;
    }
    active.settled = true;
    active.reject(reason);
  }
}

function drawGrid(context: CanvasRenderingContext2D, bounds: CoverRect): void {
  const spacing = Math.max(14, Math.min(bounds.width, bounds.height) / 8);
  context.save();
  try {
    context.beginPath();
    context.strokeStyle = colors.grid;
    context.lineWidth = 0.75;
    for (let x = bounds.x; x <= bounds.x + bounds.width; x += spacing) {
      context.moveTo(x, bounds.y);
      context.lineTo(x, bounds.y + bounds.height);
    }
    for (let y = bounds.y; y <= bounds.y + bounds.height; y += spacing) {
      context.moveTo(bounds.x, y);
      context.lineTo(bounds.x + bounds.width, y);
    }
    context.stroke();
  } finally {
    context.restore();
  }
}

function drawScanBand(context: CanvasRenderingContext2D, bounds: CoverRect, progress: number): void {
  const bandHeight = Math.max(18, bounds.height * 0.12);
  const y = bounds.y - bandHeight + (bounds.height + bandHeight * 2) * progress;
  const gradient = context.createLinearGradient(0, y - bandHeight, 0, y + bandHeight);
  gradient.addColorStop(0, 'rgba(85, 243, 227, 0)');
  gradient.addColorStop(0.48, colors.cyanSoft);
  gradient.addColorStop(0.52, colors.goldSoft);
  gradient.addColorStop(1, 'rgba(230, 184, 92, 0)');
  context.fillStyle = gradient;
  context.fillRect(bounds.x, y - bandHeight, bounds.width, bandHeight * 2);
}

function drawParticles(context: CanvasRenderingContext2D, particles: Point[]): void {
  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index];
    context.beginPath();
    context.fillStyle = index % 4 === 0 ? colors.gold : colors.cyan;
    context.globalAlpha = index % 3 === 0 ? 0.74 : 0.48;
    context.arc(particle.x, particle.y, index % 5 === 0 ? 1.7 : 1.05, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function buildEdgeLayer(
  maskContext: CanvasRenderingContext2D,
  edgeContext: CanvasRenderingContext2D,
  backingWidth: number,
  backingHeight: number,
  ratio: number,
): Point[] {
  const maskData = maskContext.getImageData(0, 0, backingWidth, backingHeight);
  const edgeData = edgeContext.createImageData(backingWidth, backingHeight);
  const alphaAt = (x: number, y: number) => maskData.data[(y * backingWidth + x) * 4 + 3] ?? 0;
  const candidates: Point[] = [];
  for (let y = 1; y < backingHeight - 1; y += 1) {
    for (let x = 1; x < backingWidth - 1; x += 1) {
      if (alphaAt(x, y) < 96) {
        continue;
      }
      if (
        alphaAt(x - 1, y) < 96 ||
        alphaAt(x + 1, y) < 96 ||
        alphaAt(x, y - 1) < 96 ||
        alphaAt(x, y + 1) < 96
      ) {
        const offset = (y * backingWidth + x) * 4;
        const useGoldAccent = (x * 17 + y * 29) % 97 === 0;
        edgeData.data[offset] = useGoldAccent ? 230 : 85;
        edgeData.data[offset + 1] = useGoldAccent ? 184 : 243;
        edgeData.data[offset + 2] = useGoldAccent ? 92 : 227;
        edgeData.data[offset + 3] = useGoldAccent ? 235 : 220;
        candidates.push({ x: x / ratio, y: y / ratio });
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error('Object reconstruction mask contains no visible object edge.');
  }
  edgeContext.putImageData(edgeData, 0, 0);
  const particles: Point[] = [];
  const stride = Math.max(1, Math.floor(candidates.length / MAX_PARTICLES));
  for (let index = 0; index < candidates.length && particles.length < MAX_PARTICLES; index += stride) {
    particles.push(candidates[index]);
  }
  return particles;
}

function normalizeMaskAlpha(
  context: CanvasRenderingContext2D,
  backingWidth: number,
  backingHeight: number,
): void {
  const imageData = context.getImageData(0, 0, backingWidth, backingHeight);
  let hasTransparentPixels = false;
  for (let offset = 3; offset < imageData.data.length; offset += 4) {
    if (imageData.data[offset] < 250) {
      hasTransparentPixels = true;
      break;
    }
  }
  for (let offset = 0; offset < imageData.data.length; offset += 4) {
    const alpha = imageData.data[offset + 3];
    const luminance = Math.round(
      imageData.data[offset] * 0.2126 +
      imageData.data[offset + 1] * 0.7152 +
      imageData.data[offset + 2] * 0.0722,
    );
    const coverage = hasTransparentPixels ? alpha : Math.round(alpha * luminance / 255);
    imageData.data[offset] = 255;
    imageData.data[offset + 1] = 255;
    imageData.data[offset + 2] = 255;
    imageData.data[offset + 3] = coverage;
  }
  context.putImageData(imageData, 0, 0);
}

function contentBoxRect(element: HTMLElement, borderRect: DOMRect): CoverRect {
  const style = getComputedStyle(element);
  const scaleX = element.offsetWidth > 0 ? borderRect.width / element.offsetWidth : 1;
  const scaleY = element.offsetHeight > 0 ? borderRect.height / element.offsetHeight : 1;
  const leftInset = (cssPixels(style.borderLeftWidth) + cssPixels(style.paddingLeft)) * scaleX;
  const rightInset = (cssPixels(style.borderRightWidth) + cssPixels(style.paddingRight)) * scaleX;
  const topInset = (cssPixels(style.borderTopWidth) + cssPixels(style.paddingTop)) * scaleY;
  const bottomInset = (cssPixels(style.borderBottomWidth) + cssPixels(style.paddingBottom)) * scaleY;
  return {
    x: borderRect.left + leftInset,
    y: borderRect.top + topInset,
    width: borderRect.width - leftInset - rightInset,
    height: borderRect.height - topInset - bottomInset,
  };
}

function domRectToCoverRect(rect: DOMRect): CoverRect {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameGeometry(left: OverlayGeometry, right: OverlayGeometry): boolean {
  const values = [
    left.width - right.width,
    left.height - right.height,
    left.hostRect.x - right.hostRect.x,
    left.hostRect.y - right.hostRect.y,
    left.previewContentRect.x - right.previewContentRect.x,
    left.previewContentRect.y - right.previewContentRect.y,
    left.previewContentRect.width - right.previewContentRect.width,
    left.previewContentRect.height - right.previewContentRect.height,
    left.sourceWidth - right.sourceWidth,
    left.sourceHeight - right.sourceHeight,
  ];
  return values.every((difference) => Math.abs(difference) < 0.01);
}

function validatePlayback(options: ReconstructionPlayback): void {
  if (!options.maskUrl.trim()) {
    throw new Error('Object reconstruction requires a mask URL.');
  }
  if (!isObjectBounds(options.bounds)) {
    throw new Error('Object reconstruction requires valid normalized bounds.');
  }
  if (options.durationMs !== undefined && !isPositiveFiniteNumber(options.durationMs)) {
    throw new Error('Object reconstruction duration must be a positive finite number.');
  }
}

function isObjectBounds(bounds: ObjectBounds): boolean {
  const { x, y, width, height } = bounds;
  return (
    [x, y, width, height].every((value) => typeof value === 'number' && Number.isFinite(value)) &&
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= 1 &&
    y + height <= 1
  );
}

function validateImageDimensions(image: CanvasImageSource): { height: number; width: number } {
  const sizedImage = image as CanvasImageSource & {
    height?: number;
    naturalHeight?: number;
    naturalWidth?: number;
    width?: number;
  };
  const width = sizedImage.naturalWidth ?? sizedImage.width;
  const height = sizedImage.naturalHeight ?? sizedImage.height;
  if (!isPositiveFiniteNumber(width ?? 0) || !isPositiveFiniteNumber(height ?? 0)) {
    throw new Error('Object reconstruction mask has invalid dimensions.');
  }
  return { height: height as number, width: width as number };
}

function withContextState(context: CanvasRenderingContext2D, draw: () => void): void {
  context.save();
  try {
    draw();
  } finally {
    context.restore();
  }
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function loadCanvasImage(url: string): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      image.onload = null;
      image.onerror = null;
      resolve(image);
    };
    image.onerror = () => {
      image.onload = null;
      image.onerror = null;
      reject(new Error('Could not load the object reconstruction mask.'));
    };
    image.src = url;
  });
}
