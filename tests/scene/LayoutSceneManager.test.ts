import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LayoutSceneManager } from '../../src/scene/LayoutSceneManager';
import type { LayoutObject } from '../../src/scene/layoutTypes';

function createModel(name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

function createPickableModel(name: string): THREE.Group {
  const group = createModel(name);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  group.add(mesh);
  return group;
}

function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }),
  });
  return canvas;
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

  it('selects the placed object touched on screen before applying transforms', () => {
    const root = new THREE.Group();
    const manager = new LayoutSceneManager(root);
    const first = manager.addObject({
      modelId: 'generated-chair',
      modelLabel: 'Chair',
      modelUrl: 'https://assets.example/chair.glb',
      model: createPickableModel('chair-model'),
    });
    manager.placePendingAt(placementMatrix(0, 0, 0));
    const second = manager.addObject({
      modelId: 'generated-table',
      modelLabel: 'Table',
      modelUrl: 'https://assets.example/table.glb',
      model: createPickableModel('table-model'),
    });
    manager.placePendingAt(placementMatrix(2, 0, 0));

    const selected = manager.selectObjectAtScreenPoint(
      { x: 50, y: 50 },
      createCanvas(),
      createCamera(),
    );
    manager.scaleSelectedBy(2);
    manager.rotateSelectedBy(0.25);

    expect(selected?.id).toBe(first.id);
    expect(manager.selectedObjectId).toBe(first.id);
    expect(manager.exportObjects()).toEqual([
      expect.objectContaining({
        id: first.id,
        transform: expect.objectContaining({
          rotation: expect.objectContaining({ y: expect.closeTo(0.75, 5) }),
          scale: { x: 2, y: 2, z: 2 },
        }),
      }),
      expect.objectContaining({
        id: second.id,
        transform: expect.objectContaining({
          rotation: expect.objectContaining({ y: expect.closeTo(0.5, 5) }),
          scale: { x: 1, y: 1, z: 1 },
        }),
      }),
    ]);
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
