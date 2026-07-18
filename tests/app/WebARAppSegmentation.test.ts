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
  discardObjectReconstruction: ReturnType<typeof vi.fn>;
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
  leaveRoute(previousRoute: 'full-flow' | 'dynamic', nextRoute: 'ar'): Promise<void>;
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

function mediaStream(label: string): MediaStream {
  return { label, getTracks: () => [] } as unknown as MediaStream;
}

function deferredCameraStart(stream: MediaStream) {
  const pending = deferred<MediaStream>();
  let preview: HTMLVideoElement | null = null;
  return {
    start: (cameraPreview: HTMLVideoElement) => {
      preview = cameraPreview;
      return pending.promise;
    },
    resolve: () => {
      if (!preview) {
        throw new Error('Camera preview was not provided.');
      }
      preview.srcObject = stream;
      pending.resolve(stream);
    },
  };
}

function prepareCameraPreview(app: TestApp, playResult: 'resolve' | 'reject' = 'resolve') {
  const preview = app.hud.cameraPreviewVideo;
  const play = vi.fn(
    playResult === 'resolve'
      ? () => Promise.resolve()
      : () => Promise.reject(new Error('Autoplay blocked.')),
  );
  Object.defineProperty(preview, 'srcObject', {
    configurable: true,
    value: null,
    writable: true,
  });
  Object.defineProperty(preview, 'play', {
    configurable: true,
    value: play,
  });
  return { play, preview };
}

function createHud(): HudFixture {
  const clearObjectReconstruction = vi.fn();
  return {
    cameraPreviewVideo: document.createElement('video'),
    clearObjectReconstruction,
    discardObjectReconstruction: vi.fn(() => clearObjectReconstruction()),
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

  it('keeps the second capture when two captures resolve in reverse order', async () => {
    const firstCapture = deferred<CapturedImageFixture>();
    const secondCapture = deferred<CapturedImageFixture>();
    const firstImage = capturedImage('first');
    const secondImage = capturedImage('second');
    dependencies.captureVideoFrame
      .mockReturnValueOnce(firstCapture.promise)
      .mockReturnValueOnce(secondCapture.promise);
    const app = createApp();

    const firstOperation = app.captureImage('full-flow');
    const secondOperation = app.captureImage('dynamic');
    secondCapture.resolve(secondImage);
    await secondOperation;
    firstCapture.resolve(firstImage);
    await firstOperation;

    expect(app.capturedImage).toBe(secondImage);
    expect(app.hud.showCapturedImagePreview).toHaveBeenCalledOnce();
    expect(dependencies.prepareSegmentationImage).toHaveBeenCalledOnce();
    expect(dependencies.prepareSegmentationImage.mock.calls[0][0]).toBe(secondImage.blob);
  });

  it('ignores a capture that resolves after transient route reset', async () => {
    const pendingCapture = deferred<CapturedImageFixture>();
    dependencies.captureVideoFrame.mockReturnValueOnce(pendingCapture.promise);
    const app = createApp();

    const captureOperation = app.captureImage('full-flow');
    await app.resetTransientExperience();
    pendingCapture.resolve(capturedImage('stale-after-reset'));
    await captureOperation;

    expect(app.capturedImage).toBeNull();
    expect(app.hud.showCapturedImagePreview).not.toHaveBeenCalled();
    expect(dependencies.prepareSegmentationImage).not.toHaveBeenCalled();
  });

  it('silently ignores a stale capture rejection', async () => {
    const pendingCapture = deferred<CapturedImageFixture>();
    dependencies.captureVideoFrame.mockReturnValueOnce(pendingCapture.promise);
    const app = createApp();

    const captureOperation = app.captureImage('full-flow');
    app.clearCapturedImagePreview();
    pendingCapture.reject(new Error('late camera failure'));
    await captureOperation;

    expect(app.hud.updateCameraStatus).not.toHaveBeenCalledWith(
      expect.stringContaining('late camera failure'),
      expect.anything(),
    );
  });

  it('invalidates a pending capture when live camera restart begins', async () => {
    const pendingCapture = deferred<CapturedImageFixture>();
    dependencies.captureVideoFrame.mockReturnValueOnce(pendingCapture.promise);
    const app = createApp();

    const captureOperation = app.captureImage('full-flow');
    await app.startCamera();
    pendingCapture.resolve(capturedImage('stale-after-restart'));
    await captureOperation;

    expect(app.capturedImage).toBeNull();
    expect(app.hud.showCapturedImagePreview).not.toHaveBeenCalled();
  });

  it('does not let a pending capture overwrite a newer upload', async () => {
    const pendingCapture = deferred<CapturedImageFixture>();
    const uploadedImage = capturedImage('uploaded-newer');
    dependencies.captureVideoFrame.mockReturnValueOnce(pendingCapture.promise);
    dependencies.imageFileToCapturedImage.mockResolvedValueOnce(uploadedImage);
    const app = createApp();

    const captureOperation = app.captureImage('full-flow');
    await app.uploadImage(new File(['upload'], 'newer.png', { type: 'image/png' }));
    pendingCapture.resolve(capturedImage('stale-after-upload'));
    await captureOperation;

    expect(app.capturedImage).toBe(uploadedImage);
    expect(app.hud.showUploadedImagePreview).toHaveBeenCalledOnce();
    expect(app.hud.showCapturedImagePreview).not.toHaveBeenCalled();
  });

  it('does not resurrect a pending capture after generation starts', async () => {
    const pendingCapture = deferred<CapturedImageFixture>();
    dependencies.captureVideoFrame.mockReturnValueOnce(pendingCapture.promise);
    const app = createApp();
    app.capturedImage = capturedImage('generation-input');

    const captureOperation = app.captureImage('full-flow');
    await app.generateModel('chair');
    pendingCapture.resolve(capturedImage('stale-after-generation'));
    await captureOperation;

    expect(app.capturedImage).toBeNull();
    expect(app.hud.showCapturedImagePreview).not.toHaveBeenCalled();
  });

  it('stops a camera stream returned after route reset while permission was pending', async () => {
    const existingStream = mediaStream('existing');
    const staleStream = mediaStream('stale-after-route-reset');
    const pendingStart = deferredCameraStart(staleStream);
    dependencies.startCameraPreview.mockImplementationOnce(pendingStart.start);
    const app = createApp();
    const { play, preview } = prepareCameraPreview(app);
    app.cameraStream = existingStream;

    const startOperation = app.startCamera();
    await app.resetTransientExperience();
    pendingStart.resolve();
    await startOperation;

    expect(dependencies.stopCameraPreview).toHaveBeenCalledWith(staleStream);
    expect(app.cameraStream).toBeNull();
    expect(preview.srcObject).toBeNull();
    expect(play).not.toHaveBeenCalled();
    expect(app.hud.updateCameraStatus).not.toHaveBeenCalledWith(
      expect.stringContaining('Camera ready'),
      expect.anything(),
    );
  });

  it('stops a pending camera-start stream when capture finishes first', async () => {
    const pendingStart = deferred<MediaStream>();
    const staleStream = mediaStream('stale-after-capture');
    const currentCapture = capturedImage('capture-wins');
    dependencies.startCameraPreview.mockReturnValueOnce(pendingStart.promise);
    dependencies.captureVideoFrame.mockResolvedValueOnce(currentCapture);
    const app = createApp();

    const startOperation = app.startCamera();
    await app.captureImage('camera');
    pendingStart.resolve(staleStream);
    await startOperation;

    expect(dependencies.stopCameraPreview).toHaveBeenCalledWith(staleStream);
    expect(app.cameraStream).toBeNull();
    expect(app.capturedImage).toBe(currentCapture);
  });

  it('keeps the newest camera start when two permission requests resolve in reverse order', async () => {
    const existingStream = mediaStream('existing');
    const firstStream = mediaStream('first-stale');
    const secondStream = mediaStream('second-current');
    const firstStart = deferredCameraStart(firstStream);
    const secondStart = deferredCameraStart(secondStream);
    dependencies.startCameraPreview
      .mockImplementationOnce(firstStart.start)
      .mockImplementationOnce(secondStart.start);
    const app = createApp();
    const { play, preview } = prepareCameraPreview(app, 'reject');
    app.cameraStream = existingStream;

    const firstOperation = app.startCamera();
    const secondOperation = app.startCamera();
    secondStart.resolve();
    await secondOperation;
    expect(preview.srcObject).toBe(secondStream);
    firstStart.resolve();
    await firstOperation;

    expect(app.cameraStream).toBe(secondStream);
    expect(preview.srcObject).toBe(secondStream);
    expect(play).toHaveBeenCalledOnce();
    expect(dependencies.stopCameraPreview).toHaveBeenCalledWith(existingStream);
    expect(dependencies.stopCameraPreview.mock.calls.filter(([stream]) => stream === existingStream)).toHaveLength(1);
    expect(dependencies.stopCameraPreview).toHaveBeenCalledWith(firstStream);
    expect(dependencies.stopCameraPreview).not.toHaveBeenCalledWith(secondStream);
    expect(app.hud.updateCameraStatus).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a newer preview attachment while cleaning up a stale camera start', async () => {
    const staleStream = mediaStream('stale');
    const newerAttachment = mediaStream('newer-third-attachment');
    const pendingStart = deferredCameraStart(staleStream);
    dependencies.startCameraPreview.mockImplementationOnce(pendingStart.start);
    const app = createApp();
    const { play, preview } = prepareCameraPreview(app);

    const startOperation = app.startCamera();
    app.clearCapturedImagePreview();
    pendingStart.resolve();
    preview.srcObject = newerAttachment;
    await startOperation;

    expect(dependencies.stopCameraPreview).toHaveBeenCalledWith(staleStream);
    expect(preview.srcObject).toBe(newerAttachment);
    expect(play).not.toHaveBeenCalled();
  });

  it('does not let an upload resolve after reset and resurrect captured media', async () => {
    const pendingUpload = deferred<CapturedImageFixture>();
    dependencies.imageFileToCapturedImage.mockReturnValueOnce(pendingUpload.promise);
    const app = createApp();

    const uploadOperation = app.uploadImage(new File(['upload'], 'chair.png', { type: 'image/png' }));
    await app.resetTransientExperience();
    pendingUpload.resolve(capturedImage('stale-upload'));
    await uploadOperation;

    expect(app.capturedImage).toBeNull();
    expect(app.hud.showUploadedImagePreview).not.toHaveBeenCalled();
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

  it('cleans up a current AbortError without warning or leaving the HUD pending', async () => {
    dependencies.segmentObject.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    const app = createApp();

    await app.captureImage('full-flow');
    await waitForSegmentationRequest();
    await vi.waitFor(() => expect(app.hud.showObjectSegmentationFallback).toHaveBeenCalledOnce());

    expect(app.objectSegmentationController).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps caller-cancelled AbortError cleanup from overwriting the newer capture state', async () => {
    const oldRequest = deferred<never>();
    dependencies.captureVideoFrame
      .mockResolvedValueOnce(capturedImage('first'))
      .mockResolvedValueOnce(capturedImage('second'));
    dependencies.segmentObject
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({ detected: false, confidence: 0.2 });
    const app = createApp();

    await app.captureImage('full-flow');
    await waitForSegmentationRequest();
    await app.captureImage('dynamic');
    await vi.waitFor(() => expect(app.hud.showObjectSegmentationFallback).toHaveBeenCalledOnce());
    const fallbackCalls = app.hud.showObjectSegmentationFallback.mock.calls.length;
    const clearCalls = app.hud.clearObjectReconstruction.mock.calls.length;

    oldRequest.reject(new DOMException('Aborted', 'AbortError'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(app.hud.showObjectSegmentationFallback).toHaveBeenCalledTimes(fallbackCalls);
    expect(app.hud.clearObjectReconstruction).toHaveBeenCalledTimes(clearCalls);
    expect(app.capturedImage?.imageBase64).toBe('second-generation-base64');
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
    'preserves pending segmentation while generating %s from the original capture rather than its compressed copy',
    async (route, method, generationPipeline) => {
      const segmentationRequest = deferred<{
        detected: true;
        confidence: number;
        maskBase64: string;
        maskMimeType: 'image/png';
        bounds: { x: number; y: number; width: number; height: number };
      }>();
      const generationRequest = deferred<{ modelUrl: string }>();
      dependencies.segmentObject.mockReturnValueOnce(segmentationRequest.promise);
      dependencies.generateModelFromImage.mockReturnValueOnce(generationRequest.promise);
      const original = capturedImage(route);
      dependencies.captureVideoFrame.mockResolvedValueOnce(original);
      const app = createApp();

      await app.captureImage(route);
      await waitForSegmentationRequest();
      const signal = dependencies.segmentObject.mock.calls[0][0].signal as AbortSignal;
      const generation = app[method]('chair');
      await vi.waitFor(() => expect(dependencies.generateModelFromImage).toHaveBeenCalledOnce());
      await app.leaveRoute(route, 'ar');

      expect(signal.aborted).toBe(false);
      expect(app.hud.clearObjectReconstruction).toHaveBeenCalled();
      expect(dependencies.generateModelFromImage).toHaveBeenCalledWith(expect.objectContaining({
        imageBase64: original.imageBase64,
        imageMimeType: original.imageMimeType,
        generationPipeline,
      }));
      expect(dependencies.generateModelFromImage).not.toHaveBeenCalledWith(expect.objectContaining({
        imageBase64: preparedImage.imageBase64,
      }));
      segmentationRequest.resolve({
        detected: true,
        confidence: 0.9,
        maskBase64: 'late-generation-mask',
        maskMimeType: 'image/png',
        bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      });
      await vi.waitFor(() => expect(app.hud.playObjectReconstruction).toHaveBeenCalledWith(
        'data:image/png;base64,late-generation-mask',
        { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      ));
      expect(dependencies.segmentObject).toHaveBeenCalledOnce();

      generationRequest.resolve({ modelUrl: 'https://assets.example/generated.glb' });
      await generation;
    },
  );

  it.each([
    ['full-flow', 'runFullFlow'],
    ['dynamic', 'runDynamicFlow'],
  ] as const)(
    'ignores stale %s generation without cancelling segmentation for a newer capture',
    async (route, method) => {
      const oldSegmentationRequest = deferred<{ detected: false; confidence: number }>();
      const newSegmentationRequest = deferred<{ detected: false; confidence: number }>();
      const generationRequest = deferred<{ modelUrl: string }>();
      dependencies.segmentObject
        .mockReturnValueOnce(oldSegmentationRequest.promise)
        .mockReturnValueOnce(newSegmentationRequest.promise);
      dependencies.generateModelFromImage.mockReturnValueOnce(generationRequest.promise);
      dependencies.captureVideoFrame
        .mockResolvedValueOnce(capturedImage('old'))
        .mockResolvedValueOnce(capturedImage('new'));
      const app = createApp();

      await app.captureImage(route);
      await vi.waitFor(() => expect(dependencies.segmentObject).toHaveBeenCalledTimes(1));
      const generation = app[method]('chair');
      await vi.waitFor(() => expect(dependencies.generateModelFromImage).toHaveBeenCalledOnce());

      await app.resetTransientExperience();
      await app.captureImage(route);
      await vi.waitFor(() => expect(dependencies.segmentObject).toHaveBeenCalledTimes(2));
      const newSignal = dependencies.segmentObject.mock.calls[1][0].signal as AbortSignal;

      generationRequest.resolve({ modelUrl: 'https://assets.example/stale.glb' });
      await generation;

      expect(app.loadModelFromUrl).not.toHaveBeenCalled();
      expect(app.hud.showFullFlowReady).not.toHaveBeenCalled();
      expect(newSignal.aborted).toBe(false);

      oldSegmentationRequest.resolve({ detected: false, confidence: 0.2 });
      newSegmentationRequest.resolve({ detected: false, confidence: 0.2 });
    },
  );
});
