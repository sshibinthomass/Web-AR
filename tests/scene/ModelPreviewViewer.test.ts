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
    expect(previewScene.children.some((child) => child instanceof THREE.DirectionalLight && child.castShadow)).toBe(true);

    viewer.dispose();

    expect(controls.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(disconnectResize).toHaveBeenCalledTimes(1);
    expect(container.children).toHaveLength(0);
  });
});
