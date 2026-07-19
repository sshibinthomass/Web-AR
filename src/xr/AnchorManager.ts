import * as THREE from 'three';

export class AnchorManager {
  private readonly anchors = new Map<THREE.Object3D, XRAnchor>();
  private readonly requestVersions = new Map<THREE.Object3D, number>();
  private readonly yawOffsets = new Map<THREE.Object3D, number>();
  private generation = 0;

  async createFor(target: THREE.Object3D, hitResult: XRHitTestResult): Promise<XRAnchor | null> {
    const createAnchor = hitResult.createAnchor?.bind(hitResult);
    return this.replaceAnchor(target, createAnchor ? () => createAnchor() : null);
  }

  async createAtTransform(
    target: THREE.Object3D,
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
  ): Promise<XRAnchor | null> {
    const createAnchor = frame.createAnchor?.bind(frame);
    if (!createAnchor) {
      return this.replaceAnchor(target, null);
    }

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    target.getWorldPosition(position);
    target.getWorldQuaternion(quaternion);
    const transform = new XRRigidTransform(
      { x: position.x, y: position.y, z: position.z, w: 1 },
      { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
    );
    return this.replaceAnchor(target, () => createAnchor(transform, referenceSpace));
  }

  update(frame: XRFrame, referenceSpace: XRReferenceSpace): void {
    for (const [target, anchor] of this.anchors) {
      const pose = frame.getPose(anchor.anchorSpace, referenceSpace);
      if (!pose) {
        continue;
      }

      const worldMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
      const localMatrix = target.parent
        ? target.parent.matrixWorld.clone().invert().multiply(worldMatrix)
        : worldMatrix;
      const scale = target.scale.clone();
      localMatrix.decompose(target.position, target.quaternion, new THREE.Vector3());
      target.rotateY(this.yawOffsets.get(target) ?? 0);
      target.scale.copy(scale);
    }
  }

  addYawOffset(target: THREE.Object3D, deltaRadians: number): void {
    this.yawOffsets.set(target, (this.yawOffsets.get(target) ?? 0) + deltaRadians);
  }

  deleteFor(target: THREE.Object3D): void {
    this.requestVersions.set(target, (this.requestVersions.get(target) ?? 0) + 1);
    this.yawOffsets.delete(target);
    const anchor = this.anchors.get(target);
    if (anchor) {
      anchor.delete();
      this.anchors.delete(target);
    }
  }

  clear(): void {
    this.generation += 1;
    for (const target of [...this.anchors.keys()]) {
      this.deleteFor(target);
    }
    this.yawOffsets.clear();
  }

  private async replaceAnchor(
    target: THREE.Object3D,
    create: (() => Promise<XRAnchor>) | null,
  ): Promise<XRAnchor | null> {
    const version = (this.requestVersions.get(target) ?? 0) + 1;
    const generation = this.generation;
    this.requestVersions.set(target, version);
    this.yawOffsets.set(target, 0);
    const previous = this.anchors.get(target);
    if (previous) {
      previous.delete();
      this.anchors.delete(target);
    }
    if (!create) {
      return null;
    }

    try {
      const anchor = await create();
      if (this.requestVersions.get(target) !== version || this.generation !== generation) {
        anchor.delete();
        return null;
      }
      this.anchors.set(target, anchor);
      return anchor;
    } catch {
      return null;
    }
  }
}
