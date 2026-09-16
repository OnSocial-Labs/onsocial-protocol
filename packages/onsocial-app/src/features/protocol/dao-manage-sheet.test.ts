import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'dao-manage-sheet.tsx'),
  'utf8'
);

describe('DaoManageSheet chrome', () => {
  it('uses ActionDrawer like guild Manage, not a custom surface-row hug', () => {
    expect(src).toContain('ActionDrawer');
    expect(src).toContain('os-sheet-cap-short');
    expect(src).not.toContain('OsHugSheet');
    expect(src).not.toContain('OsSurfaceRow');
  });

  it('splits Edit (config) from Publish OnSocial / Call actions', () => {
    expect(src).toContain("'publish-social'");
    expect(src).toContain('Publish OnSocial profile');
    expect(src).toContain('canProposeCall');
    expect(src).toContain('Cover, crest, name, face, and About (config)');
    expect(src).toMatch(/canEdit[\s\S]*run\('edit'\)/);
    expect(src).toMatch(/canProposeCall[\s\S]*run\('publish-social'\)/);
  });
});
