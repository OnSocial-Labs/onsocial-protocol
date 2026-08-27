import { describe, expect, it } from 'vitest';
import { normalizeListingInput } from '../../src/services/developer-apps/listing.js';

describe('developer app listing input', () => {
  it('requires https href and a name when listed', () => {
    expect(
      normalizeListingInput({
        listed: true,
        name: 'Tracker',
        href: 'http://insecure.example',
      })
    ).toMatchObject({ code: 'INVALID_LISTING' });

    expect(
      normalizeListingInput({
        listed: true,
        href: 'https://track.example.com',
      })
    ).toMatchObject({ error: 'name is required to list' });

    expect(
      normalizeListingInput({
        listed: true,
        name: 'Tracker',
      })
    ).toMatchObject({ error: 'href is required to list' });
  });

  it('accepts a public https listing', () => {
    expect(
      normalizeListingInput({
        listed: true,
        name: 'Tracker',
        href: 'https://track.example.com/app',
        iconUrl: 'https://track.example.com/icon.png',
      })
    ).toEqual({
      listed: true,
      name: 'Tracker',
      href: 'https://track.example.com/app',
      iconUrl: 'https://track.example.com/icon.png',
    });
  });
});
