import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnchorManager } from '../../src/xr/AnchorManager';

function createAnchor() {
  return {
    anchorSpace: {} as XRSpace,
    delete: vi.fn(),
  } as unknown as XRAnchor;
}

describe('AnchorManager', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tracks and updates one anchor per object while preserving scale', async () => {
    const manager = new AnchorManager();
    const firstTarget = new THREE.Group();
    firstTarget.scale.setScalar(2);
    const secondTarget = new THREE.Group();
    const firstAnchor = createAnchor();
    const secondAnchor = createAnchor();

    await manager.createFor(firstTarget, { createAnchor: vi.fn(async () => firstAnchor) } as unknown as XRHitTestResult);
    await manager.createFor(secondTarget, { createAnchor: vi.fn(async () => secondAnchor) } as unknown as XRHitTestResult);

    const frame = {
      getPose: vi.fn((space: XRSpace) => ({
        transform: {
          matrix: new THREE.Matrix4().makeTranslation(space === firstAnchor.anchorSpace ? 1 : 2, 0.5, -3).toArray(),
        },
      } as unknown as XRPose)),
    } as unknown as XRFrame;
    manager.update(frame, {} as XRReferenceSpace);

    expect(firstTarget.position.toArray()).toEqual([1, 0.5, -3]);
    expect(firstTarget.scale.toArray()).toEqual([2, 2, 2]);
    expect(secondTarget.position.toArray()).toEqual([2, 0.5, -3]);
  });

  it('replaces and clears anchors without throwing when unsupported', async () => {
    const manager = new AnchorManager();
    const target = new THREE.Group();
    const firstAnchor = createAnchor();
    const secondAnchor = createAnchor();
    await manager.createFor(target, { createAnchor: vi.fn(async () => firstAnchor) } as unknown as XRHitTestResult);
    await manager.createFor(target, { createAnchor: vi.fn(async () => secondAnchor) } as unknown as XRHitTestResult);

    expect(firstAnchor.delete).toHaveBeenCalledOnce();
    expect(await manager.createFor(new THREE.Group(), {} as XRHitTestResult)).toBeNull();

    manager.clear();
    expect(secondAnchor.delete).toHaveBeenCalledOnce();
  });

  it('creates a replacement anchor at an object transform after dragging', async () => {
    const createAnchorResult = createAnchor();
    const createAnchorRequest = vi.fn(async (): Promise<XRAnchor> => createAnchorResult);
    class RigidTransformStub {
      constructor(public position: DOMPointInit, public orientation: DOMPointInit) {}
    }
    vi.stubGlobal('XRRigidTransform', RigidTransformStub);
    const target = new THREE.Group();
    target.position.set(3, 0.4, -2);
    target.rotation.y = 0.5;
    target.updateMatrixWorld(true);
    const manager = new AnchorManager();

    const result = await manager.createAtTransform(
      target,
      { createAnchor: createAnchorRequest } as unknown as XRFrame,
      {} as XRReferenceSpace,
    );

    expect(result).toBe(createAnchorResult);
    expect(createAnchorRequest).toHaveBeenCalledOnce();
  });
});
