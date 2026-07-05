import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LayoutSceneManager } from '../../src/scene/LayoutSceneManager';
import type { LayoutObject } from '../../src/scene/layoutTypes';

function createModel(name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

function placementMatrix(x: number, y: number, z: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, 0)),
    new THREE.Vector3(1, 1, 1),
  );
}

describe('LayoutSceneManager', () => {
  it('places multiple objects without replacing earlier objects', () => {
    const root = new THREE.Group();
    const manager = new LayoutSceneManager(root);

    const first = manager.addObject({
      modelId: 'generated-chair',
      modelLabel: 'Chair',
      modelUrl: 'https://assets.example/chair.glb',
      model: createModel('chair-model'),
    });
    manager.placePendingAt(placementMatrix(1, 0.2, -1));

    const second = manager.addObject({
      modelId: 'generated-table',
      modelLabel: 'Table',
      modelUrl: 'https://assets.example/table.glb',
      model: createModel('table-model'),
    });
    manager.placePendingAt(placementMatrix(2, 0.2, -2));

    expect(root.children.map((child) => child.name)).toEqual(['layout-object', 'layout-object']);
    expect(manager.selectedObjectId).toBe(second.id);
    expect(manager.exportObjects()).toEqual([
      expect.objectContaining({ id: first.id, modelId: 'generated-chair', modelLabel: 'Chair' }),
      expect.objectContaining({ id: second.id, modelId: 'generated-table', modelLabel: 'Table' }),
    ]);
  });

  it('selects and deletes a single object without clearing the layout', () => {
    const root = new THREE.Group();
    const manager = new LayoutSceneManager(root);
    const first = manager.addObject({
      modelId: 'generated-chair',
      modelLabel: 'Chair',
      modelUrl: 'https://assets.example/chair.glb',
      model: createModel('chair-model'),
    });
    manager.placePendingAt(placementMatrix(1, 0, -1));
    const second = manager.addObject({
      modelId: 'generated-table',
      modelLabel: 'Table',
      modelUrl: 'https://assets.example/table.glb',
      model: createModel('table-model'),
    });
    manager.placePendingAt(placementMatrix(2, 0, -2));

    manager.selectObject(first.id);
    manager.deleteSelected();

    expect(root.children).toHaveLength(1);
    expect(manager.exportObjects()).toEqual([expect.objectContaining({ id: second.id })]);
  });

  it('imports and exports session transforms', () => {
    const root = new THREE.Group();
    const manager = new LayoutSceneManager(root);
    const savedObject: LayoutObject = {
      id: 'saved-chair',
      modelId: 'generated-chair',
      modelLabel: 'Chair',
      modelUrl: 'https://assets.example/chair.glb',
      transform: {
        position: { x: 1, y: 0.2, z: -1 },
        rotation: { x: 0, y: 0.5, z: 0 },
        scale: { x: 1.25, y: 1.25, z: 1.25 },
      },
    };

    manager.importObjects([savedObject], () => createModel('saved-chair-model'));
    manager.selectObject('saved-chair');
    manager.moveSelectedToFloorPoint(new THREE.Vector3(3, 9, -3));
    manager.scaleSelectedBy(2);
    manager.rotateSelectedBy(0.25);

    expect(manager.exportObjects()).toEqual([
      {
        id: 'saved-chair',
        modelId: 'generated-chair',
        modelLabel: 'Chair',
        modelUrl: 'https://assets.example/chair.glb',
        transform: {
          position: { x: 3, y: 0.2, z: -3 },
          rotation: { x: 0, y: 0.75, z: 0 },
          scale: { x: 2.5, y: 2.5, z: 2.5 },
        },
      },
    ]);
  });
});
