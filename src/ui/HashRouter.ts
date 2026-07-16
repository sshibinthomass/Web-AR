import { parseRouteHash, ROUTES, routeHash, type HudRoute } from './routes';

type NavigationMode = 'push' | 'replace';
type RouteListener = (route: HudRoute) => void;

interface WebArHistoryState {
  webAr: true;
  depth: number;
  route: HudRoute;
}

function isWebArHistoryState(value: unknown): value is WebArHistoryState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as Partial<WebArHistoryState>;
  return state.webAr === true
    && typeof state.depth === 'number'
    && typeof state.route === 'string'
    && state.route in ROUTES;
}

export class HashRouter {
  private listener: RouteListener | null = null;
  private lastEmittedHash = '';
  private readonly handleLocationChange = () => this.emitLocation();

  constructor(private readonly targetWindow: Window) {}

  start(listener: RouteListener): void {
    this.listener = listener;
    const route = parseRouteHash(this.targetWindow.location.hash);
    const state = this.targetWindow.history.state;
    const depth = isWebArHistoryState(state) ? state.depth : 0;
    this.targetWindow.history.replaceState(
      { webAr: true, depth, route } satisfies WebArHistoryState,
      '',
      routeHash(route),
    );
    this.targetWindow.addEventListener('popstate', this.handleLocationChange);
    this.targetWindow.addEventListener('hashchange', this.handleLocationChange);
    this.lastEmittedHash = this.targetWindow.location.hash;
    listener(route);
  }

  navigate(route: HudRoute, mode: NavigationMode = 'push'): void {
    const hash = routeHash(route);
    const currentState = this.targetWindow.history.state;
    const depth = isWebArHistoryState(currentState) ? currentState.depth : 0;
    const nextState: WebArHistoryState = {
      webAr: true,
      depth: mode === 'push' && hash !== this.targetWindow.location.hash ? depth + 1 : depth,
      route,
    };

    if (mode === 'replace' || hash === this.targetWindow.location.hash) {
      this.targetWindow.history.replaceState(nextState, '', hash);
    } else {
      this.targetWindow.history.pushState(nextState, '', hash);
    }
    this.lastEmittedHash = hash;
    this.listener?.(route);
  }

  back(fallback: HudRoute): void {
    const state = this.targetWindow.history.state;
    if (isWebArHistoryState(state) && state.depth > 0) {
      this.targetWindow.history.back();
      return;
    }
    this.navigate(fallback, 'replace');
  }

  dispose(): void {
    this.targetWindow.removeEventListener('popstate', this.handleLocationChange);
    this.targetWindow.removeEventListener('hashchange', this.handleLocationChange);
    this.listener = null;
  }

  private emitLocation(): void {
    const hash = this.targetWindow.location.hash || '#/';
    if (hash === this.lastEmittedHash) {
      return;
    }

    this.lastEmittedHash = hash;
    const route = parseRouteHash(hash);
    const state = this.targetWindow.history.state;
    if (!isWebArHistoryState(state)) {
      this.targetWindow.history.replaceState(
        { webAr: true, depth: 0, route } satisfies WebArHistoryState,
        '',
        routeHash(route),
      );
    }
    this.listener?.(route);
  }
}
