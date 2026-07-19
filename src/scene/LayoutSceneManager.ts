import * as THREE from 'three';
import { clampScale, type Point2 } from '../utils/math';
import type { LayoutObject, LayoutVector3 } from './layoutTypes';
import { createContactShadow } from './createContactShadow';

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
    group.add(createContactShadow());
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
      this.setContactShadowVisible(object, true);
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
    this.setContactShadowVisible(object, true);
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

  selectObjectAtScreenPoint(point: Point2, canvas: HTMLCanvasElement, camera: THREE.Camera): LayoutObject | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const ndc = new THREE.Vector2(
      ((point.x - rect.left) / rect.width) * 2 - 1,
      -(((point.y - rect.top) / rect.height) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    this.root.updateWorldMatrix(true, true);

    let closestObject: LayoutSceneObject | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const object of this.objects.values()) {
      if (!object.placed || !object.group.visible) {
        continue;
      }

      const intersection = raycaster
        .intersectObject(object.group, true)
        .find((candidate) => !candidate.object.userData.ignoreRaycast);
      if (!intersection) {
        continue;
      }

      if (intersection.distance < closestDistance) {
        closestObject = object;
        closestDistance = intersection.distance;
      }
    }

    if (!closestObject) {
      return null;
    }

    this.selectedObjectId = closestObject.id;
    return this.toLayoutObject(closestObject);
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

  resetSelectedTransform(): boolean {
    const object = this.selectedObject();
    if (!object || !object.placed) {
      return false;
    }

    object.group.rotation.set(0, 0, 0);
    object.group.scale.setScalar(object.initialScale || 1);
    if (object.floorY !== null) {
      object.group.position.y = object.floorY;
    }
    return true;
  }

  placeSelectedAt(matrix: THREE.Matrix4): boolean {
    const object = this.selectedObject();
    if (!object) {
      return false;
    }

    matrix.decompose(object.group.position, object.group.quaternion, object.group.scale);
    object.group.visible = true;
    this.setContactShadowVisible(object, true);
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

  private setContactShadowVisible(object: LayoutSceneObject, visible: boolean): void {
    const shadow = object.group.getObjectByName('contact-shadow');
    if (shadow) {
      shadow.visible = visible;
    }
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
