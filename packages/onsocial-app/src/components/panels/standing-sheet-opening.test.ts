import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('StandingSheetOpening soft-open handoff', () => {
  it('passes the glass-host accountId and drops listPreview after first paint', () => {
    const opening = readFileSync(
      join(here, 'standing-sheet-opening.tsx'),
      'utf8'
    );
    const host = readFileSync(
      join(here, '../overlay/portfolio-glass-host.tsx'),
      'utf8'
    );

    expect(opening).toContain('accountIdProp');
    expect(opening).toContain('requestAnimationFrame');
    expect(opening).toContain('listPreview={!live}');
    expect(opening).not.toMatch(/listPreview\s*\n\s*\/>/);
    expect(host).toContain(
      '<StandingSheetOpening accountId={accountId} />'
    );
  });
});
