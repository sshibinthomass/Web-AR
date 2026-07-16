import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationCoordinator } from '../../worker/src/index';

function createState() {
  const values = new Map<string, unknown>();
  return {
    storage: {
      get: vi.fn(async <T>(key: string) => values.get(key) as T | undefined),
      put: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        values.delete(key);
      }),
    },
    blockConcurrencyWhile: async <T>(operation: () => Promise<T>) => operation(),
  };
}

function leaseRequest(body: unknown): Request {
  return new Request('https://coordinator.internal/lease', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('MutationCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows one active lease and rejects a competing mutation', async () => {
    const coordinator = new MutationCoordinator(createState() as never);

    const first = await coordinator.fetch(leaseRequest({
      action: 'acquire',
      leaseId: 'lease-one',
      ttlMs: 30_000,
    }));
    const competing = await coordinator.fetch(leaseRequest({
      action: 'acquire',
      leaseId: 'lease-two',
      ttlMs: 30_000,
    }));

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ acquired: true });
    expect(competing.status).toBe(409);
    expect(await competing.json()).toEqual({ acquired: false });
  });

  it('only releases the matching lease and permits acquisition after release', async () => {
    const coordinator = new MutationCoordinator(createState() as never);

    await coordinator.fetch(leaseRequest({
      action: 'acquire',
      leaseId: 'lease-one',
      ttlMs: 30_000,
    }));
    const wrongRelease = await coordinator.fetch(leaseRequest({
      action: 'release',
      leaseId: 'lease-two',
    }));
    const correctRelease = await coordinator.fetch(leaseRequest({
      action: 'release',
      leaseId: 'lease-one',
    }));
    const next = await coordinator.fetch(leaseRequest({
      action: 'acquire',
      leaseId: 'lease-two',
      ttlMs: 30_000,
    }));

    expect(wrongRelease.status).toBe(409);
    expect(correctRelease.status).toBe(200);
    expect(next.status).toBe(200);
  });

  it('expires abandoned leases', async () => {
    const coordinator = new MutationCoordinator(createState() as never);

    await coordinator.fetch(leaseRequest({
      action: 'acquire',
      leaseId: 'lease-one',
      ttlMs: 1000,
    }));
    vi.advanceTimersByTime(1001);
    const next = await coordinator.fetch(leaseRequest({
      action: 'acquire',
      leaseId: 'lease-two',
      ttlMs: 30_000,
    }));

    expect(next.status).toBe(200);
  });

  it('rejects malformed lease requests', async () => {
    const coordinator = new MutationCoordinator(createState() as never);

    const response = await coordinator.fetch(leaseRequest({
      action: 'acquire',
      leaseId: '',
      ttlMs: 30_000,
    }));

    expect(response.status).toBe(400);
  });
});
