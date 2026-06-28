import * as THREE from 'three';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  reticle: THREE.Mesh;
  modelRoot: THREE.Group;
  placementMarker: THREE.Mesh;
  floorGrid: THREE.GridHelper;
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
  container.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbfd6ff, 2.4);
  hemiLight.position.set(0.5, 1, 0.25);
  scene.add(hemiLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(1, 3, 2);
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

  const floorGrid = new THREE.GridHelper(2, 16, 0x5eead4, 0xffffff);
  const gridMaterial = floorGrid.material;
  if (Array.isArray(gridMaterial)) {
    gridMaterial.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.24;
    });
  } else {
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.24;
  }
  floorGrid.visible = false;
  scene.add(floorGrid);

  const modelRoot = new THREE.Group();
  modelRoot.visible = false;
  scene.add(modelRoot);

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
    floorGrid,
    dispose() {
      window.removeEventListener('resize', onResize);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
