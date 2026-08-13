import { describe, expect, it } from 'vitest';
import { standingIdentityLabel } from '@/components/ui/standing-identity';

describe('standingIdentityLabel', () => {
  it('uses @handle as the primary label when no custom name', () => {
    expect(standingIdentityLabel('alice.near')).toEqual({
      name: null,
      label: '@alice.near',
      handle: 'alice.near',
    });
  });

  it('shows custom name and keeps handle separate', () => {
    expect(standingIdentityLabel('alice.near', ' Alice ')).toEqual({
      name: 'Alice',
      label: 'Alice',
      handle: 'alice.near',
    });
  });
});
