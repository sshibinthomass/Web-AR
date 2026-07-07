import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ModelPreviewViewer } from '../../src/scene/ModelPreviewViewer';

describe('ModelPreviewViewer', () => {
  it('loads a GLB into a non-AR preview canvas and disposes it cleanly', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 320, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 240, configurable: true });

    const renderer = {
      domElement: document.createElement('canvas'),
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const controls = {
      target: new THREE.Vector3(),
      enableDamping: false,
      enablePan: true,
      minDistance: 0,
      maxDistance: 0,
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const loadedModel = new THREE.Group();
    const loadedMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    loadedModel.add(loadedMesh);
    const loadModel = vi.fn().mockResolvedValue(loadedModel);
    const createControls = vi.fn(() => controls);
    const disconnectResize = vi.fn();

    const viewer = new ModelPreviewViewer(container, {
      loadModel,
      createRenderer: () => renderer,
      createControls,
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
      observeResize: vi.fn(() => disconnectResize),
    });

    await viewer.preview({
      id: 'chair',
      label: 'Chair',
      url: 'https://assets.example/chair.glb',
    });

    expect(loadModel).toHaveBeenCalledWith('https://assets.example/chair.glb');
    expect(container.querySelector('canvas')).toBe(renderer.domElement);
    expect(renderer.setSize).toHaveBeenCalledWith(320, 240, false);
    expect(createControls).toHaveBeenCalledWith(expect.any(THREE.PerspectiveCamera), renderer.domElement);
    expect(controls.enableDamping).toBe(true);
    expect(controls.enablePan).toBe(false);
    expect(loadedModel.parent).toBeInstanceOf(THREE.Scene);
    const previewScene = loadedModel.parent as THREE.Scene;
    expect(previewScene.background).toBeInstanceOf(THREE.Color);
    expect((previewScene.background as THREE.Color).getHex()).toBe(0xffffff);
    expect(loadedMesh.castShadow).toBe(true);
    expect(loadedMesh.receiveShadow).toBe(true);
    const shadowFloor = previewScene.children.find((child) => child.name === 'Preview soft shadow floor') as THREE.Mesh | undefined;
    expect(shadowFloor).toBeInstanceOf(THREE.Mesh);
    expect(shadowFloor?.receiveShadow).toBe(true);
    expect(shadowFloor?.material).toBeInstanceOf(THREE.ShadowMaterial);
    const keyLight = previewScene.children.find((child) => child instanceof THREE.DirectionalLight && child.castShadow) as
      | THREE.DirectionalLight
      | undefined;
    expect(keyLight).toBeInstanceOf(THREE.DirectionalLight);

    viewer.setLightingIntensity(1.5);

    expect(keyLight?.intensity).toBeCloseTo(3.3);
    expect((shadowFloor?.material as THREE.ShadowMaterial).opacity).toBeGreaterThan(0.22);
    expect(renderer.render).toHaveBeenCalledWith(previewScene, expect.any(THREE.PerspectiveCamera));
    const brightShadowOpacity = (shadowFloor?.material as THREE.ShadowMaterial).opacity;

    viewer.setLightDirectionDegrees(180);

    expect(keyLight?.position.x).toBeLessThan(-4);
    expect(Math.abs(keyLight?.position.z ?? 1)).toBeLessThan(0.001);
    expect(keyLight?.target.position.x).toBeCloseTo(0);

    viewer.setLightingIntensity(0.5);

    expect((shadowFloor?.material as THREE.ShadowMaterial).opacity).toBeLessThan(brightShadowOpacity);

    viewer.dispose();

    expect(controls.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(disconnectResize).toHaveBeenCalledTimes(1);
    expect(container.children).toHaveLength(0);
  });

  it('plays preview animations and switches to the selected clip', async () => {
    const container = document.createElement('div');
    const renderer = {
      domElement: document.createElement('canvas'),
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const controls = {
      target: new THREE.Vector3(),
      enableDamping: false,
      enablePan: true,
      minDistance: 0,
      maxDistance: 0,
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const loadedModel = new THREE.Group();
    loadedModel.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const idleClip = new THREE.AnimationClip('Idle', 1, []);
    const walkClip = new THREE.AnimationClip('Walk', 1, []);
    loadedModel.userData.animations = [idleClip, walkClip];
    let frameCallback: ((time: number) => void) | undefined;
    const clipActionSpy = vi.spyOn(THREE.AnimationMixer.prototype, 'clipAction');
    const stopAllActionSpy = vi.spyOn(THREE.AnimationMixer.prototype, 'stopAllAction');
    const updateSpy = vi.spyOn(THREE.AnimationMixer.prototype, 'update');

    const viewer = new ModelPreviewViewer(container, {
      loadModel: vi.fn().mockResolvedValue(loadedModel),
      createRenderer: () => renderer,
      createControls: () => controls,
      requestFrame: vi.fn((callback) => {
        frameCallback = callback;
        return 1;
      }),
      cancelFrame: vi.fn(),
      observeResize: vi.fn(() => vi.fn()),
    });

    try {
      const result = await viewer.preview({
        id: 'animated-chair',
        label: 'Animated chair',
        url: 'https://assets.example/animated-chair.glb',
      });

      expect(result.animations).toEqual([
        { index: 0, label: 'Idle' },
        { index: 1, label: 'Walk' },
      ]);
      expect(clipActionSpy).toHaveBeenCalledTimes(1);
      expect(clipActionSpy).toHaveBeenLastCalledWith(idleClip);

      expect(frameCallback).toBeTypeOf('function');
      frameCallback!(250);

      expect(updateSpy).toHaveBeenCalledWith(0.25);
      expect(viewer.selectAnimation(1)).toBe(true);
      expect(stopAllActionSpy).toHaveBeenCalledOnce();
      expect(clipActionSpy).toHaveBeenCalledTimes(2);
      expect(clipActionSpy).toHaveBeenLastCalledWith(walkClip);
      expect(viewer.selectAnimation(99)).toBe(false);
    } finally {
      clipActionSpy.mockRestore();
      stopAllActionSpy.mockRestore();
      updateSpy.mockRestore();
      viewer.dispose();
    }
  });
});
