import {
  PROFILE_INDUSTRY_OPTIONS,
  PROFILE_INDUSTRY_WRITE_IN,
  matchProfileIndustryOption,
} from '@onsocial/sdk';
import {
  PROFILE_CRAFT_SUGGESTIONS,
  PROFILE_CRAFT_WRITE_IN,
} from '@/lib/profile-craft-suggestions';

const INDUSTRY_KEY = Object.fromEntries(
  PROFILE_INDUSTRY_OPTIONS.map((option) => [
    option.value,
    `industries.${industryKeyName(option.value)}`,
  ])
) as Record<string, string>;

const CRAFT_KEY = Object.fromEntries(
  PROFILE_CRAFT_SUGGESTIONS.map((option) => [option.id, `crafts.${option.id}`])
) as Record<string, string>;

const CRAFT_LABEL_KEY = Object.fromEntries(
  PROFILE_CRAFT_SUGGESTIONS.map((option) => [
    option.label,
    `crafts.${option.id}`,
  ])
) as Record<string, string>;

/** Catalog key for a stored industry. Custom text stays untranslated. */
export function industryMessageKey(value: string): string | null {
  const match = matchProfileIndustryOption(value);
  return match ? (INDUSTRY_KEY[match.value] ?? null) : null;
}

/** Catalog key for a seed craft slug. Typed crafts stay as written. */
export function craftMessageKey(slug: string): string | null {
  return CRAFT_KEY[slug] ?? null;
}

/** Catalog key when the sentence already used the English seed label. */
export function craftLabelMessageKey(label: string): string | null {
  return CRAFT_LABEL_KEY[label] ?? null;
}

/**
 * Name embedded in an already-translated sentence.
 * Craft empties carry the English seed label. Industry empties carry the stored value.
 */
export function embeddedTaxonomyKey(
  sentenceKey: string,
  name: string
): string | null {
  if (sentenceKey === 'discover.taggedPeople')
    return craftLabelMessageKey(name);
  return industryMessageKey(name);
}

export function industryFallbackKey(label: string): string | null {
  if (label === 'Organization') return 'taxonomy.organization';
  if (label === 'Industry') return 'discover.industry';
  return null;
}

export function industryHintKey(hint: string): string | null {
  if (hint === 'Optional. Skip to stay Organization.')
    return 'taxonomy.orgHint';
  if (hint === 'Optional. Shown on the face, not in Orgs.') {
    return 'taxonomy.daoHint';
  }
  return null;
}

export function taxonomyChoiceLabelKey(option: {
  value: string;
  label: string;
}): string | null {
  if (option.value === '') {
    if (option.label === 'Any industry') return 'taxonomy.anyIndustry';
    if (option.label === 'Any craft') return 'taxonomy.anyCraft';
    if (option.label === 'Organization') return 'taxonomy.organization';
    return null;
  }
  if (
    option.value === PROFILE_INDUSTRY_WRITE_IN ||
    option.value === PROFILE_CRAFT_WRITE_IN
  ) {
    return 'taxonomy.writeYourOwn';
  }
  return industryMessageKey(option.value) ?? craftMessageKey(option.value);
}

export function taxonomySectionKey(section: string): string | null {
  switch (section) {
    case 'Business':
      return 'taxonomy.sectionBusiness';
    case 'Web3 & digital':
      return 'taxonomy.sectionWeb3';
    case 'Civic':
      return 'taxonomy.sectionCivic';
    case 'Crafts':
      return 'taxonomy.sectionCrafts';
    case 'Popular':
      return 'taxonomy.sectionPopular';
    case 'Yours':
      return 'taxonomy.sectionYours';
    case 'Custom':
      return 'taxonomy.sectionCustom';
    default:
      return null;
  }
}

/** Row descriptions built in English by the craft pickers. */
export function taxonomyDescriptionMessage(
  description: string
): { key: string; values?: { count: number } } | null {
  if (description === 'Selected') return { key: 'taxonomy.selected' };
  if (description === 'Up to 32 characters') {
    return { key: 'taxonomy.writeInLimit' };
  }
  if (description === 'No sector') return { key: 'taxonomy.noSector' };
  const count = /^(\d+) (?:person|people)$/.exec(description);
  if (!count?.[1]) return null;
  return { key: 'taxonomy.people', values: { count: Number(count[1]) } };
}

function industryKeyName(value: string): string {
  if (value === 'Real Estate') return 'realEstate';
  if (value === 'AI') return 'ai';
  return value.charAt(0).toLowerCase() + value.slice(1);
}
