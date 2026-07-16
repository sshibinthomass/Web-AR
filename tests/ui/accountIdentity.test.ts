import { describe, expect, it } from 'vitest';
import { getAccountDisplayName } from '../../src/ui/accountIdentity';

describe('getAccountDisplayName', () => {
  it('prefers a trimmed account name', () => {
    expect(getAccountDisplayName({
      email: 'maker@example.com',
      name: '  Maya Stone  ',
    })).toBe('Maya Stone');
  });

  it('turns an email prefix into a readable fallback name', () => {
    expect(getAccountDisplayName({
      email: 'maya.stone+ar@example.com',
    })).toBe('Maya Stone');
  });
});
