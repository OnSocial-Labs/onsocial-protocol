import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  StandingIdentity,
  standingIdentityAccountCopy,
  standingIdentityLabel,
} from './standing-identity.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('standingIdentityLabel', () => {
  it('speaks the local part when no custom name', () => {
    expect(standingIdentityLabel('alice.near')).toEqual({
      name: 'Alice',
      label: 'Alice',
      handle: 'alice.near',
    });
    expect(standingIdentityLabel('alice.tg')).toEqual({
      name: 'Alice',
      label: 'Alice',
      handle: 'alice.tg',
    });
  });

  it('shows custom name and keeps handle separate', () => {
    expect(standingIdentityLabel('alice.near', ' Alice ')).toEqual({
      name: 'Alice',
      label: 'Alice',
      handle: 'alice.near',
    });
  });

  it('strips id-as-name so the handle row still shows', () => {
    expect(standingIdentityLabel('alice.near', 'alice.near')).toEqual({
      name: 'Alice',
      label: 'Alice',
      handle: 'alice.near',
    });
  });
});

describe('standingIdentityAccountCopy', () => {
  it('returns quiet @handle for sheet copy', () => {
    expect(standingIdentityAccountCopy('berrysamba.testnet')).toBe(
      '@berrysamba.testnet'
    );
  });

  it('trims and keeps network suffix', () => {
    expect(standingIdentityAccountCopy('  alice.near  ')).toBe('@alice.near');
  });

  it('returns empty for blank account', () => {
    expect(standingIdentityAccountCopy('')).toBe('');
    expect(standingIdentityAccountCopy('   ')).toBe('');
  });
});

describe('StandingIdentity', () => {
  it('exports the identity cluster', () => {
    expect(typeof StandingIdentity).toBe('function');
  });

  it('accepts an optional avatar badge slot', () => {
    const source = readFileSync(join(here, 'standing-identity.tsx'), 'utf8');
    expect(source).toContain('avatarBadge');
    expect(source).toContain('standing-row-avatar-wrap');
    expect(source).toContain('standing-row-avatar-badge');
  });
});
