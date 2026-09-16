import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const loadDaoPage = readFileSync(join(here, 'load-dao-page.ts'), 'utf8');
const workspace = readFileSync(
  join(here, '../features/protocol/dao-workspace-panel.tsx'),
  'utf8'
);
const chrome = readFileSync(
  join(here, '../components/portfolio/portfolio-dao-org-chrome.tsx'),
  'utf8'
);

describe('DAO portfolio face freshness', () => {
  it('prefers live get_config over catalog for Sputnik branding', () => {
    expect(loadDaoPage).toContain('getProtocolDaoConfig(accountId)');
    expect(loadDaoPage).toMatch(
      /Live chain wins[\s\S]*configFromCatalogRow\(catalogRow\)/
    );
  });

  it('refreshes the portfolio face after Approved and when leaving proposals', () => {
    expect(workspace).toContain('invalidateDaoPortfolioFaceCaches');
    expect(workspace).toContain('refreshPortfolioFaceIfApproved');
    expect(workspace).toContain("status !== 'Approved'");
    expect(workspace).toContain('router.refresh()');
    expect(chrome).toContain('invalidateDaoPortfolioFaceCaches');
    expect(chrome).toContain('router.refresh()');
  });
});
