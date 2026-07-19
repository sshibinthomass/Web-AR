import * as THREE from 'three';

export function createContactShadow(): THREE.Mesh<THREE.CircleGeometry, THREE.ShadowMaterial> {
  const geometry = new THREE.CircleGeometry(0.34, 48).rotateX(-Math.PI / 2);
  const material = new THREE.ShadowMaterial({
    color: 0x000000,
    opacity: 0.22,
    transparent: true,
  });
  material.depthWrite = false;

  const shadow = new THREE.Mesh(geometry, material);
  shadow.name = 'contact-shadow';
  shadow.position.y = 0.002;
  shadow.receiveShadow = true;
  shadow.visible = false;
  shadow.userData.ignoreRaycast = true;
  return shadow;
}
