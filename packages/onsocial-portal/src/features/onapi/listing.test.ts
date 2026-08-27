import { describe, expect, it } from 'vitest';
import {
  listingDraftError,
  listingDraftsEqual,
  listingFromApp,
  listingPublishToast,
} from './listing';

describe('developer app listing draft', () => {
  it('requires https href and a name when listed', () => {
    expect(
      listingDraftError({
        listed: true,
        name: 'Tracker',
        href: 'http://insecure.example',
        iconUrl: '',
      })
    ).toMatch(/https/);

    expect(
      listingDraftError({
        listed: true,
        name: '',
        href: 'https://track.example.com',
        iconUrl: '',
      })
    ).toBe('name is required to list');
  });

  it('accepts a public https listing', () => {
    expect(
      listingDraftError({
        listed: true,
        name: 'Tracker',
        href: 'https://track.example.com/app',
        iconUrl: 'https://track.example.com/icon.png',
      })
    ).toBeNull();
  });

  it('maps publish toasts from listed flips', () => {
    expect(listingPublishToast(false, true)).toBe('onTheBoard');
    expect(listingPublishToast(true, false)).toBe('offTheBoard');
    expect(listingPublishToast(true, true)).toBe('listingSaved');
    expect(listingFromApp({ listed: true, name: ' Tracker ' }).name).toBe(
      'Tracker'
    );
    expect(
      listingDraftsEqual(listingFromApp({}), {
        name: '',
        iconUrl: '',
        href: '',
        listed: false,
      })
    ).toBe(true);
  });
});
