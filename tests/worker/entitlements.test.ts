import { describe, expect, it } from 'vitest';
import {
  FEATURE_KEYS,
  normalizeEntitlementOverrides,
  normalizePlanId,
  resolveAccountAccess,
  resolveEffectiveEntitlements,
} from '../../worker/src/entitlements';

describe('Mark-AR entitlements', () => {
  it('assigns legacy and new non-admin users the Starter defaults', () => {
    const access = resolveEffectiveEntitlements({ role: 'user' });

    expect(access).toEqual({
      plan: 'starter',
      features: {
        scan: true,
        target_create: true,
        target_edit: true,
        target_delete: true,
        model_objects: true,
        text_objects: true,
        groups: false,
        animations: false,
        share_link: true,
        share_signed_in: false,
        share_specific_accounts: false,
        scan_links: true,
        floor_placement: false,
      },
      maxTargets: 3,
      maxObjectsPerTarget: 1,
    });
  });

  it('defines increasing Creator and Studio limits with advanced features enabled', () => {
    expect(resolveEffectiveEntitlements({ role: 'user', plan: 'creator' })).toMatchObject({
      plan: 'creator',
      maxTargets: 25,
      maxObjectsPerTarget: 3,
      features: {
        groups: true,
        animations: true,
        share_signed_in: true,
        share_specific_accounts: true,
        floor_placement: true,
      },
    });
    expect(resolveEffectiveEntitlements({ role: 'user', plan: 'studio' })).toMatchObject({
      plan: 'studio',
      maxTargets: 100,
      maxObjectsPerTarget: 10,
    });
  });

  it('gives administrators all features and effectively unlimited quotas', () => {
    const access = resolveEffectiveEntitlements({
      role: 'admin',
      plan: 'starter',
      entitlementOverrides: {
        features: { scan: false, target_create: false },
        maxTargets: 0,
        maxObjectsPerTarget: 0,
      },
    });

    expect(Object.values(access.features).every(Boolean)).toBe(true);
    expect(access).toMatchObject({
      plan: 'admin',
      maxTargets: null,
      maxObjectsPerTarget: null,
    });
  });

  it('merges independent Boolean and quota overrides over a plan', () => {
    const access = resolveEffectiveEntitlements({
      role: 'user',
      plan: 'starter',
      entitlementOverrides: {
        features: {
          animations: true,
          text_objects: false,
        },
        maxTargets: 8,
        maxObjectsPerTarget: 12,
      },
    });

    expect(access.features.animations).toBe(true);
    expect(access.features.text_objects).toBe(false);
    expect(access.features.groups).toBe(false);
    expect(access.maxTargets).toBe(8);
    expect(access.maxObjectsPerTarget).toBe(12);
  });

  it('normalizes only known override fields and clamps numeric quotas', () => {
    expect(normalizeEntitlementOverrides({
      features: {
        scan: false,
        groups: true,
        made_up: true,
        animations: null,
      },
      maxTargets: 100_000,
      maxObjectsPerTarget: -8,
      role: 'admin',
    })).toEqual({
      features: {
        scan: false,
        groups: true,
      },
      maxTargets: 10_000,
      maxObjectsPerTarget: 0,
    });
  });

  it('normalizes plan identifiers and exposes the complete feature-key contract', () => {
    expect(normalizePlanId(' creator ')).toBe('creator');
    expect(normalizePlanId('enterprise')).toBeNull();
    expect(FEATURE_KEYS).toEqual([
      'scan',
      'target_create',
      'target_edit',
      'target_delete',
      'model_objects',
      'text_objects',
      'groups',
      'animations',
      'share_link',
      'share_signed_in',
      'share_specific_accounts',
      'scan_links',
      'floor_placement',
    ]);
  });

  it('calculates operational, over-quota, pending, disabled, and admin account access', () => {
    const starter = resolveEffectiveEntitlements({ role: 'user', plan: 'starter' });

    expect(resolveAccountAccess({ role: 'user', status: 'active' }, starter, 3)).toEqual({
      state: 'operational',
      locked: false,
      targetCount: 3,
      maxTargets: 3,
      excessTargets: 0,
    });
    expect(resolveAccountAccess({ role: 'user', status: 'active' }, starter, 5)).toEqual({
      state: 'over_quota',
      locked: true,
      targetCount: 5,
      maxTargets: 3,
      excessTargets: 2,
    });
    expect(resolveAccountAccess({ role: 'user', status: 'pending' }, starter, 0)).toMatchObject({
      state: 'pending',
      locked: true,
    });
    expect(resolveAccountAccess({ role: 'user', status: 'disabled' }, starter, 0)).toMatchObject({
      state: 'disabled',
      locked: true,
    });
    expect(resolveAccountAccess(
      { role: 'admin', status: 'active' },
      resolveEffectiveEntitlements({ role: 'admin' }),
      50_000,
    )).toMatchObject({
      state: 'operational',
      locked: false,
      maxTargets: null,
      excessTargets: 0,
    });
  });
});
