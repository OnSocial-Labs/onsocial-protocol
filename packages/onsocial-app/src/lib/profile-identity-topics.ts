import { normalizeProfileEditorTags } from '@/lib/profile-tag-editor';
import { topicLabel } from '@/lib/topic-slug';

/** Curated identity topics (`profile/tags`) — no `#`, max 8. */
export function profileIdentityTopics(tags: unknown): string[] {
  return normalizeProfileEditorTags(tags);
}

/** Sentence-case label for a topic slug (`live_music` → `Live music`). */
export function profileIdentityTopicLabel(slug: string): string {
  return topicLabel(slug) ?? slug;
}
