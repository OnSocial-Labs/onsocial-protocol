import { describe, expect, it } from 'vitest';
import { mapCollectionActivityRows } from '@/features/scarces/collection-activity-map';

const ONE = '1000000000000000000000000';
const TWO = '2000000000000000000000000';

describe('mapCollectionActivityRows', () => {
  it('splits a batch total into the unit and keeps the count', () => {
    const [row] = mapCollectionActivityRows([
      {
        operation: 'purchase',
        blockTimestamp: Date.parse('2026-07-01T00:00:00Z'),
        buyerId: 'fan.near',
        price: TWO,
        quantity: 2,
      },
    ]);
    expect(row?.label).toBe('Minted');
    expect(row?.quantity).toBe(2);
    expect(row?.priceNear).toBe('1');
    expect(row?.uniformBatch).toBe(true);
  });

  it('prefers unit_price over the batch total', () => {
    const [row] = mapCollectionActivityRows([
      {
        operation: 'purchase',
        buyerId: 'fan.near',
        price: TWO,
        quantity: 2,
        extraData: JSON.stringify({ unit_price: ONE }),
      },
    ]);
    expect(row?.priceNear).toBe('1');
    expect(row?.quantity).toBe(2);
  });

  it('leaves a single mint as the price with no count', () => {
    const [row] = mapCollectionActivityRows([
      {
        operation: 'purchase',
        buyerId: 'fan.near',
        price: ONE,
        quantity: 1,
      },
    ]);
    expect(row?.quantity).toBe(1);
    expect(row?.priceNear).toBe('1');
    expect(row?.uniformBatch).toBe(false);
  });
});
