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
