import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ObjectTransformController } from '../../src/interaction/ObjectTransformController';

describe('ObjectTransformController', () => {
  it('locks movement to the placement floor y', () => {
    const target = new THREE.Group();
    const controller = new ObjectTransformController();
    controller.setTarget(target);

    const matrix = new THREE.Matrix4().makeTranslation(1, 0.25, 2);
    controller.placeAt(matrix);
    controller.moveToFloorPoint(new THREE.Vector3(3, 9, 4));

    expect(target.position.x).toBe(3);
    expect(target.position.y).toBe(0.25);
    expect(target.position.z).toBe(4);
  });

  it('clamps scale while preserving uniform scale', () => {
    const target = new THREE.Group();
    const controller = new ObjectTransformController();
    controller.setTarget(target);

    controller.scaleBy(10);
    expect(target.scale.x).toBe(5);
    expect(target.scale.y).toBe(5);
    expect(target.scale.z).toBe(5);

    controller.scaleBy(0.001);
    expect(target.scale.x).toBe(0.1);
    expect(target.scale.y).toBe(0.1);
    expect(target.scale.z).toBe(0.1);
  });

  it('rotates around the vertical axis', () => {
    const target = new THREE.Group();
    const controller = new ObjectTransformController();
    controller.setTarget(target);

    controller.rotateBy(Math.PI / 4);

    expect(target.rotation.y).toBeCloseTo(Math.PI / 4);
  });
});
