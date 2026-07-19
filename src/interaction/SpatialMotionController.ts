import * as THREE from 'three';

const PLACEMENT_DURATION_SECONDS = 0.22;
const PLACEMENT_HEIGHT_METERS = 0.04;
const PLACEMENT_START_SCALE = 0.96;
const DRAG_DAMPING_LAMBDA = 20;
const DRAG_SNAP_DISTANCE_METERS = 0.001;

interface MaterialSnapshot {
  material: THREE.Material;
  opacity: number;
  transparent: boolean;
}

interface VisualSnapshot {
  object: THREE.Object3D;
  startPosition: THREE.Vector3;
  finalPosition: THREE.Vector3;
  startScale: THREE.Vector3;
  finalScale: THREE.Vector3;
}

interface PlacementMotion {
  kind: 'placement';
  elapsed: number;
  visuals: VisualSnapshot[];
  materials: MaterialSnapshot[];
}

interface DragMotion {
  kind: 'drag';
  targetPosition: THREE.Vector3;
  settling: boolean;
}

type MotionState = PlacementMotion | DragMotion;

export class SpatialMotionController {
  private readonly motions = new Map<THREE.Group, MotionState>();

  startPlacement(target: THREE.Group, reducedMotion: boolean): void {
    this.cancel(target);
    if (reducedMotion) {
      return;
    }

    const visuals = target.children
      .filter((child) => child.name !== 'contact-shadow' && child.name !== 'placement-marker')
      .map((object): VisualSnapshot => {
        const finalPosition = object.position.clone();
        const finalScale = object.scale.clone();
        return {
          object,
          startPosition: finalPosition.clone().add(new THREE.Vector3(0, PLACEMENT_HEIGHT_METERS, 0)),
          finalPosition,
          startScale: finalScale.clone().multiplyScalar(PLACEMENT_START_SCALE),
          finalScale,
        };
      });
    const materials = this.captureMaterials(target);

    for (const visual of visuals) {
      visual.object.position.copy(visual.startPosition);
      visual.object.scale.copy(visual.startScale);
    }
    for (const snapshot of materials) {
      snapshot.material.transparent = true;
      snapshot.material.opacity = 0;
    }

    this.motions.set(target, {
      kind: 'placement',
      elapsed: 0,
      visuals,
      materials,
    });
  }

  isActive(target: THREE.Group): boolean {
    return this.motions.has(target);
  }

  setDragTarget(target: THREE.Group, point: THREE.Vector3): void {
    const current = this.motions.get(target);
    if (current?.kind === 'drag') {
      current.targetPosition.set(point.x, target.position.y, point.z);
      current.settling = false;
      return;
    }
    this.cancel(target);
    this.motions.set(target, {
      kind: 'drag',
      targetPosition: new THREE.Vector3(point.x, target.position.y, point.z),
      settling: false,
    });
  }

  finishDrag(target: THREE.Group): void {
    const motion = this.motions.get(target);
    if (motion?.kind === 'drag') {
      motion.settling = true;
    }
  }

  update(deltaSeconds: number): void {
    for (const [target, motion] of this.motions) {
      if (motion.kind === 'placement') {
        this.updatePlacement(target, motion, deltaSeconds);
      } else {
        this.updateDrag(target, motion, deltaSeconds);
      }
    }
  }

  cancel(target?: THREE.Group): void {
    if (target) {
      const motion = this.motions.get(target);
      if (motion) {
        this.finishMotion(target, motion);
      }
      return;
    }

    for (const [motionTarget, motion] of this.motions) {
      this.finishMotion(motionTarget, motion);
    }
  }

  private updatePlacement(target: THREE.Group, motion: PlacementMotion, deltaSeconds: number): void {
    motion.elapsed += Math.max(0, deltaSeconds);
    const progress = Math.min(1, motion.elapsed / PLACEMENT_DURATION_SECONDS);
    const eased = 1 - (1 - progress) ** 3;
    for (const visual of motion.visuals) {
      visual.object.position.lerpVectors(visual.startPosition, visual.finalPosition, eased);
      visual.object.scale.lerpVectors(visual.startScale, visual.finalScale, eased);
    }
    for (const snapshot of motion.materials) {
      snapshot.material.opacity = snapshot.opacity * eased;
    }

    if (progress >= 1) {
      this.finishMotion(target, motion);
    }
  }

  private updateDrag(target: THREE.Group, motion: DragMotion, deltaSeconds: number): void {
    const alpha = 1 - Math.exp(-DRAG_DAMPING_LAMBDA * Math.max(0, deltaSeconds));
    target.position.x = THREE.MathUtils.lerp(target.position.x, motion.targetPosition.x, alpha);
    target.position.z = THREE.MathUtils.lerp(target.position.z, motion.targetPosition.z, alpha);

    const remaining = Math.hypot(
      target.position.x - motion.targetPosition.x,
      target.position.z - motion.targetPosition.z,
    );
    if (motion.settling && remaining <= DRAG_SNAP_DISTANCE_METERS) {
      target.position.copy(motion.targetPosition);
      this.motions.delete(target);
    }
  }

  private finishMotion(target: THREE.Group, motion: MotionState): void {
    if (motion.kind === 'placement') {
      for (const visual of motion.visuals) {
        visual.object.position.copy(visual.finalPosition);
        visual.object.scale.copy(visual.finalScale);
      }
      for (const snapshot of motion.materials) {
        snapshot.material.opacity = snapshot.opacity;
        snapshot.material.transparent = snapshot.transparent;
      }
    } else {
      target.position.copy(motion.targetPosition);
    }
    this.motions.delete(target);
  }

  private captureMaterials(target: THREE.Group): MaterialSnapshot[] {
    const snapshots: MaterialSnapshot[] = [];
    target.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.name === 'contact-shadow' || object.name === 'placement-marker') {
        return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        snapshots.push({
          material,
          opacity: material.opacity,
          transparent: material.transparent,
        });
      }
    });
    return snapshots;
  }
}
