import * as THREE from 'three';

const SELECTION_DURATION_SECONDS = 0.25;
const SELECTION_COLOR = 0xf4b942;
const PULSE_SCALE = 0.08;
const BOUNDS_PADDING = 1.08;
const MINIMUM_FEEDBACK_SIZE = 0.08;

interface ActiveFeedback {
  target: THREE.Group;
  group: THREE.Group;
  geometry: THREE.EdgesGeometry;
  material: THREE.LineBasicMaterial;
  elapsedSeconds: number;
  reducedMotion: boolean;
}

export class SelectionFeedbackController {
  private active: ActiveFeedback | null = null;

  show(target: THREE.Group, reducedMotion: boolean): void {
    this.clear();
    const bounds = getLocalVisualBounds(target);
    const size = bounds.getSize(new THREE.Vector3()).multiplyScalar(BOUNDS_PADDING);
    size.set(
      Math.max(size.x, MINIMUM_FEEDBACK_SIZE),
      Math.max(size.y, MINIMUM_FEEDBACK_SIZE),
      Math.max(size.z, MINIMUM_FEEDBACK_SIZE),
    );

    const boxGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const geometry = new THREE.EdgesGeometry(boxGeometry);
    boxGeometry.dispose();
    const material = new THREE.LineBasicMaterial({
      color: SELECTION_COLOR,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    const outline = new THREE.LineSegments(geometry, material);
    outline.name = 'selection-feedback-outline';

    const group = new THREE.Group();
    group.name = 'selection-feedback';
    group.position.copy(bounds.getCenter(new THREE.Vector3()));
    group.renderOrder = 10;
    group.add(outline);
    group.traverse((object) => {
      object.userData.ignoreRaycast = true;
      object.castShadow = false;
      object.receiveShadow = false;
    });
    target.add(group);

    this.active = {
      target,
      group,
      geometry,
      material,
      elapsedSeconds: 0,
      reducedMotion,
    };
  }

  update(deltaSeconds: number): void {
    const active = this.active;
    if (!active) {
      return;
    }

    active.elapsedSeconds += Math.max(0, deltaSeconds);
    const progress = Math.min(1, active.elapsedSeconds / SELECTION_DURATION_SECONDS);
    if (!active.reducedMotion) {
      active.group.scale.setScalar(1 + Math.sin(progress * Math.PI) * PULSE_SCALE);
    }
    active.material.opacity = 1 - progress * 0.65;

    if (progress >= 1) {
      this.clear();
    }
  }

  clear(): void {
    if (!this.active) {
      return;
    }

    this.active.target.remove(this.active.group);
    this.active.geometry.dispose();
    this.active.material.dispose();
    this.active = null;
  }
}

function getLocalVisualBounds(target: THREE.Group): THREE.Box3 {
  target.updateWorldMatrix(true, true);
  const targetWorldInverse = target.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();

  target.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh)
      || object.userData.ignoreRaycast
      || object.name === 'contact-shadow'
      || object.name === 'placement-marker'
      || object.name === 'selection-feedback'
    ) {
      return;
    }

    if (!object.geometry.boundingBox) {
      object.geometry.computeBoundingBox();
    }
    if (!object.geometry.boundingBox) {
      return;
    }

    const localToTarget = targetWorldInverse.clone().multiply(object.matrixWorld);
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(localToTarget));
  });

  if (bounds.isEmpty()) {
    bounds.setFromCenterAndSize(
      new THREE.Vector3(),
      new THREE.Vector3(MINIMUM_FEEDBACK_SIZE, MINIMUM_FEEDBACK_SIZE, MINIMUM_FEEDBACK_SIZE),
    );
  }
  return bounds;
}
