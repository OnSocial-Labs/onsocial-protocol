import { describe, expect, it } from 'vitest';
import {
  buildOfferRemoveData,
  buildOfferSetData,
  createOfferId,
  normalizeOfferLine,
  normalizeOfferUrl,
  offerMaxForKind,
  parseOfferKeyEntry,
  sortOffers,
} from './offers.js';

describe('offers builder', () => {
  it('writes a standing offers/<id> payload without a close date', () => {
    expect(
      buildOfferSetData('o-1', {
        title: '  Brand identity  ',
        line: 'Marks, type, and a site.',
        url: 'studio.example/book',
        since: 1_700_000_000_000,
      })
    ).toEqual({
      'offers/o-1': {
        v: 1,
        title: 'Brand identity',
        line: 'Marks, type, and a site.',
        url: 'https://studio.example/book',
        since: 1_700_000_000_000,
      },
    });
  });

  it('rejects an empty title and drops a bad link', () => {
    expect(() => buildOfferSetData('o-1', { title: '   ' })).toThrow(/title/i);
    expect(normalizeOfferUrl('javascript:alert(1)')).toBe('');
    expect(normalizeOfferUrl('http://insecure.example/x')).toBe('');
    expect(normalizeOfferLine('  two\nlines  ')).toBe('two lines');
    expect(createOfferId(1).startsWith('o-')).toBe(true);
    expect(buildOfferRemoveData('o-1')).toEqual({ 'offers/o-1': null });
  });

  it('caps a person at one offer and an org at three', () => {
    expect(offerMaxForKind('person')).toBe(1);
    expect(offerMaxForKind(null)).toBe(1);
    expect(offerMaxForKind('org')).toBe(3);
    expect(offerMaxForKind('dao')).toBe(0);
  });

  it('reads a chain key into a record and keeps the oldest first', () => {
    const parsed = parseOfferKeyEntry({
      key: 'alice.near/offers/o-2',
      value: JSON.stringify({
        v: 1,
        title: '  Editing  ',
        line: 'Essays',
        since: 20,
      }),
    });
    expect(parsed).toEqual({
      offerId: 'o-2',
      title: 'Editing',
      line: 'Essays',
      url: null,
      since: 20,
    });
    expect(
      sortOffers([
        { offerId: 'b', title: 'B', line: null, url: null, since: 2 },
        { offerId: 'a', title: 'A', line: null, url: null, since: 1 },
      ]).map((offer) => offer.offerId)
    ).toEqual(['a', 'b']);
  });
});
