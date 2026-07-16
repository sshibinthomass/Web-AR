import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter } from '../../src/ui/HashRouter';

describe('HashRouter', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('pushes forward routes and replaces redirects', () => {
    const routes: string[] = [];
    const router = new HashRouter(window);
    router.start((route) => routes.push(route));

    router.navigate('models');
    expect(window.location.hash).toBe('#/models');
    expect(window.history.state).toMatchObject({ webAr: true, depth: 1, route: 'models' });

    router.navigate('login', 'replace');
    expect(window.location.hash).toBe('#/login');
    expect(window.history.state).toMatchObject({ webAr: true, depth: 1, route: 'login' });
    expect(routes).toEqual(['home', 'models', 'login']);

    router.dispose();
  });

  it('uses browser history for an in-app back and replaces a direct-entry fallback', () => {
    const router = new HashRouter(window);
    router.start(() => undefined);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    router.navigate('models');
    router.back('home');
    expect(back).toHaveBeenCalledOnce();
    router.dispose();

    window.history.replaceState(null, '', '/#/speech');
    const directRouter = new HashRouter(window);
    directRouter.start(() => undefined);
    directRouter.back('home');
    expect(window.location.hash).toBe('#/');
    expect(window.history.state).toMatchObject({ depth: 0, route: 'home' });
    directRouter.dispose();
  });

  it('emits browser-driven route changes once', () => {
    const listener = vi.fn();
    const router = new HashRouter(window);
    router.start(listener);
    window.history.pushState({ webAr: true, depth: 1, route: 'ar' }, '', '#/ar');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));

    expect(listener).toHaveBeenLastCalledWith('ar');
    expect(listener).toHaveBeenCalledTimes(2);

    router.dispose();
  });
});
