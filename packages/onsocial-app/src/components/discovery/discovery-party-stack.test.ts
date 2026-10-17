import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('DiscoveryPartyStack lead', () => {
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
    expect(source).toContain("'Listed by'");
    expect(source).toContain("'Bought by'");
    expect(source).toContain('{name}');
    expect(source).not.toContain('`${lead} ${name}`');
    expect(css).toContain('grid-column: 1 / -1');
    expect(css).toContain('grid-row: 2 / span 2');
    expect(css).toContain('color: rgb(var(--fg-rgb) / 0.42)');
    expect(css).toMatch(/\.drops-discovery-lead \{[^}]*font-size: 0\.72rem;/s);
    const row = readFileSync(
      join(here, '../../features/market/market-listing-row.tsx'),
      'utf8'
    );
    expect(row).toContain('accountId={sellerId}');
    expect(row).toContain('lead="listed by"');
    expect(row).not.toContain('`Listed ${listedTime}`');
  });
});
