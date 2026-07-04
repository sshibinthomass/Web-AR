import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approveAccount,
  clearAuthToken,
  getCurrentUser,
  listAccounts,
  loadAuthToken,
  login,
  logout,
  removeAccount,
  saveAuthToken,
  signup,
} from '../../src/services/authClient';

describe('authClient', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates an account through the Worker auth endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { email: 'maker@example.com', name: 'Maker', role: 'user', status: 'pending' },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const session = await signup({
      apiUrl: 'https://worker.example/generate-3d',
      email: ' maker@example.com ',
      password: 'maker-password-123',
      name: ' Maker ',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/auth/signup',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'maker@example.com',
          password: 'maker-password-123',
          name: 'Maker',
        }),
      }),
    );
    expect(session).toEqual({
      user: { email: 'maker@example.com', name: 'Maker', role: 'user', status: 'pending' },
      token: null,
    });
  });

  it('logs in and returns the approved user token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'signed-token',
          user: { email: 'sshibinthomass@gmail.com', role: 'admin', status: 'active' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const session = await login({
      apiUrl: 'https://worker.example/generate-3d',
      email: 'sshibinthomass@gmail.com',
      password: 'admin-password-123',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(session).toEqual({
      token: 'signed-token',
      user: { email: 'sshibinthomass@gmail.com', role: 'admin', status: 'active' },
    });
  });

  it('stores, loads, and clears the local auth token', () => {
    saveAuthToken('signed-token');

    expect(loadAuthToken()).toBe('signed-token');

    clearAuthToken();

    expect(loadAuthToken()).toBeNull();
  });

  it('loads the current user with a bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { email: 'maker@example.com', role: 'user', status: 'active' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const user = await getCurrentUser({
      apiUrl: 'https://worker.example/generate-3d',
      token: 'signed-token',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/auth/session',
      expect.objectContaining({
        headers: { Authorization: 'Bearer signed-token' },
      }),
    );
    expect(user).toEqual({ email: 'maker@example.com', role: 'user', status: 'active' });
  });

  it('logs out through the Worker so the session can be revoked server-side', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await logout({
      apiUrl: 'https://worker.example/generate-3d',
      token: 'signed-token',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/auth/logout',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer signed-token' },
      }),
    );
  });

  it('lists, approves, and removes accounts through admin endpoints', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            users: [{ email: 'maker@example.com', role: 'user', status: 'pending' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { email: 'maker@example.com', role: 'user', status: 'active' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true, email: 'maker@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    await expect(
      listAccounts({ apiUrl: 'https://worker.example/generate-3d', token: 'admin-token', fetchImpl }),
    ).resolves.toEqual([{ email: 'maker@example.com', role: 'user', status: 'pending' }]);
    await expect(
      approveAccount({
        apiUrl: 'https://worker.example/generate-3d',
        email: 'maker@example.com',
        token: 'admin-token',
        fetchImpl,
      }),
    ).resolves.toEqual({ email: 'maker@example.com', role: 'user', status: 'active' });
    await expect(
      removeAccount({
        apiUrl: 'https://worker.example/generate-3d',
        email: 'maker@example.com',
        token: 'admin-token',
        fetchImpl,
      }),
    ).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://worker.example/auth/users',
      expect.objectContaining({ headers: { Authorization: 'Bearer admin-token' } }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://worker.example/auth/users/maker%40example.com',
      expect.objectContaining({
        method: 'PATCH',
        headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'https://worker.example/auth/users/maker%40example.com',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer admin-token' },
      }),
    );
  });
});
