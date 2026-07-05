import * as THREE from 'three';
import { clampScale } from '../utils/math';
import type { LayoutObject, LayoutVector3 } from './layoutTypes';

interface LayoutSceneObjectInput {
  id?: string;
  modelId: string;
  modelLabel: string;
  modelUrl: string;
  model: THREE.Group;
  transform?: LayoutObject['transform'];
}

interface LayoutSceneObject {
  id: string;
  modelId: string;
  modelLabel: string;
  modelUrl: string;
  group: THREE.Group;
  floorY: number | null;
  initialScale: number;
  placed: boolean;
}

export class LayoutSceneManager {
  private readonly objects = new Map<string, LayoutSceneObject>();
  private pendingObjectId: string | null = null;
  selectedObjectId: string | null = null;

  constructor(private readonly root: THREE.Group) {}

  addObject(input: LayoutSceneObjectInput): LayoutObject {
    const id = input.id ?? createLayoutObjectId();
    const group = new THREE.Group();
    group.name = 'layout-object';
    group.visible = false;
    group.add(input.model);
    this.root.add(group);

    const object: LayoutSceneObject = {
      id,
      modelId: input.modelId,
      modelLabel: input.modelLabel,
      modelUrl: input.modelUrl,
      group,
      floorY: null,
      initialScale: group.scale.x,
      placed: false,
    };
    this.objects.set(id, object);
    this.selectedObjectId = id;
    this.pendingObjectId = id;

    if (input.transform) {
      this.applyTransform(object, input.transform);
      object.placed = true;
      object.floorY = object.group.position.y;
      object.initialScale = object.group.scale.x;
      this.pendingObjectId = null;
    }

    return this.toLayoutObject(object);
  }

  placePendingAt(matrix: THREE.Matrix4): LayoutObject | null {
    const object = this.pendingObjectId ? this.objects.get(this.pendingObjectId) : null;
    if (!object) {
      return null;
    }

    matrix.decompose(object.group.position, object.group.quaternion, object.group.scale);
    object.group.visible = true;
    object.group.matrixAutoUpdate = true;
    object.floorY = object.group.position.y;
    object.initialScale = object.group.scale.x;
    object.placed = true;
    this.selectedObjectId = object.id;
    this.pendingObjectId = null;
    return this.toLayoutObject(object);
  }

  selectObject(objectId: string): boolean {
    if (!this.objects.has(objectId)) {
      return false;
    }

    this.selectedObjectId = objectId;
    return true;
  }

  deleteSelected(): boolean {
    const object = this.selectedObject();
    if (!object) {
      return false;
    }

    this.root.remove(object.group);
    this.objects.delete(object.id);
    if (this.pendingObjectId === object.id) {
      this.pendingObjectId = null;
    }
    this.selectedObjectId = this.objects.size > 0 ? [...this.objects.keys()][this.objects.size - 1] : null;
    return true;
  }

  clear(): void {
    this.objects.forEach((object) => {
      this.root.remove(object.group);
    });
    this.objects.clear();
    this.pendingObjectId = null;
    this.selectedObjectId = null;
  }

  exportObjects(): LayoutObject[] {
    return [...this.objects.values()]
      .filter((object) => object.placed)
      .map((object) => this.toLayoutObject(object));
  }

  importObjects(objects: LayoutObject[], createModel: (object: LayoutObject) => THREE.Group): void {
    this.clear();
    objects.forEach((object) => {
      this.addObject({
        id: object.id,
        modelId: object.modelId,
        modelLabel: object.modelLabel,
        modelUrl: object.modelUrl,
        model: createModel(object),
        transform: object.transform,
      });
    });
  }

  moveSelectedToFloorPoint(point: THREE.Vector3): boolean {
    const object = this.selectedObject();
    if (!object || !object.placed) {
      return false;
    }

    object.group.position.set(point.x, object.floorY ?? point.y, point.z);
    return true;
  }

  scaleSelectedBy(multiplier: number): boolean {
    const object = this.selectedObject();
    if (!object || !object.placed) {
      return false;
    }

    object.group.scale.setScalar(clampScale(object.group.scale.x * multiplier));
    return true;
  }

  rotateSelectedBy(deltaRadians: number): boolean {
    const object = this.selectedObject();
    if (!object || !object.placed) {
      return false;
    }

    object.group.rotation.y += deltaRadians;
    return true;
  }

  resetSelectedScale(): boolean {
    const object = this.selectedObject();
    if (!object || !object.placed) {
      return false;
    }

    object.group.scale.setScalar(object.initialScale || 1);
    return true;
  }

  placeSelectedAt(matrix: THREE.Matrix4): boolean {
    const object = this.selectedObject();
    if (!object) {
      return false;
    }

    matrix.decompose(object.group.position, object.group.quaternion, object.group.scale);
    object.group.visible = true;
    object.floorY = object.group.position.y;
    object.initialScale = object.group.scale.x;
    object.placed = true;
    if (this.pendingObjectId === object.id) {
      this.pendingObjectId = null;
    }
    return true;
  }

  selectedGroup(): THREE.Group | null {
    return this.selectedObject()?.group ?? null;
  }

  private selectedObject(): LayoutSceneObject | null {
    return this.selectedObjectId ? this.objects.get(this.selectedObjectId) ?? null : null;
  }

  private applyTransform(object: LayoutSceneObject, transform: LayoutObject['transform']): void {
    object.group.position.copy(fromLayoutVector(transform.position));
    object.group.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
    object.group.scale.copy(fromLayoutVector(transform.scale));
    object.group.visible = true;
  }

  private toLayoutObject(object: LayoutSceneObject): LayoutObject {
    return {
      id: object.id,
      modelId: object.modelId,
      modelLabel: object.modelLabel,
      modelUrl: object.modelUrl,
      transform: {
        position: toLayoutVector(object.group.position),
        rotation: {
          x: object.group.rotation.x,
          y: object.group.rotation.y,
          z: object.group.rotation.z,
        },
        scale: toLayoutVector(object.group.scale),
      },
    };
  }
}

function toLayoutVector(vector: THREE.Vector3 | THREE.Euler): LayoutVector3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function fromLayoutVector(vector: LayoutVector3): THREE.Vector3 {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

function createLayoutObjectId(): string {
  const randomId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `object-${randomId}`;
}
