import type { ChoiceOption } from '@onsocial/ui';
import { profileIdentityTopicLabel } from '@/lib/profile-identity-topics';

/** Seed crafts for People Discover + empty-graph browse. */
export const PROFILE_CRAFT_SUGGESTIONS = [
  { id: 'designer', label: 'Designer' },
  { id: 'developer', label: 'Developer' },
  { id: 'writer', label: 'Writer' },
  { id: 'founder', label: 'Founder' },
  { id: 'artist', label: 'Artist' },
  { id: 'musician', label: 'Musician' },
  { id: 'engineer', label: 'Engineer' },
  { id: 'product', label: 'Product' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'educator', label: 'Educator' },
  { id: 'marketer', label: 'Marketer' },
  { id: 'builder', label: 'Builder' },
] as const;

export type ProfileCraftSuggestionId =
  (typeof PROFILE_CRAFT_SUGGESTIONS)[number]['id'];

/** Sentinel — opens the write-in sheet (same pattern as industry). */
export const PROFILE_CRAFT_WRITE_IN = '__craft_write_in__';

/**
 * Custom (non-seed) Discover crafts need this many people before they
 * appear — avoids one-off noise. Seed crafts always list.
 */
export const DISCOVER_CUSTOM_CRAFT_MIN_COUNT = 2;

export type DiscoverCraftCount = {
  tag: string;
  profileCount: number;
};

export function buildDiscoverCraftChoiceOptions(
  popular: DiscoverCraftCount[] = []
): ChoiceOption<string>[] {
  const seedIds = new Set(
    PROFILE_CRAFT_SUGGESTIONS.map((option) => option.id as string)
  );
  const countByTag = new Map(
    popular.map((row) => [row.tag, row.profileCount] as const)
  );

  const seedOptions: ChoiceOption<string>[] = PROFILE_CRAFT_SUGGESTIONS.map(
    (option) => {
      const count = countByTag.get(option.id);
      return {
        value: option.id,
        label: option.label,
        section: 'Crafts',
        ...(count && count > 0
          ? {
              description: `${count} ${count === 1 ? 'person' : 'people'}`,
            }
          : {}),
      };
    }
  );

  const popularCustom: ChoiceOption<string>[] = popular
    .filter(
      (row) =>
        !seedIds.has(row.tag) &&
        row.profileCount >= DISCOVER_CUSTOM_CRAFT_MIN_COUNT
    )
    .map((row) => ({
      value: row.tag,
      label: profileIdentityTopicLabel(row.tag),
      section: 'Popular',
      description: `${row.profileCount} ${
        row.profileCount === 1 ? 'person' : 'people'
      }`,
    }));

  return [
    {
      value: '',
      label: 'Any craft',
    },
    ...seedOptions,
    ...popularCustom,
  ];
}

/** About editor — curated list + write-in; multi-select up to the craft cap. */
export function buildProfileCraftEditorOptions(
  selected: readonly string[]
): ChoiceOption<string>[] {
  const selectedSet = new Set(selected);
  const seedIds = new Set(
    PROFILE_CRAFT_SUGGESTIONS.map((option) => option.id as string)
  );

  const seedOptions: ChoiceOption<string>[] = PROFILE_CRAFT_SUGGESTIONS.map(
    (option) => ({
      value: option.id,
      label: option.label,
      section: 'Crafts',
      description: selectedSet.has(option.id) ? 'Selected' : undefined,
    })
  );

  const customSelected: ChoiceOption<string>[] = selected
    .filter((slug) => !seedIds.has(slug))
    .map((slug) => ({
      value: slug,
      label: profileIdentityTopicLabel(slug),
      section: 'Yours',
      description: 'Selected',
    }));

  return [
    ...seedOptions,
    ...customSelected,
    {
      value: PROFILE_CRAFT_WRITE_IN,
      label: 'Write your own',
      section: 'Custom',
      description: 'Up to 32 characters',
    },
  ];
}

/** Drawer highlight — last selected craft, else none. */
export function profileCraftDrawerValue(selected: readonly string[]): string {
  return selected[selected.length - 1] ?? '';
}
