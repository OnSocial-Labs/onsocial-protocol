import { describe, expect, it } from 'vitest';
import {
  normalizeProfileLocationInput,
  profileLocationFromMaterialised,
  sanitizeProfileLocationDraft,
} from '@/lib/profile-location';

describe('profile-location', () => {
  it('normalizes coarse based-in labels', () => {
    expect(normalizeProfileLocationInput('  Lisbon, Portugal  ')).toBe(
      'Lisbon, Portugal'
    );
    expect(normalizeProfileLocationInput('')).toBe('');
    expect(sanitizeProfileLocationDraft('Bay  Area')).toBe('Bay Area');
  });

  it('reads location from materialised profile or legacy extra', () => {
    expect(
      profileLocationFromMaterialised({ location: 'Tokyo', extra: {} })
    ).toBe('Tokyo');
    expect(
      profileLocationFromMaterialised({
        extra: { location: 'Lisbon' },
      })
    ).toBe('Lisbon');
  });
});
