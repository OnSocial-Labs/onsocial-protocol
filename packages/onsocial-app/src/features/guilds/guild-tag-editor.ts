import {
  GUILD_MAX_TAGS,
  normalizeGuildTagList,
} from '@/features/guilds/guild-config';
import { TOPIC_MAX_LENGTH } from '@/lib/topic-slug';

export const GUILD_EDITOR_MAX_TAG_LENGTH = TOPIC_MAX_LENGTH;

export type GuildEditorTagCommitHint = 'Already added' | 'Max 2 topics';

export function normalizeGuildEditorTagDraft(raw: string): string {
  const list = normalizeGuildTagList([raw]);
  return list[0] ?? '';
}

export function normalizeGuildEditorTags(tags: unknown): string[] {
  return normalizeGuildTagList(
    Array.isArray(tags)
      ? tags.map((tag) =>
          typeof tag === 'string' ? normalizeGuildEditorTagDraft(tag) : tag
        )
      : []
  );
}

export function guildEditorTagsEqual(left: unknown, right: unknown): boolean {
  const a = normalizeGuildEditorTags(left);
  const b = normalizeGuildEditorTags(right);
  if (a.length !== b.length) return false;
  return a.every((tag, index) => tag === b[index]);
}

export function tryAddGuildEditorTag(
  tags: string[],
  draft: string
): { tags: string[]; hint: GuildEditorTagCommitHint | null } {
  const normalized = normalizeGuildEditorTagDraft(draft);
  if (!normalized) {
    return { tags, hint: null };
  }

  const current = normalizeGuildEditorTags(tags);
  if (current.length >= GUILD_MAX_TAGS) {
    return { tags: current, hint: 'Max 2 topics' };
  }
  if (current.includes(normalized)) {
    return { tags: current, hint: 'Already added' };
  }

  return {
    tags: normalizeGuildEditorTags([...current, normalized]),
    hint: null,
  };
}

export function removeGuildEditorTag(tags: string[], tag: string): string[] {
  const normalized = normalizeGuildEditorTagDraft(tag);
  return normalizeGuildEditorTags(
    tags.filter((item) => item !== normalized)
  );
}

export function parseGuildEditorTagDraft(raw: string): string[] {
  return normalizeGuildEditorTags(
    raw
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
  );
}
