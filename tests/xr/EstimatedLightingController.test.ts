import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EstimatedLightingController } from '../../src/xr/EstimatedLightingController';

class FakeEstimatedLight extends THREE.Group {
  environment: THREE.Texture | null = new THREE.Texture();
  directionalLight = new THREE.DirectionalLight();
  dispose = vi.fn();
}

describe('EstimatedLightingController', () => {
  it('uses estimated environment lighting and restores fixed fallback lights', () => {
    const scene = new THREE.Scene();
    const hemisphere = new THREE.HemisphereLight();
    const directional = new THREE.DirectionalLight();
    scene.add(hemisphere, directional);
    const estimated = new FakeEstimatedLight();
    const controller = new EstimatedLightingController(
      scene,
      estimated as unknown as ConstructorParameters<typeof EstimatedLightingController>[1],
      [hemisphere, directional],
    );

    controller.start();
    const dispatch = estimated.dispatchEvent.bind(estimated) as unknown as (event: { type: string }) => void;
    dispatch({ type: 'estimationstart' });

    expect(hemisphere.visible).toBe(false);
    expect(directional.visible).toBe(false);
    expect(scene.environment).toBe(estimated.environment);

    dispatch({ type: 'estimationend' });

    expect(hemisphere.visible).toBe(true);
    expect(directional.visible).toBe(true);
    expect(scene.environment).toBeNull();
  });

  it('disposes once and leaves unrelated scene environments intact', () => {
    const scene = new THREE.Scene();
    const existingEnvironment = new THREE.Texture();
    scene.environment = existingEnvironment;
    const fallback = [new THREE.HemisphereLight(), new THREE.DirectionalLight()] as const;
    const estimated = new FakeEstimatedLight();
    const controller = new EstimatedLightingController(
      scene,
      estimated as unknown as ConstructorParameters<typeof EstimatedLightingController>[1],
      fallback,
    );

    controller.start();
    controller.dispose();
    controller.dispose();

    expect(scene.environment).toBe(existingEnvironment);
    expect(estimated.dispose).toHaveBeenCalledOnce();
    expect(estimated.parent).toBeNull();
  });
});
