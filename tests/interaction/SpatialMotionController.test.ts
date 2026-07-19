import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SpatialMotionController } from '../../src/interaction/SpatialMotionController';

function createTarget(): { target: THREE.Group; visual: THREE.Mesh; material: THREE.MeshBasicMaterial } {
  const target = new THREE.Group();
  target.position.set(1, 0.5, -2);
  target.scale.setScalar(2);
  const material = new THREE.MeshBasicMaterial({ opacity: 0.8, transparent: false });
  const visual = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  target.add(visual);
  return { target, visual, material };
}

describe('SpatialMotionController', () => {
  it('settles placement to the exact original transform and opacity', () => {
    const controller = new SpatialMotionController();
    const { target, visual, material } = createTarget();

    controller.startPlacement(target, false);

    expect(target.position.toArray()).toEqual([1, 0.5, -2]);
    expect(target.scale.toArray()).toEqual([2, 2, 2]);
    expect(visual.position.y).toBeCloseTo(0.04);
    expect(visual.scale.x).toBeCloseTo(0.96);
    expect(material.opacity).toBe(0);

    controller.update(0.22);

    expect(target.position.toArray()).toEqual([1, 0.5, -2]);
    expect(target.scale.toArray()).toEqual([2, 2, 2]);
    expect(visual.position.toArray()).toEqual([0, 0, 0]);
    expect(visual.scale.toArray()).toEqual([1, 1, 1]);
    expect(material.opacity).toBe(0.8);
    expect(material.transparent).toBe(false);
  });

  it('completes placement immediately for reduced motion', () => {
    const controller = new SpatialMotionController();
    const { target, material } = createTarget();

    controller.startPlacement(target, true);

    expect(target.position.toArray()).toEqual([1, 0.5, -2]);
    expect(target.scale.toArray()).toEqual([2, 2, 2]);
    expect(material.opacity).toBe(0.8);
  });

  it('damps dragging on x and z while preserving floor height', () => {
    const controller = new SpatialMotionController();
    const { target } = createTarget();

    controller.setDragTarget(target, new THREE.Vector3(3, 9, -4));
    expect(controller.isActive(target)).toBe(true);
    controller.update(1 / 60);

    expect(target.position.x).toBeGreaterThan(1);
    expect(target.position.x).toBeLessThan(3);
    expect(target.position.y).toBe(0.5);
    expect(target.position.z).toBeGreaterThan(-4);

    controller.finishDrag(target);
    for (let index = 0; index < 60; index += 1) {
      controller.update(1 / 60);
    }

    expect(target.position.toArray()).toEqual([3, 0.5, -4]);
    expect(controller.isActive(target)).toBe(false);
  });

  it('updates an active drag target without snapping to the previous point', () => {
    const controller = new SpatialMotionController();
    const { target } = createTarget();
    controller.setDragTarget(target, new THREE.Vector3(3, 9, -4));
    controller.update(1 / 60);
    const positionBeforeUpdate = target.position.x;

    controller.setDragTarget(target, new THREE.Vector3(4, 9, -5));

    expect(target.position.x).toBe(positionBeforeUpdate);
  });
});
