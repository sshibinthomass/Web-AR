import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PoseStabilizer } from '../../src/xr/PoseStabilizer';

function pose(x: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, 0, -1);
}

describe('PoseStabilizer', () => {
  it('requires eight nearby samples before returning a stable pose', () => {
    const stabilizer = new PoseStabilizer();

    for (let index = 0; index < 7; index += 1) {
      expect(stabilizer.update(pose(index * 0.001), 1 / 60)).toBeNull();
    }

    expect(stabilizer.update(pose(0.007), 1 / 60)).toBeInstanceOf(THREE.Matrix4);
    expect(stabilizer.isStable).toBe(true);
  });

  it('rejects a one-frame jump larger than 35 centimeters', () => {
    const stabilizer = new PoseStabilizer();
    for (let index = 0; index < 8; index += 1) {
      stabilizer.update(pose(0), 1 / 60);
    }

    expect(stabilizer.update(pose(0.5), 1 / 60)).toBeNull();
    expect(stabilizer.isStable).toBe(false);
  });

  it('clears readiness and samples on reset', () => {
    const stabilizer = new PoseStabilizer();
    for (let index = 0; index < 8; index += 1) {
      stabilizer.update(pose(0), 1 / 60);
    }

    stabilizer.reset();

    expect(stabilizer.isStable).toBe(false);
    expect(stabilizer.update(pose(0), 1 / 60)).toBeNull();
  });
});
