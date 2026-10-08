import { describe, expect, it } from 'vitest';
import {
  assertCanApplyPageMood,
  isPageMoodUnlocked,
  isPremiumMoodAvailable,
  mergePageMoodUnlockIntoPageConfig,
  parsePageMoodUnlocks,
  premiumMoodPriceYocto,
} from './premium-moods.js';
import { PAGE_MOOD_CATALOG, pageMoodPresetForId } from './moods.js';

describe('premium page moods', () => {
  it('converts whole SOCIAL prices to yocto', () => {
    expect(premiumMoodPriceYocto('100')).toBe('100000000000000000000');
    expect(premiumMoodPriceYocto('0.01')).toBe('10000000000000000');
  });

  it('records unlock receipts on page config', () => {
    const next = mergePageMoodUnlockIntoPageConfig({}, 'summer', {
      now: 123,
      purchaseTxHash: 'abc',
    });

    expect(next.moodUnlocks).toEqual({
      summer: { since: 123, purchaseTxHash: 'abc' },
    });
  });

  it('does not duplicate unlock receipts', () => {
    const current = {
      moodUnlocks: { summer: { since: 100 } },
    };
    const next = mergePageMoodUnlockIntoPageConfig(current, 'summer', {
      now: 200,
    });

    expect(next).toBe(current);
  });

  it('gates premium moods until unlocked', () => {
    expect(isPageMoodUnlocked({}, 'summer', PAGE_MOOD_CATALOG)).toBe(false);
    expect(
      isPageMoodUnlocked(
        { moodUnlocks: { summer: { since: 1 } } },
        'summer',
        PAGE_MOOD_CATALOG
      )
    ).toBe(true);
    expect(() =>
      assertCanApplyPageMood(
        {},
        'summer',
        PAGE_MOOD_CATALOG,
        (id) => pageMoodPresetForId(id).label
      )
    ).toThrow(/Unlock Summer for 100 SOCIAL/);
  });

  it('parses unlock receipts from page config', () => {
    expect(
      parsePageMoodUnlocks({
        moodUnlocks: {
          summer: { since: 1, purchaseTxHash: 'tx' },
          bad: { purchaseTxHash: 'missing since' } as never,
        },
      })
    ).toEqual({ summer: { since: 1, purchaseTxHash: 'tx' } });
  });

  it('respects calendar-season availability windows', () => {
    const summer = PAGE_MOOD_CATALOG.summer;
    expect(isPremiumMoodAvailable(summer, Date.parse('2026-05-31'))).toBe(
      false
    );
    expect(isPremiumMoodAvailable(summer, Date.parse('2026-06-01'))).toBe(true);
    expect(isPremiumMoodAvailable(summer, Date.parse('2026-08-15'))).toBe(true);
    expect(isPremiumMoodAvailable(summer, Date.parse('2026-09-01'))).toBe(
      false
    );
    const autumn = PAGE_MOOD_CATALOG.autumn;
    expect(isPremiumMoodAvailable(autumn, Date.parse('2026-08-31'))).toBe(
      false
    );
    expect(isPremiumMoodAvailable(autumn, Date.parse('2026-10-15'))).toBe(true);
    expect(isPremiumMoodAvailable(autumn, Date.parse('2026-12-01'))).toBe(
      false
    );
    const winter = PAGE_MOOD_CATALOG.winter;
    expect(isPremiumMoodAvailable(winter, Date.parse('2026-11-30'))).toBe(
      false
    );
    expect(isPremiumMoodAvailable(winter, Date.parse('2026-12-01'))).toBe(true);
    expect(isPremiumMoodAvailable(winter, Date.parse('2027-01-15'))).toBe(true);
    expect(isPremiumMoodAvailable(winter, Date.parse('2027-03-01'))).toBe(
      false
    );
    const spring = PAGE_MOOD_CATALOG.spring;
    expect(isPremiumMoodAvailable(spring, Date.parse('2027-02-28'))).toBe(
      false
    );
    expect(isPremiumMoodAvailable(spring, Date.parse('2027-03-01'))).toBe(true);
    expect(isPremiumMoodAvailable(spring, Date.parse('2027-04-15'))).toBe(true);
    expect(isPremiumMoodAvailable(spring, Date.parse('2027-06-01'))).toBe(
      false
    );
  });

  it('prices every seasonal mood the same', () => {
    const seasonal = Object.values(PAGE_MOOD_CATALOG).filter(
      (entry) => entry.packKind === 'seasonal'
    );
    expect(seasonal.map((entry) => entry.id).sort()).toEqual([
      'autumn',
      'spring',
      'summer',
      'winter',
    ]);
    for (const entry of seasonal) {
      expect(entry.priceSocial).toBe('100');
    }
  });

  it('assigns tiered catalog prices by pack kind', () => {
    expect(PAGE_MOOD_CATALOG.summer).toMatchObject({
      packKind: 'seasonal',
      priceSocial: '100',
    });
    expect(PAGE_MOOD_CATALOG.autumn).toMatchObject({
      packKind: 'seasonal',
      priceSocial: '100',
    });
    expect(PAGE_MOOD_CATALOG.winter).toMatchObject({
      packKind: 'seasonal',
      priceSocial: '100',
    });
    expect(PAGE_MOOD_CATALOG.spring).toMatchObject({
      packKind: 'seasonal',
      priceSocial: '100',
    });
    expect(PAGE_MOOD_CATALOG.gold).toMatchObject({
      packKind: 'finish',
      priceSocial: '250',
    });
    expect(PAGE_MOOD_CATALOG.holographic).toMatchObject({
      packKind: 'finish',
      priceSocial: '350',
    });
    expect(PAGE_MOOD_CATALOG.broadsheet).toMatchObject({
      packKind: 'voice',
      priceSocial: '300',
    });
    expect(PAGE_MOOD_CATALOG.signature).toMatchObject({
      packKind: 'voice',
      priceSocial: '500',
    });
  });
});
