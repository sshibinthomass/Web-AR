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

export async function signup({
  apiUrl,
  email,
  password,
  name,
  fetchImpl = fetch,
}: SignupInput): Promise<AuthSession> {
  const response = await fetchImpl(`${authBaseUrl(apiUrl)}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      ...(name?.trim() ? { name: name.trim() } : {}),
    }),
  });
  return parseAuthSessionResponse(response);
}

export async function login({ apiUrl, email, password, fetchImpl = fetch }: LoginInput): Promise<AuthSession> {
  const response = await fetchImpl(`${authBaseUrl(apiUrl)}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });
  return parseAuthSessionResponse(response);
}

export async function getCurrentUser({ apiUrl, token, fetchImpl = fetch }: TokenInput): Promise<AuthUser | null> {
  if (!token) {
    return null;
  }

  const response = await fetchImpl(`${authBaseUrl(apiUrl)}/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

export async function listAccounts({ apiUrl, token, fetchImpl = fetch }: TokenInput): Promise<AuthUser[]> {
  const response = await fetchImpl(`${authBaseUrl(apiUrl)}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as UsersResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `Account list failed with HTTP ${response.status}.`);
  }
  return body.users ?? [];
}

export async function approveAccount({ apiUrl, email, token, fetchImpl = fetch }: AccountInput): Promise<AuthUser> {
  const response = await fetchImpl(`${authBaseUrl(apiUrl)}/users/${encodeURIComponent(email.trim().toLowerCase())}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'active' }),
  });
  const body = (await response.json()) as AuthResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `Account approval failed with HTTP ${response.status}.`);
  }
  if (!body.user) {
    throw new Error('Worker response did not include the approved account.');
  }
  return body.user;
}

export async function removeAccount({ apiUrl, email, token, fetchImpl = fetch }: AccountInput): Promise<void> {
  const response = await fetchImpl(`${authBaseUrl(apiUrl)}/users/${encodeURIComponent(email.trim().toLowerCase())}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Account removal failed with HTTP ${response.status}.`);
  }
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

async function parseAuthSessionResponse(response: Response): Promise<AuthSession> {
  const body = (await response.json()) as AuthResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `Auth request failed with HTTP ${response.status}.`);
  }
  if (!body.user) {
    throw new Error('Worker response did not include a user.');
  }
  return {
    user: body.user,
    token: body.token ?? null,
  };
}

function authBaseUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('Worker API URL is not configured.');
  }
  return trimmed.replace(/\/generate-3d(?:\/openai)?$/, '') + '/auth';
}
