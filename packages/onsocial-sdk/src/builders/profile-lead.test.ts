import { describe, expect, it } from 'vitest';
import {
  PROFILE_LEAD_MAX,
  normalizeProfileLeadInput,
  profileLeadFromMaterialised,
  sanitizeProfileLeadDraft,
} from './profile-lead.js';

describe('normalizeProfileLeadInput', () => {
  it('trims and collapses horizontal runs', () => {
    expect(normalizeProfileLeadInput('  Our   story  ')).toBe('Our story');
  });

  it('keeps a markdown heading newline', () => {
    expect(normalizeProfileLeadInput('# Our story\nA short line.')).toBe(
      '# Our story\nA short line.'
    );
  });

  it('caps length', () => {
    const long = 'a'.repeat(PROFILE_LEAD_MAX + 12);
    expect(normalizeProfileLeadInput(long)).toHaveLength(PROFILE_LEAD_MAX);
  });

  it('clears blank', () => {
    expect(normalizeProfileLeadInput('   ')).toBe('');
  });
});

describe('sanitizeProfileLeadDraft', () => {
  it('keeps a trailing space while drafting', () => {
    expect(sanitizeProfileLeadDraft('Our ')).toBe('Our ');
  });
});

describe('profileLeadFromMaterialised', () => {
  it('reads reserved lead', () => {
    expect(profileLeadFromMaterialised({ lead: ' Our story ' })).toBe(
      'Our story'
    );
  });

  it('falls back to early kicker key', () => {
    expect(profileLeadFromMaterialised({ kicker: 'Hello' })).toBe('Hello');
  });

  it('falls back to extra.lead', () => {
    expect(profileLeadFromMaterialised({ extra: { lead: 'Hello' } })).toBe(
      'Hello'
    );
  });
});
