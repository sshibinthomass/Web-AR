import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gltfLoaderMock = vi.hoisted(() => ({
  loadAsync: vi.fn(),
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn(function GLTFLoader() {
    return {
      loadAsync: gltfLoaderMock.loadAsync,
    };
  }),
}));

import { loadGLBModel } from '../../src/scene/loadModel';

describe('loadGLBModel', () => {
  beforeEach(() => {
    gltfLoaderMock.loadAsync.mockReset();
  });

  it('keeps GLB animation clips available on the loaded group', async () => {
    const clip = new THREE.AnimationClip('mixamo.com', 1, []);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    gltfLoaderMock.loadAsync.mockResolvedValue({
      scene,
      animations: [clip],
    });

    const loadedModel = await loadGLBModel('https://assets.example/animated.glb');

    expect(loadedModel.userData.animations).toEqual([clip]);
  });
});
