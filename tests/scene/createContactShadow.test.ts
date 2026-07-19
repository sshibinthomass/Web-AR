import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createContactShadow } from '../../src/scene/createContactShadow';

describe('createContactShadow', () => {
  it('creates a hidden transparent shadow receiver', () => {
    const shadow = createContactShadow();

    expect(shadow.name).toBe('contact-shadow');
    expect(shadow.visible).toBe(false);
    expect(shadow.receiveShadow).toBe(true);
    expect(shadow.material).toBeInstanceOf(THREE.ShadowMaterial);
    expect(shadow.material.opacity).toBeCloseTo(0.22);
    expect(shadow.userData.ignoreRaycast).toBe(true);
  });
});
