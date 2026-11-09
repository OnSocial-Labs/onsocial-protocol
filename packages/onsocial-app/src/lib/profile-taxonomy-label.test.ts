import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PROFILE_INDUSTRY_OPTIONS,
  PROFILE_INDUSTRY_WRITE_IN,
} from '@onsocial/sdk';
import {
  PROFILE_CRAFT_SUGGESTIONS,
  PROFILE_CRAFT_WRITE_IN,
} from './profile-craft-suggestions';
import {
  craftLabelMessageKey,
  craftMessageKey,
  embeddedTaxonomyKey,
  industryFallbackKey,
  industryHintKey,
  industryMessageKey,
  taxonomyChoiceLabelKey,
  taxonomyDescriptionMessage,
  taxonomySectionKey,
} from './profile-taxonomy-label';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../messages');
const en = JSON.parse(readFileSync(join(root, 'en/shell.json'), 'utf8')) as {
  industries: Record<string, string>;
  crafts: Record<string, string>;
  taxonomy: Record<string, string>;
};

function catalog(key: string): string {
  const [group, name] = key.split('.');
  const table = en[group as 'industries' | 'crafts' | 'taxonomy'];
  return table[name] ?? '';
}

describe('profile taxonomy labels', () => {
  it('keeps every curated industry label in English', () => {
    for (const option of PROFILE_INDUSTRY_OPTIONS) {
      const key = industryMessageKey(option.value);
      expect(key).toBeTruthy();
      expect(catalog(key!)).toBe(option.label);
      expect(industryMessageKey(option.value.toLowerCase())).toBe(key);
    }
    expect(industryMessageKey('My Shop')).toBeNull();
    expect(industryMessageKey('Film')).toBeNull();
  });

  it('keeps every seed craft label in English', () => {
    for (const option of PROFILE_CRAFT_SUGGESTIONS) {
      expect(catalog(craftMessageKey(option.id)!)).toBe(option.label);
      expect(craftLabelMessageKey(option.label)).toBe(`crafts.${option.id}`);
    }
    expect(craftMessageKey('photographer')).toBeNull();
    expect(craftLabelMessageKey('Photographer')).toBeNull();
  });

  it('maps picker chrome without changing stored values', () => {
    expect(taxonomyChoiceLabelKey({ value: '', label: 'Any industry' })).toBe(
      'taxonomy.anyIndustry'
    );
    expect(taxonomyChoiceLabelKey({ value: '', label: 'Any craft' })).toBe(
      'taxonomy.anyCraft'
    );
    expect(taxonomyChoiceLabelKey({ value: '', label: 'Organization' })).toBe(
      'taxonomy.organization'
    );
    expect(
      taxonomyChoiceLabelKey({
        value: PROFILE_INDUSTRY_WRITE_IN,
        label: 'Write your own',
      })
    ).toBe('taxonomy.writeYourOwn');
    expect(
      taxonomyChoiceLabelKey({
        value: PROFILE_CRAFT_WRITE_IN,
        label: 'Write your own',
      })
    ).toBe('taxonomy.writeYourOwn');
    expect(
      taxonomyChoiceLabelKey({ value: 'Healthcare', label: 'Healthcare' })
    ).toBe('industries.healthcare');
    expect(taxonomyChoiceLabelKey({ value: 'writer', label: 'Writer' })).toBe(
      'crafts.writer'
    );
    expect(
      taxonomyChoiceLabelKey({ value: 'photographer', label: 'Photographer' })
    ).toBeNull();
    expect(taxonomySectionKey('Web3 & digital')).toBe('taxonomy.sectionWeb3');
    expect(taxonomySectionKey('Crafts')).toBe('taxonomy.sectionCrafts');
    expect(taxonomySectionKey('Popular')).toBe('taxonomy.sectionPopular');
    expect(taxonomyDescriptionMessage('12 people')).toEqual({
      key: 'taxonomy.people',
      values: { count: 12 },
    });
    expect(taxonomyDescriptionMessage('1 person')).toEqual({
      key: 'taxonomy.people',
      values: { count: 1 },
    });
    expect(taxonomyDescriptionMessage('Selected')?.key).toBe(
      'taxonomy.selected'
    );
    expect(taxonomyDescriptionMessage('No sector')?.key).toBe(
      'taxonomy.noSector'
    );
    expect(industryFallbackKey('Organization')).toBe('taxonomy.organization');
    expect(industryFallbackKey('Industry')).toBe('discover.industry');
    expect(industryHintKey('Optional. Skip to stay Organization.')).toBe(
      'taxonomy.orgHint'
    );
    expect(embeddedTaxonomyKey('discover.taggedPeople', 'Writer')).toBe(
      'crafts.writer'
    );
    expect(embeddedTaxonomyKey('discover.daosInIndustry', 'Film')).toBeNull();
    expect(embeddedTaxonomyKey('discover.daosInIndustry', 'Healthcare')).toBe(
      'industries.healthcare'
    );
  });
});
