import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadGLBModel(url: string): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;

  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.frustumCulled = false;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          material.needsUpdate = true;
        });
      }
    }
  });

  const bounds = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  bounds.getSize(size);

  const maxDimension = Math.max(size.x, size.y, size.z);
  const scale = maxDimension > 0 ? Math.min(1, 1.2 / maxDimension) : 1;
  model.scale.setScalar(scale);

  const scaledBounds = new THREE.Box3().setFromObject(model);
  const scaledCenter = new THREE.Vector3();
  scaledBounds.getCenter(scaledCenter);
  model.position.x -= scaledCenter.x;
  model.position.z -= scaledCenter.z;
  model.position.y -= scaledBounds.min.y;

  const group = new THREE.Group();
  group.name = 'loaded-glb-model';
  group.userData.animations = gltf.animations;
  group.add(model);
  group.visible = true;

  return group;
}
