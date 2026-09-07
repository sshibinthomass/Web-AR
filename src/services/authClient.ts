export type AuthRole = 'admin' | 'user';
export type AuthStatus = 'active' | 'pending';

export interface AuthUser {
  email: string;
  name?: string;
  role: AuthRole;
  status: AuthStatus;
}

export interface AuthSession {
  user: AuthUser;
  token: string | null;
}

interface AuthClientInput {
  apiUrl: string;
  fetchImpl?: typeof fetch;
}

interface SignupInput extends AuthClientInput {
  email: string;
  password: string;
  name?: string;
}

interface LoginInput extends AuthClientInput {
  email: string;
  password: string;
}

interface TokenInput extends AuthClientInput {
  token: string;
}

interface AccountInput extends TokenInput {
  email: string;
}

interface AuthResponse {
  user?: AuthUser;
  token?: string;
  error?: string;
}

interface UsersResponse {
  users?: AuthUser[];
  error?: string;
}

const authTokenStorageKey = 'web-ar-auth-token';

/** Every auth endpoint answers with `{ ...payload, error? }`, so one reader covers all of them. */
async function authRequest<T extends { error?: string }>(
  fetchImpl: typeof fetch,
  apiUrl: string,
  path: string,
  failure: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchImpl(`${authBaseUrl(apiUrl)}${path}`, init);
  const body = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(body.error ?? `${failure} failed with HTTP ${response.status}.`);
  }
  return body;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function jsonBearer(token: string): Record<string, string> {
  return { ...bearer(token), 'Content-Type': 'application/json' };
}

export async function signup({
  apiUrl,
  email,
  password,
  name,
  fetchImpl = fetch,
}: SignupInput): Promise<AuthSession> {
  const body = await authRequest<AuthResponse>(fetchImpl, apiUrl, '/signup', 'Auth request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      ...(name?.trim() ? { name: name.trim() } : {}),
    }),
  });
  return toAuthSession(body);
}

export async function login({ apiUrl, email, password, fetchImpl = fetch }: LoginInput): Promise<AuthSession> {
  const body = await authRequest<AuthResponse>(fetchImpl, apiUrl, '/login', 'Auth request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  return toAuthSession(body);
}

export async function getCurrentUser({ apiUrl, token, fetchImpl = fetch }: TokenInput): Promise<AuthUser | null> {
  if (!token) {
    return null;
  }

  const response = await fetchImpl(`${authBaseUrl(apiUrl)}/session`, { headers: bearer(token) });
  if (response.status === 401) {
    return null;
  }
  const body = (await response.json()) as AuthResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `Session failed with HTTP ${response.status}.`);
  }
  if (!body.user) {
    throw new Error('Worker response did not include the current user.');
  }
  return body.user;
}

export async function logout({ apiUrl, token, fetchImpl = fetch }: TokenInput): Promise<void> {
  if (!token) {
    return;
  }

  await authRequest(fetchImpl, apiUrl, '/logout', 'Logout', {
    method: 'POST',
    headers: bearer(token),
  });
}

export async function listAccounts({ apiUrl, token, fetchImpl = fetch }: TokenInput): Promise<AuthUser[]> {
  const body = await authRequest<UsersResponse>(fetchImpl, apiUrl, '/users', 'Account list', {
    headers: bearer(token),
  });
  return body.users ?? [];
}

export async function approveAccount({ apiUrl, email, token, fetchImpl = fetch }: AccountInput): Promise<AuthUser> {
  const body = await authRequest<AuthResponse>(
    fetchImpl,
    apiUrl,
    `/users/${encodeURIComponent(email.trim().toLowerCase())}`,
    'Account approval',
    {
      method: 'PATCH',
      headers: jsonBearer(token),
      body: JSON.stringify({ status: 'active' }),
    },
  );
  if (!body.user) {
    throw new Error('Worker response did not include the approved account.');
  }
  return body.user;
}

export async function removeAccount({ apiUrl, email, token, fetchImpl = fetch }: AccountInput): Promise<void> {
  await authRequest(
    fetchImpl,
    apiUrl,
    `/users/${encodeURIComponent(email.trim().toLowerCase())}`,
    'Account removal',
    { method: 'DELETE', headers: bearer(token) },
  );
}

export function saveAuthToken(token: string): void {
  window.localStorage.setItem(authTokenStorageKey, token);
}

export function loadAuthToken(): string | null {
  return window.localStorage.getItem(authTokenStorageKey);
}

export function clearAuthToken(): void {
  window.localStorage.removeItem(authTokenStorageKey);
}

function toAuthSession(body: AuthResponse): AuthSession {
  if (!body.user) {
    throw new Error('Worker response did not include a user.');
  }
  return { user: body.user, token: body.token ?? null };
}

function authBaseUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('Worker API URL is not configured.');
  }
  return trimmed.replace(/\/generate-3d$/, '') + '/auth';
}
