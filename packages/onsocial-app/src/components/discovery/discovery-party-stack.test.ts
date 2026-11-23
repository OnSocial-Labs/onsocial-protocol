import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('DiscoveryPartyStack lead', () => {
  it('shell-loads the avatar until the face is known (Market / Drops align)', () => {
    const source = readFileSync(
      join(here, 'discovery-party-stack.tsx'),
      'utf8'
    );
    expect(source).toContain('shellLoading={!src && !faceResolved}');
    expect(source).toContain('avatarUrl === undefined');
    expect(source).toContain('usePostAuthorProfiles');
    expect(source).toContain('arePostAuthorProfilesResolved');
  });

  it('puts the verb above the name in the quiet repost voice', () => {
    const source = readFileSync(
      join(here, 'discovery-party-stack.tsx'),
      'utf8'
    );
    const css = readFileSync(join(here, '../../app/globals.css'), 'utf8');
    const leadAt = source.indexOf('drops-discovery-lead');
    const nameAt = source.indexOf('drops-discovery-by');
    expect(leadAt).toBeGreaterThan(-1);
    expect(nameAt).toBeGreaterThan(leadAt);
    expect(source).toContain('{leadText}');
    expect(source).toContain('lead?: string | false');
    expect(source).toContain('{name}');
    expect(source).toContain('link = true');
    expect(source).toContain('if (!link)');
    expect(source).not.toContain('`${lead} ${name}`');
    expect(css).toContain('grid-column: 1 / -1');
    expect(css).toContain('grid-row: 2 / span 2');
    expect(css).toContain('color: rgb(var(--fg-rgb) / 0.42)');
    expect(css).not.toContain(
      '.drops-discovery-party:hover .drops-discovery-lead'
    );
    expect(css).toMatch(
      /\.drops-discovery-lead \{[^}]*font-size: var\(--os-stamp-size, 0\.75rem\);/s
    );
    const row = readFileSync(
      join(here, '../../features/market/market-listing-row.tsx'),
      'utf8'
    );
    expect(row).toContain('accountId={sellerId}');
    expect(row).toContain("role: 'listed'");
    expect(row).not.toContain('`Listed ${listedTime}`');
  });
});
