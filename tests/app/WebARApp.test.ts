import { describe, expect, it, vi } from 'vitest';
import { WebARApp } from '../../src/app/WebARApp';

describe('WebARApp layout reset', () => {
  it('resets the selected layout object when no fresh hit-test pose exists', () => {
    const app = new WebARApp(document.createElement('div')) as unknown as {
      appState: { mode: string; setMode(mode: 'editing' | 'placed'): void };
      hitTestManager: { latestPoseMatrix: null } | null;
      hud: { update: ReturnType<typeof vi.fn> };
      layoutMode: boolean;
      layoutSceneManager: {
        placeSelectedAt: ReturnType<typeof vi.fn>;
        resetSelectedTransform: ReturnType<typeof vi.fn>;
      };
      resetObject(): void;
    };
    const placeSelectedAt = vi.fn();
    const resetSelectedTransform = vi.fn(() => true);
    const update = vi.fn();

    app.layoutMode = true;
    app.hitTestManager = { latestPoseMatrix: null };
    app.layoutSceneManager = { placeSelectedAt, resetSelectedTransform };
    app.hud = { update };
    app.appState.setMode('editing');

    app.resetObject();

    expect(resetSelectedTransform).toHaveBeenCalledOnce();
    expect(placeSelectedAt).not.toHaveBeenCalled();
    expect(app.appState.mode).toBe('placed');
    expect(update).toHaveBeenCalledWith('placed');
  });
});

describe('WebARApp multi-object access', () => {
  it('starts a multi-object session without requiring a guest to sign in', async () => {
    const app = new WebARApp(document.createElement('div')) as unknown as {
      appState: { mode: string; modelLoaded: boolean };
      authToken: string | null;
      ensureARRuntime: ReturnType<typeof vi.fn>;
      hud: {
        showAuthMessage: ReturnType<typeof vi.fn>;
        updateModelReady: ReturnType<typeof vi.fn>;
        showMultiObjectEditor: ReturnType<typeof vi.fn>;
        showMultiObjectMessage: ReturnType<typeof vi.fn>;
      };
      layoutMode: boolean;
      layoutSceneManager: {
        clear: ReturnType<typeof vi.fn>;
      };
      startMultiObjectSession(): Promise<void>;
    };

    app.authToken = null;
    app.ensureARRuntime = vi.fn(async () => ({}));
    app.layoutSceneManager = { clear: vi.fn() };
    app.hud = {
      showAuthMessage: vi.fn(),
      updateModelReady: vi.fn(),
      showMultiObjectEditor: vi.fn(),
      showMultiObjectMessage: vi.fn(),
    };
    window.history.replaceState(null, '', '/');

    await app.startMultiObjectSession();

    expect(app.hud.showAuthMessage).not.toHaveBeenCalled();
    expect(window.location.hash).not.toBe('#/login');
    expect(app.ensureARRuntime).toHaveBeenCalledOnce();
    expect(app.layoutMode).toBe(true);
    expect(app.layoutSceneManager.clear).toHaveBeenCalledOnce();
    expect(app.appState.modelLoaded).toBe(false);
    expect(app.appState.mode).toBe('scanning');
    expect(app.hud.updateModelReady).toHaveBeenCalledWith(false);
    expect(app.hud.showMultiObjectEditor).toHaveBeenCalledOnce();
    expect(app.hud.showMultiObjectMessage).toHaveBeenCalledWith(
      'This session starts empty each time. Choose a model, tap Place, then add more objects.',
    );
  });
});
