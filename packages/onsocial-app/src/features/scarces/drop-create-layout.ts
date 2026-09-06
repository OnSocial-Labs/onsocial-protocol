/** Maker-page field order: the work, then the name, then the deal, then the blurb. */
export const DROP_CREATE_SECTION_ORDER = [
  'work',
  'title',
  'deal',
  'description',
] as const;

export type DropCreateSection = (typeof DROP_CREATE_SECTION_ORDER)[number];

export function dropCreateScreenTitle(studioOpen: boolean): string {
  return studioOpen ? 'Design your set' : 'New drop';
}
