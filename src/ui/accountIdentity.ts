import type { AuthUser } from '../services/authClient';

export function getAccountDisplayName(
  user: Pick<AuthUser, 'name' | 'email'>,
): string {
  const name = user.name?.trim();
  if (name) {
    return name;
  }

  const localPart = user.email
    .split('@')[0]
    ?.split('+')[0]
    ?.replace(/[._-]+/g, ' ')
    .trim();

  if (!localPart) {
    return user.email;
  }

  return localPart
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
