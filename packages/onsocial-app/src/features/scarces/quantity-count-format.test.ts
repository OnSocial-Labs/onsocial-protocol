import { describe, expect, it } from 'vitest';
import {
  activityKindText,
  activityPriceLabel,
  appendEach,
  quantityCountPhrase,
  quantityMark,
  quantityPriceLine,
} from '@/features/scarces/quantity-count-format';

describe('quantity count', () => {
  it('stays quiet for a single copy', () => {
    expect(quantityMark(1)).toBeNull();
    expect(quantityCountPhrase(1, 'minted')).toBeNull();
    expect(activityKindText('Minted', 1)).toBe('Minted');
    expect(activityPriceLabel('100', 1, true)).toBe('100 NEAR');
    expect(quantityPriceLine({ quantity: 1, verb: 'minted', amount: '1 NEAR' })).toBe(
      '1 NEAR'
    );
  });

  it('says the count and the unit when a batch is more than one', () => {
    expect(quantityMark(2)).toBe('×2');
    expect(activityKindText('Minted', 2)).toBe('2 minted');
    expect(activityPriceLabel('100', 2, true)).toBe('100 NEAR each');
    expect(
      quantityPriceLine({ quantity: 2, verb: 'minted', amount: '100 NEAR' })
    ).toBe('2 minted · 100 NEAR each');
    expect(appendEach('1 NEAR', 2)).toBe('1 NEAR each');
  });

  it('does not call an uneven list price each', () => {
    expect(activityKindText('Listed', 2)).toBe('2 listed');
    expect(activityPriceLabel('2', 2, false)).toBe('2 NEAR');
  });

  it('leaves a multi-word label alone', () => {
    expect(activityKindText('Drop created', 2)).toBe('Drop created');
  });
});
