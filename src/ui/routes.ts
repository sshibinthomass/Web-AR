import type { AuthUser } from '../services/authClient';

export type HudRoute =
  | 'home'
  | 'camera'
  | 'upload'
  | 'upload-model'
  | 'ar'
  | 'full-flow'
  | 'dynamic'
  | 'speech'
  | 'multi-object'
  | 'models'
  | 'login'
  | 'admin';

export type CameraCaptureRoute = 'camera' | 'full-flow' | 'dynamic';
export type PhotoToARRoute = 'full-flow' | 'dynamic';

export type NavigationSection = 'home' | 'create' | 'models' | 'ar' | 'account';
export type RouteShell = 'standard' | 'immersive';

export interface RouteMeta {
  hash: string;
  title: string;
  shortTitle: string;
  section: NavigationSection;
  parent: HudRoute;
  requiresAuth: boolean;
  requiresAdmin: boolean;
  shell: RouteShell;
  initialStatus: string;
}

export const ROUTES: Record<HudRoute, RouteMeta> = {
  home: {
    hash: '#/',
    title: 'Home',
    shortTitle: 'Home',
    section: 'home',
    parent: 'home',
    requiresAuth: false,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Choose how you want to create or place a model.',
  },
  camera: {
    hash: '#/camera',
    title: 'Camera capture',
    shortTitle: 'Camera',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'immersive',
    initialStatus: 'Frame one object, then capture an image.',
  },
  upload: {
    hash: '#/upload',
    title: 'Image to 3D',
    shortTitle: 'Image',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Choose an image to create a 3D model.',
  },
  'upload-model': {
    hash: '#/upload-model',
    title: 'Upload model',
    shortTitle: 'Upload',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Choose a GLB model to add to your library.',
  },
  ar: {
    hash: '#/ar',
    title: 'Place in AR',
    shortTitle: 'AR',
    section: 'ar',
    parent: 'home',
    requiresAuth: false,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Choose a model to place in your space.',
  },
  'full-flow': {
    hash: '#/full-flow',
    title: 'Photo to AR',
    shortTitle: 'Photo to AR',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'immersive',
    initialStatus: 'Capture an object, generate it, then place it in AR.',
  },
  dynamic: {
    hash: '#/dynamic',
    title: 'AI photo to AR',
    shortTitle: 'AI photo',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'immersive',
    initialStatus: 'Capture an object for AI enhancement and AR placement.',
  },
  speech: {
    hash: '#/speech',
    title: 'Text or voice to 3D',
    shortTitle: 'Text / voice',
    section: 'create',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Describe one object by text or voice.',
  },
  'multi-object': {
    hash: '#/multi-object',
    title: 'Multi-object AR',
    shortTitle: 'Multi-object',
    section: 'ar',
    parent: 'home',
    requiresAuth: false,
    requiresAdmin: false,
    shell: 'immersive',
    initialStatus: 'Place multiple models in this session.',
  },
  models: {
    hash: '#/models',
    title: 'Models',
    shortTitle: 'Models',
    section: 'models',
    parent: 'home',
    requiresAuth: false,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Browse saved and uploaded models.',
  },
  login: {
    hash: '#/login',
    title: 'Account',
    shortTitle: 'Account',
    section: 'account',
    parent: 'home',
    requiresAuth: false,
    requiresAdmin: false,
    shell: 'standard',
    initialStatus: 'Sign in or create an account.',
  },
  admin: {
    hash: '#/admin',
    title: 'Admin',
    shortTitle: 'Admin',
    section: 'account',
    parent: 'home',
    requiresAuth: true,
    requiresAdmin: true,
    shell: 'standard',
    initialStatus: 'Manage accounts and generation jobs.',
  },
};

const routeByHash = new Map(
  Object.entries(ROUTES).map(([route, meta]) => [meta.hash, route as HudRoute]),
);

export function parseRouteHash(hash: string): HudRoute {
  return routeByHash.get(hash || '#/') ?? 'home';
}

export function routeHash(route: HudRoute): string {
  return ROUTES[route].hash;
}

export function isCameraCaptureRoute(
  route: HudRoute | null | undefined,
): route is CameraCaptureRoute {
  return route === 'camera' || route === 'full-flow' || route === 'dynamic';
}

export function isPhotoToARRoute(
  route: HudRoute | null | undefined,
): route is PhotoToARRoute {
  return route === 'full-flow' || route === 'dynamic';
}

export function routeCanOpen(route: HudRoute, user: AuthUser | null): boolean {
  const meta = ROUTES[route];
  if (meta.requiresAdmin) {
    return user?.status === 'active' && user.role === 'admin';
  }
  return !meta.requiresAuth || user?.status === 'active';
}
