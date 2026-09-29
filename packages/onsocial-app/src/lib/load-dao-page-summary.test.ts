import { describe, expect, it } from 'vitest';
import {
  resolveDaoPortfolioSummary,
  type DaoPageData,
} from '@/lib/load-dao-page';

const LONG_PURPOSE =
  'We’re a community DAO that stewards shared infrastructure, funds public goods, and keeps the square crest honest for every builder who shows up to ship with us across seasons and years.';

function daoPage(
  description: string | null,
  purpose: string | null
): DaoPageData {
  return {
    branding: { description },
    configPurpose: purpose,
    configName: null,
    configMetadata: '',
  } as DaoPageData;
}

describe('resolveDaoPortfolioSummary', () => {
  it('shows a person bio ahead of a page tagline', () => {
    expect(
      resolveDaoPortfolioSummary({
        tagline: 'Welcome to my OnSocial page.',
        shellBio: 'Builder on NEAR',
        daoPage: null,
      })
    ).toBe('Builder on NEAR');
  });

  it('uses a real tagline only when the person bio is empty', () => {
    expect(
      resolveDaoPortfolioSummary({
        tagline: 'Essays and notes',
        shellBio: '  ',
        daoPage: null,
      })
    ).toBe('Essays and notes');
  });

  it('drops the stock activate tagline', () => {
    expect(
      resolveDaoPortfolioSummary({
        tagline: 'Welcome to my OnSocial page.',
        shellBio: '',
        daoPage: null,
      })
    ).toBeNull();
  });

  it('keeps a published DAO face ahead of a page tagline', () => {
    expect(
      resolveDaoPortfolioSummary({
        tagline: 'Welcome to my OnSocial page.',
        shellBio: LONG_PURPOSE,
        daoPage: daoPage('Stewards the square', LONG_PURPOSE),
      })
    ).toBe('Stewards the square');
  });

  it('clamps a DAO purpose onto the face when no published line exists', () => {
    const face = resolveDaoPortfolioSummary({
      tagline: 'A tagline',
      shellBio: null,
      daoPage: daoPage(null, LONG_PURPOSE),
    });
    expect(face).toBeTruthy();
    expect(face!.length).toBeLessThanOrEqual(160);
    expect(face).not.toBe('A tagline');
    expect(LONG_PURPOSE.startsWith(face!)).toBe(true);
  });
});
