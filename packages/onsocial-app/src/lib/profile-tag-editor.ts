import { normalizeProfileTags } from '@/lib/profile-display';

export const PROFILE_EDITOR_MAX_TAGS = 3;
export const PROFILE_EDITOR_MAX_TAG_LENGTH = 32;

export function normalizeProfileEditorTagDraft(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .slice(0, PROFILE_EDITOR_MAX_TAG_LENGTH);
}

/** Normalize editor tags — trim, lowercase, dedupe, cap count. */
export function normalizeProfileEditorTags(tags: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const tag of normalizeProfileTags(tags)) {
    const normalized = normalizeProfileEditorTagDraft(tag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    out.push(normalized);

    if (out.length >= PROFILE_EDITOR_MAX_TAGS) {
      break;
    }
  }

  return out;
}

export function profileEditorTagsEqual(
  left: unknown,
  right: unknown
): boolean {
  const normalizedLeft = normalizeProfileEditorTags(left);
  const normalizedRight = normalizeProfileEditorTags(right);

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((tag, index) => tag === normalizedRight[index]);
}

export type ProfileEditorTagCommitHint = 'Already added' | 'Max 3 crafts';

export function tryAddProfileEditorTag(
  tags: string[],
  draft: string
): { tags: string[]; hint: ProfileEditorTagCommitHint | null } {
  const normalized = normalizeProfileEditorTagDraft(draft);
  if (!normalized) {
    return { tags, hint: null };
  }

  if (tags.length >= PROFILE_EDITOR_MAX_TAGS) {
    return { tags, hint: 'Max 3 crafts' };
  }

  if (tags.includes(normalized)) {
    return { tags, hint: 'Already added' };
  }

  return {
    tags: addProfileEditorTag(tags, draft),
    hint: null,
  };
}

export function addProfileEditorTag(
  tags: string[],
  draft: string
): string[] {
  const normalized = normalizeProfileEditorTagDraft(draft);
  if (!normalized) {
    return tags;
  }

  if (tags.includes(normalized)) {
    return tags;
  }

  return normalizeProfileEditorTags([...tags, normalized]);
}

export function removeProfileEditorTag(tags: string[], tag: string): string[] {
  const normalized = normalizeProfileEditorTagDraft(tag);
  return tags.filter((item) => item !== normalized);
}

export function parseProfileEditorTagDraft(raw: string): string[] {
  return normalizeProfileEditorTags(
    raw
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
  );
}
