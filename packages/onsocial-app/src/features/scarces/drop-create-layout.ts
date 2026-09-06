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

/** Blurb waits — open only when the maker asks, or when a draft already has one. */
export function dropCreateBlurbOpen(
  description: string,
  forcedOpen = false
): boolean {
  return forcedOpen || Boolean(description.trim());
}

/** Empty artwork/cover sits on the piece. Studio stay a launch card. */
export function dropCreatePiecePickerClass(
  kind: 'piece' | 'studio' = 'piece'
): string {
  return kind === 'studio'
    ? 'drop-cover-picker drop-studio-launch'
    : 'drop-cover-picker drop-create-piece';
}
