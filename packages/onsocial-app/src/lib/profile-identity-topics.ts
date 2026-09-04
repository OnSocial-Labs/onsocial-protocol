import { normalizeProfileEditorTags } from '@/lib/profile-tag-editor';
import { topicLabel } from '@/lib/topic-slug';

/** Curated About crafts (`profile/tags`) — who you are, not post `#` tags. */
export function profileIdentityTopics(tags: unknown): string[] {
  return normalizeProfileEditorTags(tags);
}

/** Sentence-case label for a craft slug (`live_music` → `Live music`). */
export function profileIdentityTopicLabel(slug: string): string {
  return topicLabel(slug) ?? slug;
}
