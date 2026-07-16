import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadAuthToken: vi.fn<() => string | null>(() => 'stored-token'),
  login: vi.fn(),
  logout: vi.fn(async () => undefined),
  signup: vi.fn(),
}));

const modelMocks = vi.hoisted(() => ({
  listGeneratedModels: vi.fn(async () => []),
}));

vi.mock('../../src/services/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/authClient')>();
  return {
    ...actual,
    getCurrentUser: authMocks.getCurrentUser,
    loadAuthToken: authMocks.loadAuthToken,
    login: authMocks.login,
    logout: authMocks.logout,
    signup: authMocks.signup,
  };
});

vi.mock('../../src/services/generatedModelClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/generatedModelClient')>();
  return {
    ...actual,
    listGeneratedModels: modelMocks.listGeneratedModels,
  };
});

import { WebARApp } from '../../src/app/WebARApp';

const activeUser = {
  email: 'maker@example.com',
  name: 'Maya Stone',
  role: 'user' as const,
  status: 'active' as const,
};

describe('WebARApp route restoration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    authMocks.loadAuthToken.mockReturnValue('stored-token');
    authMocks.login.mockResolvedValue({ token: 'next-token', user: activeUser });
    authMocks.logout.mockResolvedValue(undefined);
    authMocks.signup.mockResolvedValue({ token: 'next-token', user: activeUser });
    modelMocks.listGeneratedModels.mockResolvedValue([]);
    window.history.replaceState(null, '', '/#/speech');
    window.localStorage.clear();
    window.localStorage.setItem('web-ar-auth-token', 'stored-token');
  });

  it('keeps a protected deep link pending until the stored session resolves', async () => {
    let resolveSession: (user: typeof activeUser) => void = () => undefined;
    authMocks.getCurrentUser.mockReturnValue(new Promise((resolve) => {
      resolveSession = resolve;
    }));
    const root = document.createElement('div');
    const app = new WebARApp(root) as unknown as {
      prepareMultiObject: () => Promise<void>;
      start(): Promise<void>;
    };
    app.prepareMultiObject = vi.fn(async () => undefined);

    const startPromise = app.start();
    await Promise.resolve();

    expect(window.location.hash).toBe('#/speech');
    expect(root.querySelector('.route-restoring')?.classList.contains('hidden')).toBe(false);

    resolveSession(activeUser);
    await startPromise;

    expect(window.location.hash).toBe('#/speech');
    expect(root.querySelector('.speech-panel')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.auth-panel')?.classList.contains('hidden')).toBe(true);
  });

  it('keeps an invalid-session deep link as the intended login destination', async () => {
    authMocks.getCurrentUser.mockResolvedValue(null);
    const root = document.createElement('div');
    const app = new WebARApp(root) as unknown as {
      prepareMultiObject: () => Promise<void>;
      start(): Promise<void>;
    };
    app.prepareMultiObject = vi.fn(async () => undefined);

    await app.start();

    expect(window.location.hash).toBe('#/login');
    expect(root.querySelector('.auth-panel')?.classList.contains('hidden')).toBe(false);
    expect(root.textContent).toContain('Sign in to use Text or Voice to 3D.');
    expect(window.localStorage.getItem('web-ar-auth-token')).toBeNull();
  });

  it('replaces Login with the intended route after a successful sign in', async () => {
    authMocks.loadAuthToken.mockReturnValue(null);
    window.localStorage.clear();
    const root = document.createElement('div');
    const app = new WebARApp(root) as unknown as {
      login(email: string, password: string): Promise<void>;
      start(): Promise<void>;
    };

    await app.start();
    expect(window.location.hash).toBe('#/login');

    await app.login('maker@example.com', 'password');

    expect(window.location.hash).toBe('#/speech');
    expect(root.querySelector('.speech-panel')?.classList.contains('hidden')).toBe(false);
  });

  it('returns a direct Login to Home and shows persistent and transient signed-in feedback', async () => {
    authMocks.loadAuthToken.mockReturnValue(null);
    window.localStorage.clear();
    window.history.replaceState(null, '', '/#/login');
    const root = document.createElement('div');
    const app = new WebARApp(root) as unknown as {
      login(email: string, password: string): Promise<void>;
      start(): Promise<void>;
    };

    await app.start();
    await app.login('maker@example.com', 'password');

    expect(window.location.hash).toBe('#/');
    expect(root.querySelector('.account-trigger-label')?.textContent).toBe('Hi, Maya Stone');
    expect(root.querySelector('.session-notice')?.textContent).toBe('Welcome back, Maya Stone.');
    expect(root.querySelector<HTMLElement>('.session-notice')?.hidden).toBe(false);
  });

  it('replaces Login with the intended route after an immediately approved signup', async () => {
    authMocks.loadAuthToken.mockReturnValue(null);
    window.localStorage.clear();
    const root = document.createElement('div');
    const app = new WebARApp(root) as unknown as {
      signup(email: string, password: string, name: string): Promise<void>;
      start(): Promise<void>;
    };

    await app.start();
    expect(window.location.hash).toBe('#/login');

    await app.signup('maker@example.com', 'password', 'Maker');

    expect(window.location.hash).toBe('#/speech');
    expect(root.querySelector('.speech-panel')?.classList.contains('hidden')).toBe(false);
  });

  it('clears the intended route on explicit logout', async () => {
    authMocks.getCurrentUser.mockResolvedValue(activeUser);
    const root = document.createElement('div');
    const app = new WebARApp(root) as unknown as {
      login(email: string, password: string): Promise<void>;
      logout(): Promise<void>;
      prepareMultiObject: () => Promise<void>;
      start(): Promise<void>;
    };
    app.prepareMultiObject = vi.fn(async () => undefined);

    await app.start();
    expect(window.location.hash).toBe('#/speech');

    await app.logout();
    expect(window.location.hash).toBe('#/');

    await app.login('maker@example.com', 'password');

    expect(window.location.hash).toBe('#/');
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(false);
  });

  it('clears the visible session immediately while remote logout is pending', async () => {
    let resolveRemoteLogout: () => void = () => undefined;
    authMocks.logout.mockReturnValue(new Promise<undefined>((resolve) => {
      resolveRemoteLogout = () => resolve(undefined);
    }));
    authMocks.getCurrentUser.mockResolvedValue(activeUser);
    const root = document.createElement('div');
    const app = new WebARApp(root) as unknown as {
      logout(): Promise<void>;
      prepareMultiObject: () => Promise<void>;
      start(): Promise<void>;
    };
    app.prepareMultiObject = vi.fn(async () => undefined);

    await app.start();
    expect(root.querySelector('.account-trigger-label')?.textContent).toBe('Hi, Maya Stone');

    const logoutPromise = app.logout();
    const labelWhileRemoteLogoutIsPending =
      root.querySelector('.account-trigger-label')?.textContent;
    const tokenWhileRemoteLogoutIsPending =
      window.localStorage.getItem('web-ar-auth-token');
    const routeWhileRemoteLogoutIsPending = window.location.hash;
    resolveRemoteLogout();
    await logoutPromise;

    expect(labelWhileRemoteLogoutIsPending).toBe('Account');
    expect(tokenWhileRemoteLogoutIsPending).toBeNull();
    expect(routeWhileRemoteLogoutIsPending).toBe('#/');
  });

  it('uses a replace-style HUD redirect when an action requires authentication', () => {
    const app = new WebARApp(document.createElement('div')) as unknown as {
      authToken: string | null;
      hud: {
        navigateToLogin: ReturnType<typeof vi.fn>;
        showAuthMessage: ReturnType<typeof vi.fn>;
      };
      requireAuthToken(message: string): string | null;
    };
    app.authToken = null;
    app.hud = {
      navigateToLogin: vi.fn(),
      showAuthMessage: vi.fn(),
    };

    expect(app.requireAuthToken('Sign in to continue.')).toBeNull();

    expect(app.hud.navigateToLogin).toHaveBeenCalledWith('Sign in to continue.');
  });
});
