import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SelectionFeedbackController } from '../../src/interaction/SelectionFeedbackController';

function createTarget(): THREE.Group {
  const target = new THREE.Group();
  target.position.set(1, 0.5, -2);
  target.rotation.y = 0.4;
  target.scale.setScalar(1.5);
  const model = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 0.5),
    new THREE.MeshBasicMaterial(),
  );
  model.position.y = 1;
  target.add(model);
  target.updateWorldMatrix(true, true);
  return target;
}

describe('SelectionFeedbackController', () => {
  it('attaches non-interactive gold feedback without changing the target transform', () => {
    const controller = new SelectionFeedbackController();
    const target = createTarget();
    const originalPosition = target.position.clone();
    const originalRotation = target.rotation.clone();
    const originalScale = target.scale.clone();

    controller.show(target, false);

    const feedback = target.getObjectByName('selection-feedback');
    expect(feedback).toBeTruthy();
    feedback?.traverse((object) => {
      expect(object.userData.ignoreRaycast).toBe(true);
      expect(object.castShadow).toBe(false);
      expect(object.receiveShadow).toBe(false);
    });
    const line = feedback?.getObjectByName('selection-feedback-outline') as THREE.LineSegments;
    expect((line.material as THREE.LineBasicMaterial).color.getHex()).toBe(0xf4b942);
    expect(target.position.toArray()).toEqual(originalPosition.toArray());
    expect(target.rotation.toArray()).toEqual(originalRotation.toArray());
    expect(target.scale.toArray()).toEqual(originalScale.toArray());
  });

  it('pulses the helper and removes it after 250 milliseconds', () => {
    const controller = new SelectionFeedbackController();
    const target = createTarget();
    controller.show(target, false);
    const feedback = target.getObjectByName('selection-feedback');

    controller.update(0.125);
    expect(feedback?.scale.x).toBeGreaterThan(1);

    controller.update(0.125);
    expect(target.getObjectByName('selection-feedback')).toBeUndefined();
  });

  it('keeps a static highlight scale when reduced motion is preferred', () => {
    const controller = new SelectionFeedbackController();
    const target = createTarget();
    controller.show(target, true);
    const feedback = target.getObjectByName('selection-feedback');

    controller.update(0.125);

    expect(feedback?.scale.toArray()).toEqual([1, 1, 1]);
    expect(target.getObjectByName('selection-feedback')).toBe(feedback);
  });

  it('replaces previous feedback and clears its resources', () => {
    const controller = new SelectionFeedbackController();
    const first = createTarget();
    const second = createTarget();
    controller.show(first, false);

    controller.show(second, false);

    expect(first.getObjectByName('selection-feedback')).toBeUndefined();
    expect(second.getObjectByName('selection-feedback')).toBeTruthy();

    controller.clear();
    expect(second.getObjectByName('selection-feedback')).toBeUndefined();
  });
});
