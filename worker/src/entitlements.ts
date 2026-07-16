export const PLAN_IDS = ['starter', 'creator', 'studio'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type EffectivePlanId = PlanId | 'admin';

export const FEATURE_KEYS = [
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
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureEntitlements = Record<FeatureKey, boolean>;

export type EntitlementOverrides = {
  features?: Partial<Record<FeatureKey, boolean>>;
  maxTargets?: number;
  maxObjectsPerTarget?: number;
};

export type EffectiveEntitlements = {
  plan: EffectivePlanId;
  features: FeatureEntitlements;
  maxTargets: number | null;
  maxObjectsPerTarget: number | null;
};

export type AccountStatus = 'active' | 'pending' | 'disabled';
export type AccountAccessState = 'operational' | 'over_quota' | 'pending' | 'disabled';

export type AccountAccess = {
  state: AccountAccessState;
  locked: boolean;
  targetCount: number;
  maxTargets: number | null;
  excessTargets: number;
};

type EntitlementSubject = {
  role: 'admin' | 'user';
  plan?: PlanId;
  entitlementOverrides?: EntitlementOverrides;
};

type AccountSubject = {
  role: 'admin' | 'user';
  status: AccountStatus;
};

const starterFeatures: FeatureEntitlements = {
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
};

const advancedFeatures: FeatureEntitlements = Object.fromEntries(
  FEATURE_KEYS.map((key) => [key, true]),
) as FeatureEntitlements;

const planDefaults: Record<PlanId, Omit<EffectiveEntitlements, 'plan'>> = {
  starter: {
    features: starterFeatures,
    maxTargets: 3,
    maxObjectsPerTarget: 3,
  },
  creator: {
    features: advancedFeatures,
    maxTargets: 25,
    maxObjectsPerTarget: 10,
  },
  studio: {
    features: advancedFeatures,
    maxTargets: 100,
    maxObjectsPerTarget: 30,
  },
};

const quotaMaximum = 10_000;

export function normalizePlanId(value: unknown): PlanId | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return PLAN_IDS.includes(normalized as PlanId) ? normalized as PlanId : null;
}

export function normalizeEntitlementOverrides(value: unknown): EntitlementOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const normalized: EntitlementOverrides = {};
  if (input.features && typeof input.features === 'object' && !Array.isArray(input.features)) {
    const featureInput = input.features as Record<string, unknown>;
    const features: Partial<Record<FeatureKey, boolean>> = {};
    for (const key of FEATURE_KEYS) {
      if (typeof featureInput[key] === 'boolean') {
        features[key] = featureInput[key];
      }
    }
    if (Object.keys(features).length > 0) {
      normalized.features = features;
    }
  }

  const maxTargets = normalizeQuota(input.maxTargets);
  if (maxTargets !== null) {
    normalized.maxTargets = maxTargets;
  }
  const maxObjectsPerTarget = normalizeQuota(input.maxObjectsPerTarget);
  if (maxObjectsPerTarget !== null) {
    normalized.maxObjectsPerTarget = maxObjectsPerTarget;
  }

  return normalized;
}

export function resolveEffectiveEntitlements(subject: EntitlementSubject): EffectiveEntitlements {
  if (subject.role === 'admin') {
    return {
      plan: 'admin',
      features: { ...advancedFeatures },
      maxTargets: null,
      maxObjectsPerTarget: null,
    };
  }

  const plan = subject.plan ?? 'starter';
  const defaults = planDefaults[plan] ?? planDefaults.starter;
  const overrides = normalizeEntitlementOverrides(subject.entitlementOverrides);
  return {
    plan,
    features: {
      ...defaults.features,
      ...(overrides.features ?? {}),
    },
    maxTargets: overrides.maxTargets ?? defaults.maxTargets,
    maxObjectsPerTarget: overrides.maxObjectsPerTarget ?? defaults.maxObjectsPerTarget,
  };
}

export function resolveAccountAccess(
  subject: AccountSubject,
  entitlements: EffectiveEntitlements,
  targetCount: number,
): AccountAccess {
  const normalizedTargetCount = Math.max(0, Math.trunc(targetCount));
  if (subject.role === 'admin') {
    return {
      state: 'operational',
      locked: false,
      targetCount: normalizedTargetCount,
      maxTargets: null,
      excessTargets: 0,
    };
  }
  if (subject.status === 'pending') {
    return {
      state: 'pending',
      locked: true,
      targetCount: normalizedTargetCount,
      maxTargets: entitlements.maxTargets,
      excessTargets: 0,
    };
  }
  if (subject.status === 'disabled') {
    return {
      state: 'disabled',
      locked: true,
      targetCount: normalizedTargetCount,
      maxTargets: entitlements.maxTargets,
      excessTargets: 0,
    };
  }

  const maxTargets = entitlements.maxTargets;
  const excessTargets = maxTargets === null
    ? 0
    : Math.max(0, normalizedTargetCount - maxTargets);
  return {
    state: excessTargets > 0 ? 'over_quota' : 'operational',
    locked: excessTargets > 0,
    targetCount: normalizedTargetCount,
    maxTargets,
    excessTargets,
  };
}

function normalizeQuota(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(quotaMaximum, Math.max(0, Math.trunc(value)));
}
