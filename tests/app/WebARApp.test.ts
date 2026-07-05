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
