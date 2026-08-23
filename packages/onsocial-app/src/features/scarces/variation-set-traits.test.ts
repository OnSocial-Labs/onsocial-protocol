import { describe, expect, it } from 'vitest';
import { variationSampleSeats } from '@/features/scarces/collections-data';
import { summarizeVariationTraits } from '@/features/scarces/variation-set-traits';

describe('variationSampleSeats', () => {
  it('spreads seats and always keeps the cover', () => {
    expect(variationSampleSeats(5, 3, 4)).toContain(3);
    expect(variationSampleSeats(5, 3, 4)).toHaveLength(4);
    expect(variationSampleSeats(1, 1, 8)).toEqual([1]);
    expect(variationSampleSeats(0, 1, 8)).toEqual([]);
  });
});

describe('summarizeVariationTraits', () => {
  it('keeps first-seen trait types', () => {
    expect(
      summarizeVariationTraits([
        {
          attributes: [
            { trait_type: 'Background', value: 'Night' },
            { trait_type: 'Hat', value: 'Cap' },
          ],
        },
        {
          attributes: [
            { trait_type: 'Background', value: 'Day' },
            { trait_type: 'Body', value: 'Gold' },
          ],
        },
      ])
    ).toEqual(['Background', 'Hat', 'Body']);
  });
});
