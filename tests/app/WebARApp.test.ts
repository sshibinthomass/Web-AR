import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WebARApp } from '../../src/app/WebARApp';

vi.mock('../../src/scene/loadModel', () => ({
  loadGLBModel: vi.fn(),
}));

import { loadGLBModel } from '../../src/scene/loadModel';

describe('WebARApp route cleanup', () => {
  it('resets transient experience state only when leaving a transient route', async () => {
    const app = new WebARApp(document.createElement('div')) as unknown as {
      resetTransientExperience: ReturnType<typeof vi.fn>;
      leaveRoute(previousRoute: string, nextRoute: string): Promise<void>;
    };
    app.resetTransientExperience = vi.fn().mockResolvedValue(undefined);

    await app.leaveRoute('models', 'home');
    expect(app.resetTransientExperience).not.toHaveBeenCalled();

    await app.leaveRoute('camera', 'upload');
    expect(app.resetTransientExperience).toHaveBeenCalledOnce();
  });

  it('aborts object segmentation and clears reconstruction during a transient reset', async () => {
    const controller = new AbortController();
    const clearObjectReconstruction = vi.fn();
    const discardObjectReconstruction = vi.fn();
    const app = new WebARApp(document.createElement('div')) as unknown as {
      capturedImagePreviewUrl: string | null;
      hud: {
        clearObjectReconstruction: ReturnType<typeof vi.fn>;
        discardObjectReconstruction: ReturnType<typeof vi.fn>;
        hideModelPreview: ReturnType<typeof vi.fn>;
      };
      objectSegmentationController: AbortController | null;
      resetTransientExperience(): Promise<void>;
    };
    app.capturedImagePreviewUrl = null;
    app.hud = { clearObjectReconstruction, discardObjectReconstruction, hideModelPreview: vi.fn() };
    app.objectSegmentationController = controller;

    await app.resetTransientExperience();

    expect(controller.signal.aborted).toBe(true);
    expect(clearObjectReconstruction).toHaveBeenCalled();
    expect(discardObjectReconstruction).toHaveBeenCalledOnce();
  });
});

describe('WebARApp layout reset', () => {
  it('resets the selected layout object when no fresh hit-test pose exists', () => {
    const app = new WebARApp(document.createElement('div')) as unknown as {
      anchorManager: { deleteFor: ReturnType<typeof vi.fn> };
      appState: { mode: string; setMode(mode: 'editing' | 'placed'): void };
      hitTestManager: { latestPoseMatrix: null } | null;
      hud: { update: ReturnType<typeof vi.fn> };
      layoutMode: boolean;
      layoutSceneManager: {
        placeSelectedAt: ReturnType<typeof vi.fn>;
        resetSelectedTransform: ReturnType<typeof vi.fn>;
        selectedGroup: ReturnType<typeof vi.fn>;
      };
      motionController: { cancel: ReturnType<typeof vi.fn> };
      pendingReanchorTarget: THREE.Group | null;
      resetObject(): void;
    };
    const placeSelectedAt = vi.fn();
    const resetSelectedTransform = vi.fn(() => true);
    const update = vi.fn();
    const target = new THREE.Group();

    app.anchorManager = { deleteFor: vi.fn() };
    app.layoutMode = true;
    app.hitTestManager = { latestPoseMatrix: null };
    app.layoutSceneManager = { placeSelectedAt, resetSelectedTransform, selectedGroup: vi.fn(() => target) };
    app.motionController = { cancel: vi.fn() };
    app.pendingReanchorTarget = null;
    app.hud = { update };
    app.appState.setMode('editing');

    app.resetObject();

    expect(resetSelectedTransform).toHaveBeenCalledOnce();
    expect(placeSelectedAt).not.toHaveBeenCalled();
    expect(app.appState.mode).toBe('placed');
    expect(update).toHaveBeenCalledWith('placed');
    expect(app.anchorManager.deleteFor).toHaveBeenCalledWith(target);
    expect(app.motionController.cancel).toHaveBeenCalledWith(target);
    expect(app.pendingReanchorTarget).toBe(target);
  });
});

describe('WebARApp stable placement', () => {
  it('does not place an object from an unstable hit pose', () => {
    const app = new WebARApp(document.createElement('div')) as unknown as {
      appState: { modelLoaded: boolean; setMode(mode: 'scanning'): void };
      hitTestManager: {
        isStable: boolean;
        latestPoseMatrix: THREE.Matrix4;
      };
      layoutMode: boolean;
      sceneContext: { contactShadow: { visible: boolean } };
      transformController: { placeAt: ReturnType<typeof vi.fn> };
      placeAtLatestHit(): void;
    };
    app.appState.modelLoaded = true;
    app.appState.setMode('scanning');
    app.hitTestManager = {
      isStable: false,
      latestPoseMatrix: new THREE.Matrix4(),
    };
    app.layoutMode = false;
    app.sceneContext = { contactShadow: { visible: false } };
    app.transformController = { placeAt: vi.fn() };

    app.placeAtLatestHit();

    expect(app.transformController.placeAt).not.toHaveBeenCalled();
  });

  it('returns readiness to scanning when a stable hit is lost', () => {
    const app = new WebARApp(document.createElement('div')) as unknown as {
      appState: { mode: string; setMode(mode: 'scanning' | 'readyToPlace'): void };
      syncPlacementReadiness(hasStableHit: boolean): void;
    };
    app.appState.setMode('readyToPlace');

    app.syncPlacementReadiness(false);

    expect(app.appState.mode).toBe('scanning');
  });
});

describe('WebARApp anchored edits', () => {
  it('detaches and schedules a replacement anchor before rotating', () => {
    const target = new THREE.Group();
    const app = new WebARApp(document.createElement('div')) as unknown as {
      anchorManager: { deleteFor: ReturnType<typeof vi.fn> };
      appState: { setMode(mode: 'placed'): void };
      hud: { update: ReturnType<typeof vi.fn> };
      layoutMode: boolean;
      motionController: { cancel: ReturnType<typeof vi.fn> };
      pendingReanchorTarget: THREE.Group | null;
      sceneContext: { modelRoot: THREE.Group };
      transformController: { rotateBy: ReturnType<typeof vi.fn> };
      rotateBy(deltaRadians: number): void;
    };
    app.anchorManager = { deleteFor: vi.fn() };
    app.appState.setMode('placed');
    app.hud = { update: vi.fn() };
    app.layoutMode = false;
    app.motionController = { cancel: vi.fn() };
    app.pendingReanchorTarget = null;
    app.sceneContext = { modelRoot: target };
    app.transformController = { rotateBy: vi.fn() };

    app.rotateBy(0.25);

    expect(app.anchorManager.deleteFor).toHaveBeenCalledWith(target);
    expect(app.motionController.cancel).toHaveBeenCalledWith(target);
    expect(app.transformController.rotateBy).toHaveBeenCalledWith(0.25);
    expect(app.pendingReanchorTarget).toBe(target);
  });
});

describe('WebARApp multi-object access', () => {
  it('starts a multi-object session without requiring a guest to sign in', async () => {
    const app = new WebARApp(document.createElement('div')) as unknown as {
      appState: { mode: string; modelLoaded: boolean };
      authToken: string | null;
      ensureARRuntime: ReturnType<typeof vi.fn>;
      hud: {
        showAuthMessage: ReturnType<typeof vi.fn>;
        updateModelReady: ReturnType<typeof vi.fn>;
        showMultiObjectEditor: ReturnType<typeof vi.fn>;
        showMultiObjectMessage: ReturnType<typeof vi.fn>;
      };
      layoutMode: boolean;
      layoutSceneManager: {
        clear: ReturnType<typeof vi.fn>;
      };
      startMultiObjectSession(): Promise<void>;
    };

    app.authToken = null;
    app.ensureARRuntime = vi.fn(async () => ({}));
    app.layoutSceneManager = { clear: vi.fn() };
    app.hud = {
      showAuthMessage: vi.fn(),
      updateModelReady: vi.fn(),
      showMultiObjectEditor: vi.fn(),
      showMultiObjectMessage: vi.fn(),
    };
    window.history.replaceState(null, '', '/');

    await app.startMultiObjectSession();

    expect(app.hud.showAuthMessage).not.toHaveBeenCalled();
    expect(window.location.hash).not.toBe('#/login');
    expect(app.ensureARRuntime).toHaveBeenCalledOnce();
    expect(app.layoutMode).toBe(true);
    expect(app.layoutSceneManager.clear).toHaveBeenCalledOnce();
    expect(app.appState.modelLoaded).toBe(false);
    expect(app.appState.mode).toBe('scanning');
    expect(app.hud.updateModelReady).toHaveBeenCalledWith(false);
    expect(app.hud.showMultiObjectEditor).toHaveBeenCalledOnce();
    expect(app.hud.showMultiObjectMessage).toHaveBeenCalledWith(
      'This session starts empty each time. Choose a model, tap Place, then add more objects.',
    );
  });
});

describe('WebARApp animated GLB playback', () => {
  function createAnimatedApp() {
    const modelRoot = new THREE.Group();
    const renderer = {
      xr: {
        getSession: vi.fn(() => null),
        getReferenceSpace: vi.fn(() => null),
      },
      render: vi.fn(),
    };
    const app = new WebARApp(document.createElement('div')) as unknown as {
      arRuntime: { THREE: typeof THREE };
      appState: { mode: string; setMode(mode: 'placed'): void; modelLoaded: boolean };
      clock: { getDelta: ReturnType<typeof vi.fn> };
      ensureARRuntime: ReturnType<typeof vi.fn>;
      hitTestManager: null;
      hud: {
        isModelDownloaded: ReturnType<typeof vi.fn>;
        markModelDownloadFailed: ReturnType<typeof vi.fn>;
        markModelDownloaded: ReturnType<typeof vi.fn>;
        markModelDownloadStarted: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        updateAnimationOptions: ReturnType<typeof vi.fn>;
        updateModelReady: ReturnType<typeof vi.fn>;
        updateModelSource: ReturnType<typeof vi.fn>;
        updateSelectedAnimation: ReturnType<typeof vi.fn>;
        updateSelectedModel: ReturnType<typeof vi.fn>;
      };
      lastHudMode: string;
      layoutMode: boolean;
      sceneContext: {
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        modelRoot: THREE.Group;
        renderer: typeof renderer;
      };
      transformController: {
        setTarget: ReturnType<typeof vi.fn>;
      };
      loadModelFromUrl(
        modelUrl: string,
        label: string,
        options: {
          loadingMessage: string;
          successMessage: string;
          sourceMessage: string;
          selectedModelId?: string;
          isCurrent?: () => boolean;
        },
      ): Promise<void>;
      render(time: number): void;
      selectModelAnimation(animationIndex: number): void;
    };

    app.arRuntime = { THREE };
    app.appState.setMode('placed');
    app.lastHudMode = 'placed';
    app.clock = { getDelta: vi.fn(() => 0.25) };
    app.ensureARRuntime = vi.fn(async () => app.arRuntime);
    app.hitTestManager = null;
    app.hud = {
      isModelDownloaded: vi.fn(() => false),
      markModelDownloadFailed: vi.fn(),
      markModelDownloaded: vi.fn(),
      markModelDownloadStarted: vi.fn(),
      update: vi.fn(),
      updateAnimationOptions: vi.fn(),
      updateModelReady: vi.fn(),
      updateModelSource: vi.fn(),
      updateSelectedAnimation: vi.fn(),
      updateSelectedModel: vi.fn(),
    };
    app.layoutMode = false;
    app.sceneContext = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      modelRoot,
      renderer,
    };
    app.transformController = { setTarget: vi.fn() };

    return { app, renderer };
  }

  it('plays loaded GLB animations and advances them in the render loop', async () => {
    const animatedModel = new THREE.Group();
    const clip = new THREE.AnimationClip('mixamo.com', 1, []);
    animatedModel.userData.animations = [clip];
    vi.mocked(loadGLBModel).mockResolvedValue(animatedModel);

    const updateSpy = vi.spyOn(THREE.AnimationMixer.prototype, 'update');
    const { app, renderer } = createAnimatedApp();

    await app.loadModelFromUrl('https://assets.example/animated.glb', 'Animated model', {
      loadingMessage: 'Loading animated model...',
      successMessage: 'Animated model loaded.',
      sourceMessage: 'Uploaded GLB',
    });
    app.render(0);

    expect(loadGLBModel).toHaveBeenCalledWith('https://assets.example/animated.glb');
    expect(updateSpy).toHaveBeenCalledWith(0.25);
    expect(renderer.render).toHaveBeenCalledWith(app.sceneContext.scene, app.sceneContext.camera);

    updateSpy.mockRestore();
  });

  it('marks the selected model as downloaded after a successful GLB load', async () => {
    vi.mocked(loadGLBModel).mockResolvedValue(new THREE.Group());
    const { app } = createAnimatedApp();

    await app.loadModelFromUrl('https://assets.example/generated-chair.glb', 'Generated chair', {
      loadingMessage: 'Loading Generated chair...',
      successMessage: 'Generated chair loaded.',
      sourceMessage: 'Cloudflare hosted model',
      selectedModelId: 'generated-chair',
    });

    expect(app.hud.markModelDownloadStarted).toHaveBeenCalledWith('generated-chair');
    expect(app.hud.markModelDownloaded).toHaveBeenCalledWith('generated-chair');
    expect(app.hud.markModelDownloadFailed).not.toHaveBeenCalled();
  });

  it('does not restart the download state when loading an already downloaded model for AR', async () => {
    vi.mocked(loadGLBModel).mockResolvedValue(new THREE.Group());
    const { app } = createAnimatedApp();
    app.hud.isModelDownloaded.mockReturnValue(true);

    await app.loadModelFromUrl('https://assets.example/generated-chair.glb', 'Generated chair', {
      loadingMessage: 'Loading Generated chair...',
      successMessage: 'Generated chair loaded.',
      sourceMessage: 'Cloudflare hosted model',
      selectedModelId: 'generated-chair',
    });

    expect(app.hud.markModelDownloadStarted).not.toHaveBeenCalled();
    expect(app.hud.markModelDownloaded).toHaveBeenCalledWith('generated-chair');
    expect(app.hud.markModelDownloadFailed).not.toHaveBeenCalled();
  });

  it('discards a downloaded model when its guarded load is no longer current', async () => {
    let resolveModel!: (model: THREE.Group) => void;
    vi.mocked(loadGLBModel).mockReset();
    vi.mocked(loadGLBModel).mockReturnValue(new Promise((resolve) => {
      resolveModel = resolve;
    }));
    const { app } = createAnimatedApp();
    let isCurrent = true;

    const staleLoad = app.loadModelFromUrl('https://assets.example/stale.glb', 'Stale model', {
      loadingMessage: 'Loading stale model...',
      successMessage: 'Stale model loaded.',
      sourceMessage: 'Generated model',
      isCurrent: () => isCurrent,
    });
    await vi.waitFor(() => expect(loadGLBModel).toHaveBeenCalledOnce());

    isCurrent = false;
    const newerModel = new THREE.Group();
    app.sceneContext.modelRoot.add(newerModel);
    app.appState.modelLoaded = true;
    app.hud.update.mockClear();
    app.hud.updateModelReady.mockClear();
    resolveModel(new THREE.Group());
    await staleLoad;

    expect(app.sceneContext.modelRoot.children).toEqual([newerModel]);
    expect(app.appState.modelLoaded).toBe(true);
    expect(app.hud.updateModelReady).not.toHaveBeenCalled();
    expect(app.hud.update).not.toHaveBeenCalled();
  });

  it('plays only the selected GLB animation clip and exposes choices to the HUD', async () => {
    const animatedModel = new THREE.Group();
    const idleClip = new THREE.AnimationClip('Idle', 1, []);
    const walkClip = new THREE.AnimationClip('Walk', 1, []);
    animatedModel.userData.animations = [idleClip, walkClip];
    vi.mocked(loadGLBModel).mockResolvedValue(animatedModel);
    const clipActionSpy = vi.spyOn(THREE.AnimationMixer.prototype, 'clipAction');
    const stopAllActionSpy = vi.spyOn(THREE.AnimationMixer.prototype, 'stopAllAction');
    const { app } = createAnimatedApp();

    try {
      await app.loadModelFromUrl('https://assets.example/animated.glb', 'Animated model', {
        loadingMessage: 'Loading animated model...',
        successMessage: 'Animated model loaded.',
        sourceMessage: 'Uploaded GLB',
      });

      expect(app.hud.updateAnimationOptions).toHaveBeenCalledWith([
        { index: 0, label: 'Idle' },
        { index: 1, label: 'Walk' },
      ], 0);
      expect(clipActionSpy).toHaveBeenCalledTimes(1);
      expect(clipActionSpy).toHaveBeenLastCalledWith(idleClip);

      app.selectModelAnimation(1);

      expect(stopAllActionSpy).toHaveBeenCalledOnce();
      expect(clipActionSpy).toHaveBeenCalledTimes(2);
      expect(clipActionSpy).toHaveBeenLastCalledWith(walkClip);
      expect(app.hud.updateSelectedAnimation).toHaveBeenCalledWith(1);
    } finally {
      clipActionSpy.mockRestore();
      stopAllActionSpy.mockRestore();
    }
  });
});

describe('WebARApp model preview animations', () => {
  it('publishes preview animation options and switches selected preview clips', async () => {
    const previewAnimations = [
      { index: 0, label: 'Idle' },
      { index: 1, label: 'Walk' },
    ];
    const previewViewer = {
      dispose: vi.fn(),
      preview: vi.fn().mockResolvedValue({ animations: previewAnimations }),
      selectAnimation: vi.fn(() => true),
      setLightingIntensity: vi.fn(),
      setLightDirectionDegrees: vi.fn(),
    };
    const app = new WebARApp(document.createElement('div')) as unknown as {
      availableModels: Array<{ id: string; label: string; url: string }>;
      hud: {
        isModelDownloaded: ReturnType<typeof vi.fn>;
        markModelDownloadFailed: ReturnType<typeof vi.fn>;
        markModelDownloaded: ReturnType<typeof vi.fn>;
        markModelDownloadStarted: ReturnType<typeof vi.fn>;
        getModelPreviewLightDirectionDegrees: ReturnType<typeof vi.fn>;
        getModelPreviewLightingIntensity: ReturnType<typeof vi.fn>;
        modelPreviewViewport: HTMLElement;
        showModelPreviewError: ReturnType<typeof vi.fn>;
        showModelPreviewLoading: ReturnType<typeof vi.fn>;
        showModelPreviewReady: ReturnType<typeof vi.fn>;
        updateModelPreviewAnimationOptions: ReturnType<typeof vi.fn>;
        updateSelectedModelPreviewAnimation: ReturnType<typeof vi.fn>;
      };
      modelPreviewViewer: typeof previewViewer;
      previewModel(modelId: string): Promise<void>;
      selectModelPreviewAnimation(animationIndex: number): void;
    };

    app.availableModels = [
      {
        id: 'animated-preview',
        label: 'Animated preview',
        url: 'https://assets.example/animated-preview.glb',
      },
    ];
    app.hud = {
      isModelDownloaded: vi.fn(() => false),
      markModelDownloadFailed: vi.fn(),
      markModelDownloaded: vi.fn(),
      markModelDownloadStarted: vi.fn(),
      getModelPreviewLightDirectionDegrees: vi.fn(() => 45),
      getModelPreviewLightingIntensity: vi.fn(() => 1),
      modelPreviewViewport: document.createElement('div'),
      showModelPreviewError: vi.fn(),
      showModelPreviewLoading: vi.fn(),
      showModelPreviewReady: vi.fn(),
      updateModelPreviewAnimationOptions: vi.fn(),
      updateSelectedModelPreviewAnimation: vi.fn(),
    };
    app.modelPreviewViewer = previewViewer;

    await app.previewModel('animated-preview');

    expect(previewViewer.preview).toHaveBeenCalledWith(app.availableModels[0]);
    expect(app.hud.markModelDownloadStarted).toHaveBeenCalledWith('animated-preview');
    expect(app.hud.markModelDownloaded).toHaveBeenCalledWith('animated-preview');
    expect(app.hud.markModelDownloadFailed).not.toHaveBeenCalled();
    expect(app.hud.updateModelPreviewAnimationOptions).toHaveBeenCalledWith(previewAnimations, 0);
    expect(app.hud.showModelPreviewReady).toHaveBeenCalledOnce();

    app.selectModelPreviewAnimation(1);

    expect(previewViewer.selectAnimation).toHaveBeenCalledWith(1);
    expect(app.hud.updateSelectedModelPreviewAnimation).toHaveBeenCalledWith(1);
  });
});
