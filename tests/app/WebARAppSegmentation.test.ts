import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  captureVideoFrame: vi.fn(),
  extractImageFor3D: vi.fn(),
  generateModelFromImage: vi.fn(),
  imageFileToCapturedImage: vi.fn(),
  listGeneratedModels: vi.fn(),
  prepareSegmentationImage: vi.fn(),
  segmentObject: vi.fn(),
  startCameraPreview: vi.fn(),
  startGeneratedModelJob: vi.fn(),
  startSpeechModelJob: vi.fn(),
  startTextModelJob: vi.fn(),
  stopCameraPreview: vi.fn(),
}));

const hudConstructor = vi.hoisted(() => ({
  handlers: null as Record<string, (...args: unknown[]) => unknown> | null,
}));

vi.mock('../../src/capture/cameraCapture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/capture/cameraCapture')>()),
  captureVideoFrame: dependencies.captureVideoFrame,
  imageFileToCapturedImage: dependencies.imageFileToCapturedImage,
  startCameraPreview: dependencies.startCameraPreview,
  stopCameraPreview: dependencies.stopCameraPreview,
}));

vi.mock('../../src/capture/segmentationImage', () => ({
  prepareSegmentationImage: dependencies.prepareSegmentationImage,
}));

vi.mock('../../src/services/objectSegmentationClient', () => ({
  OBJECT_SEGMENTATION_CONFIDENCE_THRESHOLD: 0.65,
  segmentObject: dependencies.segmentObject,
}));

vi.mock('../../src/services/generatedModelClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/generatedModelClient')>()),
  extractImageFor3D: dependencies.extractImageFor3D,
  generateModelFromImage: dependencies.generateModelFromImage,
  listGeneratedModels: dependencies.listGeneratedModels,
  startGeneratedModelJob: dependencies.startGeneratedModelJob,
  startSpeechModelJob: dependencies.startSpeechModelJob,
  startTextModelJob: dependencies.startTextModelJob,
}));

vi.mock('../../src/ui/ARHud', () => ({
  ARHud: class {
    readonly cameraPreviewVideo = document.createElement('video');
    readonly clearObjectReconstruction = vi.fn();
    readonly updateAuthState = vi.fn();
    readonly updateGeneratedModels = vi.fn();
    readonly updateModelSource = vi.fn();

    constructor(
      _root: HTMLElement,
      _models: unknown,
      handlers: Record<string, (...args: unknown[]) => unknown>,
    ) {
      hudConstructor.handlers = handlers;
    }
  },
}));

import { WebARApp } from '../../src/app/WebARApp';

interface CapturedImageFixture {
  blob: Blob;
  imageBase64: string;
  imageMimeType: string;
}

interface HudFixture {
  cameraPreviewVideo: HTMLVideoElement;
  clearObjectReconstruction: ReturnType<typeof vi.fn>;
  hideModelPreview: ReturnType<typeof vi.fn>;
  playObjectReconstruction: ReturnType<typeof vi.fn>;
  showCapturedImagePreview: ReturnType<typeof vi.fn>;
  showExtractedImageReady: ReturnType<typeof vi.fn>;
  showFullFlowError: ReturnType<typeof vi.fn>;
  showFullFlowLoading: ReturnType<typeof vi.fn>;
  showFullFlowReady: ReturnType<typeof vi.fn>;
  showObjectSegmentationFallback: ReturnType<typeof vi.fn>;
  showObjectSegmentationPending: ReturnType<typeof vi.fn>;
  showSpeechBackgroundJob: ReturnType<typeof vi.fn>;
  showSpeechDetecting: ReturnType<typeof vi.fn>;
  showSpeechError: ReturnType<typeof vi.fn>;
  showUploadedImagePreview: ReturnType<typeof vi.fn>;
  updateCameraStatus: ReturnType<typeof vi.fn>;
  updateGeneratedModelSource: ReturnType<typeof vi.fn>;
}

interface TestApp {
  authToken: string | null;
  cameraStream: MediaStream | null;
  capturedImage: CapturedImageFixture | null;
  capturedImageGenerationPipeline: string;
  capturedImagePreviewUrl: string | null;
  captureImage(route: 'camera' | 'full-flow' | 'dynamic'): Promise<void>;
  clearCapturedImagePreview(): void;
  generateModel(targetObject: string): Promise<void>;
  generateSpeechModel(): Promise<void>;
  generateTextModel(text: string): Promise<void>;
  hud: HudFixture;
  loadModelFromUrl: ReturnType<typeof vi.fn>;
  objectSegmentationController: AbortController | null;
  resetTransientExperience(): Promise<void>;
  runDynamicFlow(targetObject: string): Promise<void>;
  runFullFlow(targetObject: string): Promise<void>;
  startCamera(): Promise<void>;
  speechAudio: { audioBase64: string; audioMimeType: string } | null;
  submitCapturedImageToGpt(targetObject: string): Promise<void>;
  uploadImage(file: File): Promise<void>;
  watchSpeechGenerationJob: ReturnType<typeof vi.fn>;
}

const preparedImage = {
  imageBase64: 'compressed-segmentation-copy',
  imageMimeType: 'image/webp',
  width: 1024,
  height: 576,
  bytes: 32,
};

function capturedImage(label = 'original'): CapturedImageFixture {
  return {
    imageBase64: `${label}-generation-base64`,
    imageMimeType: 'image/png',
    blob: new Blob([`${label}-blob-bytes`], { type: 'image/png' }),
  };
}

function createHud(): HudFixture {
  return {
    cameraPreviewVideo: document.createElement('video'),
    clearObjectReconstruction: vi.fn(),
    hideModelPreview: vi.fn(),
    playObjectReconstruction: vi.fn().mockResolvedValue(undefined),
    showCapturedImagePreview: vi.fn(),
    showExtractedImageReady: vi.fn(),
    showFullFlowError: vi.fn(),
    showFullFlowLoading: vi.fn(),
    showFullFlowReady: vi.fn(),
    showObjectSegmentationFallback: vi.fn(),
    showObjectSegmentationPending: vi.fn(),
    showSpeechBackgroundJob: vi.fn(),
    showSpeechDetecting: vi.fn(),
    showSpeechError: vi.fn(),
    showUploadedImagePreview: vi.fn(),
    updateCameraStatus: vi.fn(),
    updateGeneratedModelSource: vi.fn(),
  };
}

function createApp(): TestApp {
  const app = new WebARApp(document.createElement('div')) as unknown as TestApp;
  app.authToken = 'current-auth-token';
  app.cameraStream = null;
  app.capturedImagePreviewUrl = null;
  app.hud = createHud();
  app.loadModelFromUrl = vi.fn().mockResolvedValue(undefined);
  app.watchSpeechGenerationJob = vi.fn();
  return app;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

async function waitForSegmentationRequest(): Promise<void> {
  await vi.waitFor(() => expect(dependencies.segmentObject).toHaveBeenCalled());
}

describe('WebARApp object segmentation orchestration', () => {
  const NativeURL = URL;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_OBJECT_SEGMENTATION_ENABLED', 'true');
    vi.stubEnv('VITE_GENERATE_MODEL_API_URL', 'https://worker.example/generate-3d');
    hudConstructor.handlers = null;
    createObjectURL = vi.fn(() => `blob:preview-${createObjectURL.mock.calls.length}`);
    revokeObjectURL = vi.fn();
    class TestURL extends NativeURL {}
    Object.defineProperties(TestURL, {
      createObjectURL: { value: createObjectURL },
      revokeObjectURL: { value: revokeObjectURL },
    });
    vi.stubGlobal('URL', TestURL);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    appPlaybackFailure = null;

    dependencies.captureVideoFrame.mockResolvedValue(capturedImage());
    dependencies.extractImageFor3D.mockResolvedValue({
      imageBase64: 'extracted-generation-base64',
      imageMimeType: 'image/png',
    });
    dependencies.generateModelFromImage.mockResolvedValue({
      modelUrl: 'https://assets.example/generated.glb',
    });
    dependencies.imageFileToCapturedImage.mockResolvedValue(capturedImage('uploaded'));
    dependencies.listGeneratedModels.mockResolvedValue([]);
    dependencies.prepareSegmentationImage.mockResolvedValue(preparedImage);
    dependencies.segmentObject.mockResolvedValue({ detected: false, confidence: 0.2 });
    dependencies.startCameraPreview.mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream);
    dependencies.startGeneratedModelJob.mockResolvedValue({ id: 'job-1', label: 'Original object' });
    dependencies.startSpeechModelJob.mockResolvedValue({ id: 'speech-job', label: 'Spoken object' });
    dependencies.startTextModelJob.mockResolvedValue({ id: 'text-job', label: 'Text object' });
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('wires the HUD capture route into route-aware capture', async () => {
    const app = new WebARApp(document.createElement('div')) as unknown as {
      captureImage: ReturnType<typeof vi.fn>;
      start(): Promise<void>;
    };
    app.captureImage = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'setInterval').mockReturnValue({} as ReturnType<typeof setInterval>);

    await app.start();
    hudConstructor.handlers?.onCaptureImage('dynamic');

    expect(app.captureImage).toHaveBeenCalledWith('dynamic');
  });

  it.each(['full-flow', 'dynamic'] as const)(
    'starts segmentation automatically after a %s capture without blocking capture completion',
    async (route) => {
      const request = deferred<{ detected: false; confidence: number }>();
      dependencies.segmentObject.mockReturnValueOnce(request.promise);
      const original = capturedImage(route);
      dependencies.captureVideoFrame.mockResolvedValueOnce(original);
      const app = createApp();

      await app.captureImage(route);
      await waitForSegmentationRequest();

      expect(app.capturedImage).toBe(original);
      expect(app.hud.showCapturedImagePreview).toHaveBeenCalledOnce();
      expect(app.hud.showObjectSegmentationPending).toHaveBeenCalledOnce();
      expect(dependencies.prepareSegmentationImage).toHaveBeenCalledWith(original.blob);
      request.resolve({ detected: false, confidence: 0.2 });
    },
  );

  it.each([
    ['plain camera', 'camera', 'true'],
    ['disabled full flow', 'full-flow', 'false'],
    ['non-exact flag', 'dynamic', 'TRUE'],
  ] as const)('does no segmentation work for %s', async (_name, route, flag) => {
    vi.stubEnv('VITE_OBJECT_SEGMENTATION_ENABLED', flag);
    const app = createApp();

    await app.captureImage(route);
    await Promise.resolve();

    expect(dependencies.prepareSegmentationImage).not.toHaveBeenCalled();
    expect(dependencies.segmentObject).not.toHaveBeenCalled();
    expect(app.hud.showObjectSegmentationPending).not.toHaveBeenCalled();
  });

  it('requests segmentation with the compressed payload, Worker URL, current auth, and abort signal', async () => {
    const app = createApp();
    const original = capturedImage();
    dependencies.captureVideoFrame.mockResolvedValueOnce(original);

    await app.captureImage('full-flow');
    await waitForSegmentationRequest();

    expect(dependencies.prepareSegmentationImage).toHaveBeenCalledWith(original.blob);
    expect(dependencies.segmentObject).toHaveBeenCalledWith({
      apiUrl: 'https://worker.example/generate-3d',
      imageBase64: preparedImage.imageBase64,
      imageMimeType: preparedImage.imageMimeType,
      authToken: 'current-auth-token',
      signal: expect.any(AbortSignal),
    });
    expect(app.capturedImage).toBe(original);
    expect(original.imageBase64).toBe('original-generation-base64');
  });

  it('plays a detected high-confidence PNG mask as a data URL', async () => {
    dependencies.segmentObject.mockResolvedValueOnce({
      detected: true,
      confidence: 0.91,
      maskBase64: 'returned-mask-base64',
      maskMimeType: 'image/png',
      bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
    });
    const app = createApp();

    await app.captureImage('dynamic');
    await vi.waitFor(() => expect(app.hud.playObjectReconstruction).toHaveBeenCalled());

    expect(app.hud.playObjectReconstruction).toHaveBeenCalledWith(
      'data:image/png;base64,returned-mask-base64',
      { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
    );
    expect(app.hud.showObjectSegmentationFallback).not.toHaveBeenCalled();
  });

  it.each([
    ['no object', 'result', { detected: false, confidence: 0.2 }],
    ['defensive low confidence', 'result', {
      detected: true,
      confidence: 0.64,
      maskBase64: 'low-confidence-mask',
      maskMimeType: 'image/png',
      bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
    }],
    ['compression failure', 'compression', new Error('compress failed')],
    ['request failure', 'request', new Error('request failed')],
    ['playback failure', 'playback', new Error('playback failed')],
  ] as const)('falls back while retaining the original capture on %s', async (_name, stage, outcome) => {
    if (stage === 'compression') {
      dependencies.prepareSegmentationImage.mockRejectedValueOnce(outcome);
    } else if (stage === 'request') {
      dependencies.segmentObject.mockRejectedValueOnce(outcome);
    } else if (stage === 'playback') {
      dependencies.segmentObject.mockResolvedValueOnce({
        detected: true,
        confidence: 0.9,
        maskBase64: 'mask',
        maskMimeType: 'image/png',
        bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      });
      appPlaybackFailure = outcome as Error;
    } else {
      dependencies.segmentObject.mockResolvedValueOnce(outcome);
    }
    const original = capturedImage();
    dependencies.captureVideoFrame.mockResolvedValueOnce(original);
    const app = createApp();
    if (appPlaybackFailure) {
      app.hud.playObjectReconstruction.mockRejectedValueOnce(appPlaybackFailure);
    }

    await app.captureImage('full-flow');
    await vi.waitFor(() => expect(app.hud.showObjectSegmentationFallback).toHaveBeenCalledOnce());

    expect(app.capturedImage).toBe(original);
    expect(original.imageBase64).toBe('original-generation-base64');
    expect(app.hud.playObjectReconstruction).not.toHaveBeenCalledWith(
      expect.stringContaining('low-confidence-mask'),
      expect.anything(),
    );
  });

  let appPlaybackFailure: Error | null = null;

  it('logs one sanitized warning for a current non-abort failure', async () => {
    dependencies.segmentObject.mockRejectedValueOnce(
      new Error('original-generation-base64 returned-mask-base64 bearer-secret'),
    );
    const app = createApp();

    await app.captureImage('full-flow');
    await vi.waitFor(() => expect(app.hud.showObjectSegmentationFallback).toHaveBeenCalledOnce());

    expect(warn).toHaveBeenCalledOnce();
    const warningText = warn.mock.calls.flat().join(' ');
    expect(warningText).not.toContain('original-generation-base64');
    expect(warningText).not.toContain('returned-mask-base64');
    expect(warningText).not.toContain('bearer-secret');
  });

  it('treats AbortError as silent cancellation', async () => {
    dependencies.segmentObject.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    const app = createApp();

    await app.captureImage('full-flow');
    await waitForSegmentationRequest();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(app.hud.showObjectSegmentationFallback).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('aborts the first request and ignores its late result after a second capture', async () => {
    const oldRequest = deferred<{
      detected: true;
      confidence: number;
      maskBase64: string;
      maskMimeType: 'image/png';
      bounds: { x: number; y: number; width: number; height: number };
    }>();
    dependencies.captureVideoFrame
      .mockResolvedValueOnce(capturedImage('first'))
      .mockResolvedValueOnce(capturedImage('second'));
    dependencies.segmentObject
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({ detected: false, confidence: 0.2 });
    const app = createApp();

    await app.captureImage('full-flow');
    await waitForSegmentationRequest();
    const oldSignal = dependencies.segmentObject.mock.calls[0][0].signal as AbortSignal;

    await app.captureImage('dynamic');
    await vi.waitFor(() => expect(app.hud.showObjectSegmentationFallback).toHaveBeenCalledOnce());
    expect(oldSignal.aborted).toBe(true);

    oldRequest.resolve({
      detected: true,
      confidence: 0.95,
      maskBase64: 'stale-mask',
      maskMimeType: 'image/png',
      bounds: { x: 0, y: 0, width: 0.5, height: 0.5 },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(app.hud.playObjectReconstruction).not.toHaveBeenCalled();
    expect(app.hud.showObjectSegmentationFallback).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not send a stale compressed image after replacement finishes first', async () => {
    const oldCompression = deferred<typeof preparedImage>();
    dependencies.captureVideoFrame
      .mockResolvedValueOnce(capturedImage('first'))
      .mockResolvedValueOnce(capturedImage('second'));
    dependencies.prepareSegmentationImage
      .mockReturnValueOnce(oldCompression.promise)
      .mockResolvedValueOnce({ ...preparedImage, imageBase64: 'second-compressed-copy' });
    const app = createApp();

    await app.captureImage('full-flow');
    await vi.waitFor(() => expect(dependencies.prepareSegmentationImage).toHaveBeenCalledOnce());
    await app.captureImage('dynamic');
    await waitForSegmentationRequest();

    oldCompression.resolve({ ...preparedImage, imageBase64: 'stale-compressed-copy' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dependencies.segmentObject).toHaveBeenCalledOnce();
    expect(dependencies.segmentObject.mock.calls[0][0].imageBase64).toBe('second-compressed-copy');
  });

  it('cancels pending work and clears the HUD on live restart, extraction, preview clear, and route reset', async () => {
    const actions = [
      async (app: TestApp) => app.startCamera(),
      async (app: TestApp) => app.submitCapturedImageToGpt('chair'),
      async (app: TestApp) => app.clearCapturedImagePreview(),
      async (app: TestApp) => app.resetTransientExperience(),
    ];

    for (const action of actions) {
      const app = createApp();
      const controller = new AbortController();
      app.objectSegmentationController = controller;
      app.capturedImage = capturedImage();
      app.capturedImagePreviewUrl = 'blob:existing-preview';

      await action(app);

      expect(controller.signal.aborted).toBe(true);
      expect(app.hud.clearObjectReconstruction).toHaveBeenCalled();
    }
  });

  it('cancels pending work when an upload replaces the capture', async () => {
    const app = createApp();
    const controller = new AbortController();
    app.objectSegmentationController = controller;

    await app.uploadImage(new File(['upload'], 'chair.png', { type: 'image/png' }));

    expect(controller.signal.aborted).toBe(true);
    expect(app.hud.clearObjectReconstruction).toHaveBeenCalled();
    expect(app.capturedImage?.imageBase64).toBe('uploaded-generation-base64');
  });

  it('cancels pending work when background image generation starts', async () => {
    const app = createApp();
    const controller = new AbortController();
    const original = capturedImage();
    app.objectSegmentationController = controller;
    app.capturedImage = original;

    await app.generateModel('chair');

    expect(controller.signal.aborted).toBe(true);
    expect(app.hud.clearObjectReconstruction).toHaveBeenCalled();
    expect(dependencies.startGeneratedModelJob).toHaveBeenCalledWith(expect.objectContaining({
      imageBase64: original.imageBase64,
      imageMimeType: original.imageMimeType,
    }));
  });

  it.each(['speech', 'text'] as const)('cancels pending work when %s generation starts', async (kind) => {
    const app = createApp();
    const controller = new AbortController();
    app.objectSegmentationController = controller;
    app.speechAudio = {
      audioBase64: 'recorded-audio',
      audioMimeType: 'audio/webm',
    };

    if (kind === 'speech') {
      await app.generateSpeechModel();
    } else {
      await app.generateTextModel('a chair');
    }

    expect(controller.signal.aborted).toBe(true);
    expect(app.hud.clearObjectReconstruction).toHaveBeenCalled();
  });

  it.each([
    ['full-flow', 'runFullFlow', 'openai-to-3d'],
    ['dynamic', 'runDynamicFlow', 'dynamic'],
  ] as const)(
    'cancels segmentation and generates %s from the original capture rather than its compressed copy',
    async (route, method, generationPipeline) => {
      const segmentationRequest = deferred<{ detected: false; confidence: number }>();
      dependencies.segmentObject.mockReturnValueOnce(segmentationRequest.promise);
      const original = capturedImage(route);
      dependencies.captureVideoFrame.mockResolvedValueOnce(original);
      const app = createApp();

      await app.captureImage(route);
      await waitForSegmentationRequest();
      const signal = dependencies.segmentObject.mock.calls[0][0].signal as AbortSignal;
      await app[method]('chair');

      expect(signal.aborted).toBe(true);
      expect(app.hud.clearObjectReconstruction).toHaveBeenCalled();
      expect(dependencies.generateModelFromImage).toHaveBeenCalledWith(expect.objectContaining({
        imageBase64: original.imageBase64,
        imageMimeType: original.imageMimeType,
        generationPipeline,
      }));
      expect(dependencies.generateModelFromImage).not.toHaveBeenCalledWith(expect.objectContaining({
        imageBase64: preparedImage.imageBase64,
      }));
    },
  );
});
