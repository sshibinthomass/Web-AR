import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  isCameraCaptureRoute,
  isPhotoToARRoute,
  parseRouteHash,
  routeCanOpen,
  routeHash,
  type CameraCaptureRoute,
  type HudRoute,
  type PhotoToARRoute,
} from '../../src/ui/routes';

describe('route metadata', () => {
  it('maps every supported hash and falls back to home', () => {
    expect(parseRouteHash('#/speech')).toBe('speech');
    expect(parseRouteHash('#/upload-model')).toBe('upload-model');
    expect(parseRouteHash('#/unknown')).toBe('home');
    expect(routeHash('home')).toBe('#/');
    expect(routeHash('multi-object')).toBe('#/multi-object');
  });

  it('keeps public, protected, and admin access explicit', () => {
    expect(routeCanOpen('models', null)).toBe(true);
    expect(routeCanOpen('speech', null)).toBe(false);
    expect(routeCanOpen('speech', {
      email: 'maker@example.com',
      role: 'user',
      status: 'active',
    })).toBe(true);
    expect(routeCanOpen('admin', {
      email: 'maker@example.com',
      role: 'user',
      status: 'active',
    })).toBe(false);
    expect(routeCanOpen('admin', {
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
    })).toBe(true);
  });

  it('defines route-specific identity and fallback metadata', () => {
    expect(ROUTES.camera.title).toBe('Camera capture');
    expect(ROUTES['full-flow'].title).toBe('Photo to AR');
    expect(ROUTES.dynamic.title).toBe('AI photo to AR');
    expect(ROUTES.speech.parent).toBe('home');
    expect(ROUTES.camera.initialStatus).toBe('Frame one object, then capture an image.');
  });

  it('identifies every camera-capture route and excludes non-camera routes', () => {
    const expectedCameraRoutes: CameraCaptureRoute[] = ['camera', 'full-flow', 'dynamic'];
    const routes = Object.keys(ROUTES) as HudRoute[];

    expect(routes.filter(isCameraCaptureRoute)).toEqual(expectedCameraRoutes);
    expect(isCameraCaptureRoute('upload')).toBe(false);
    expect(isCameraCaptureRoute('ar')).toBe(false);
  });

  it('identifies only Photo-to-AR routes from the full route matrix', () => {
    const expectedPhotoToARRoutes: PhotoToARRoute[] = ['full-flow', 'dynamic'];
    const routes = Object.keys(ROUTES) as HudRoute[];

    expect(routes.filter(isPhotoToARRoute)).toEqual(expectedPhotoToARRoutes);
    expect(isPhotoToARRoute('camera')).toBe(false);
    expect(isPhotoToARRoute('upload')).toBe(false);
  });
});
