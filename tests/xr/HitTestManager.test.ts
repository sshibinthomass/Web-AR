import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HitTestManager } from '../../src/xr/HitTestManager';

describe('HitTestManager', () => {
  it('shows the reticle only after eight stable hit frames', async () => {
    const reticle = new THREE.Mesh();
    reticle.matrixAutoUpdate = false;
    const manager = new HitTestManager(reticle);
    const source = {} as XRHitTestSource;
    const session = {
      requestReferenceSpace: vi.fn(async () => ({} as XRReferenceSpace)),
      requestHitTestSource: vi.fn(async () => source),
      addEventListener: vi.fn(),
    } as unknown as XRSession;
    const referenceSpace = {} as XRReferenceSpace;
    const matrix = new THREE.Matrix4().makeTranslation(0, 0, -1).toArray();
    const hit = {
      getPose: vi.fn(() => ({ transform: { matrix } } as unknown as XRPose)),
    } as unknown as XRHitTestResult;
    const frame = {
      getHitTestResults: vi.fn(() => [hit]),
    } as unknown as XRFrame;
    const update = manager.update.bind(manager) as (
      frame: XRFrame,
      session: XRSession,
      referenceSpace: XRReferenceSpace,
      deltaSeconds: number,
    ) => boolean;

    expect(update(frame, session, referenceSpace, 1 / 60)).toBe(false);
    await vi.waitFor(() => expect(session.requestHitTestSource).toHaveBeenCalledOnce());

    for (let index = 0; index < 7; index += 1) {
      expect(update(frame, session, referenceSpace, 1 / 60)).toBe(false);
      expect(reticle.visible).toBe(false);
    }

    expect(update(frame, session, referenceSpace, 1 / 60)).toBe(true);
    expect(reticle.visible).toBe(true);
    expect(manager.isStable).toBe(true);
    expect(manager.latestHitResult).toBe(hit);
  });

  it('cancels an active hit-test source on reset', async () => {
    const manager = new HitTestManager(new THREE.Mesh());
    const source = { cancel: vi.fn() } as unknown as XRHitTestSource;
    const session = {
      requestReferenceSpace: vi.fn(async () => ({} as XRReferenceSpace)),
      requestHitTestSource: vi.fn(async () => source),
      addEventListener: vi.fn(),
    } as unknown as XRSession;
    manager.update({} as XRFrame, session, {} as XRReferenceSpace, 1 / 60);
    await vi.waitFor(() => expect(session.requestHitTestSource).toHaveBeenCalledOnce());

    manager.reset();

    await vi.waitFor(() => expect(source.cancel).toHaveBeenCalledOnce());
  });

  it('cancels a source that resolves after reset', async () => {
    let resolveSource!: (source: XRHitTestSource) => void;
    const sourcePromise = new Promise<XRHitTestSource>((resolve) => {
      resolveSource = resolve;
    });
    const source = { cancel: vi.fn() } as unknown as XRHitTestSource;
    const manager = new HitTestManager(new THREE.Mesh());
    const session = {
      requestReferenceSpace: vi.fn(async () => ({} as XRReferenceSpace)),
      requestHitTestSource: vi.fn(() => sourcePromise),
      addEventListener: vi.fn(),
    } as unknown as XRSession;
    manager.update({} as XRFrame, session, {} as XRReferenceSpace, 1 / 60);
    await vi.waitFor(() => expect(session.requestHitTestSource).toHaveBeenCalledOnce());
    manager.reset();

    resolveSource(source);

    await vi.waitFor(() => expect(source.cancel).toHaveBeenCalledOnce());
  });
});
