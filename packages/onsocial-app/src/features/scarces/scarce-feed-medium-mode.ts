export type ScarceFeedMediumMode = 'audio' | 'writing' | 'viewer';

export function resolveScarceFeedMediumMode(
  mediumKind: string | null | undefined
): ScarceFeedMediumMode {
  const key = (mediumKind ?? '').trim().toLowerCase();
  if (key === 'audio' || key === 'music') return 'audio';
  if (
    key === 'writing' ||
    key === 'article' ||
    key === 'book' ||
    key === 'text'
  ) {
    return 'writing';
  }
  return 'viewer';
}
