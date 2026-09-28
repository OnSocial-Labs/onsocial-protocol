import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/app-config';
import { EMPTY_PORTFOLIO_DAO_CONTEXT } from '@/lib/load-dao-page';
import {
  loadPortfolioHeroDaoContext,
  portfolioHeroAwaitsDaoContext,
  portfolioHeroAwaitsSignals,
} from '@/lib/portfolio-hero-path';

const libDir = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(
  join(libDir, '../app/[accountId]/page.tsx'),
  'utf8'
);
const faceSrc = readFileSync(
  join(libDir, '../components/portfolio/portfolio-account-face.tsx'),
  'utf8'
);
const aboutSrc = readFileSync(
  join(libDir, 'load-portfolio-about.ts'),
  'utf8'
);

describe('portfolio hero path', () => {
  it('keeps DAO catalog + signals on the hero path for org faces', () => {
    expect(
      portfolioHeroAwaitsDaoContext('demo.sputnik-dao.near')
    ).toBe(true);
    expect(
      portfolioHeroAwaitsSignals(GOVERNANCE_DAO_ACCOUNT)
    ).toBe(true);
  });

  it('skips DAO catalog and signals wait for person-shaped ids', () => {
    expect(portfolioHeroAwaitsDaoContext('alice.near')).toBe(false);
    expect(portfolioHeroAwaitsSignals('alice.near')).toBe(false);
  });

  it('returns an empty DAO context without a catalog hop for people', async () => {
    await expect(
      loadPortfolioHeroDaoContext('alice.near', null)
    ).resolves.toEqual(EMPTY_PORTFOLIO_DAO_CONTEXT);
  });

  it('streams person signals and does not await jobs on the account page', () => {
    expect(pageSrc).toContain('PortfolioAccountFace');
    expect(faceSrc).toContain('loadPortfolioHeroDaoContext');
    expect(faceSrc).toContain('PortfolioDeferredSignals');
    expect(faceSrc).toContain('PortfolioDeferredProfileSeed');
    expect(faceSrc).toContain('portfolioHeroAwaitsSignals');
    expect(faceSrc).not.toContain('jobs.openForAccount');
    expect(pageSrc).not.toContain('jobs.openForAccount');
    expect(aboutSrc).toContain('loadPortfolioHeroDaoContext');
  });
});
