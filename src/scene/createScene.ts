import * as THREE from 'three';
import { createContactShadow } from './createContactShadow';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  reticle: THREE.Mesh;
  modelRoot: THREE.Group;
  placementMarker: THREE.Mesh;
  contactShadow: THREE.Mesh<THREE.CircleGeometry, THREE.ShadowMaterial>;
  dispose(): void;
}

export function createScene(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.xr.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbfd6ff, 2.4);
  hemiLight.position.set(0.5, 1, 0.25);
  scene.add(hemiLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(1, 3, 2);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(1024, 1024);
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 12;
  scene.add(directionalLight);

  const reticleGeometry = new THREE.RingGeometry(0.09, 0.105, 40).rotateX(-Math.PI / 2);
  const reticleMaterial = new THREE.MeshBasicMaterial({
    color: 0x5eead4,
    transparent: true,
    opacity: 0.95,
  });
  const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const modelRoot = new THREE.Group();
  modelRoot.visible = false;
  scene.add(modelRoot);

  const contactShadow = createContactShadow();
  modelRoot.add(contactShadow);

  const markerGeometry = new THREE.RingGeometry(0.22, 0.24, 48).rotateX(-Math.PI / 2);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0x5eead4,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const placementMarker = new THREE.Mesh(markerGeometry, markerMaterial);
  placementMarker.name = 'placement-marker';
  placementMarker.renderOrder = 10;
  modelRoot.add(placementMarker);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  return {
    renderer,
    scene,
    camera,
    reticle,
    modelRoot,
    placementMarker,
    contactShadow,
    dispose() {
      window.removeEventListener('resize', onResize);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
