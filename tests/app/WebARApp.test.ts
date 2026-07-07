import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WebARApp } from '../../src/app/WebARApp';

vi.mock('../../src/scene/loadModel', () => ({
  loadGLBModel: vi.fn(),
}));

import { loadGLBModel } from '../../src/scene/loadModel';

describe('WebARApp layout reset', () => {
  it('resets the selected layout object when no fresh hit-test pose exists', () => {
    const app = new WebARApp(document.createElement('div')) as unknown as {
      appState: { mode: string; setMode(mode: 'editing' | 'placed'): void };
      hitTestManager: { latestPoseMatrix: null } | null;
      hud: { update: ReturnType<typeof vi.fn> };
      layoutMode: boolean;
      layoutSceneManager: {
        placeSelectedAt: ReturnType<typeof vi.fn>;
        resetSelectedTransform: ReturnType<typeof vi.fn>;
      };
      resetObject(): void;
    };
    const placeSelectedAt = vi.fn();
    const resetSelectedTransform = vi.fn(() => true);
    const update = vi.fn();

    app.layoutMode = true;
    app.hitTestManager = { latestPoseMatrix: null };
    app.layoutSceneManager = { placeSelectedAt, resetSelectedTransform };
    app.hud = { update };
    app.appState.setMode('editing');

    app.resetObject();

    expect(resetSelectedTransform).toHaveBeenCalledOnce();
    expect(placeSelectedAt).not.toHaveBeenCalled();
    expect(app.appState.mode).toBe('placed');
    expect(update).toHaveBeenCalledWith('placed');
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
        update: ReturnType<typeof vi.fn>;
        updateAnimationOptions: ReturnType<typeof vi.fn>;
        updateModelReady: ReturnType<typeof vi.fn>;
        updateModelSource: ReturnType<typeof vi.fn>;
        updateSelectedAnimation: ReturnType<typeof vi.fn>;
        updateSelectedModel: ReturnType<typeof vi.fn>;
      };
      lastHudMode: string;
      layoutMode: boolean;
      planeTrackingManager: null;
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
      update: vi.fn(),
      updateAnimationOptions: vi.fn(),
      updateModelReady: vi.fn(),
      updateModelSource: vi.fn(),
      updateSelectedAnimation: vi.fn(),
      updateSelectedModel: vi.fn(),
    };
    app.layoutMode = false;
    app.planeTrackingManager = null;
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
