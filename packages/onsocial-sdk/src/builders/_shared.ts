// ---------------------------------------------------------------------------
// builders/_shared — shared types + helpers used by every builder family
// ---------------------------------------------------------------------------

import {
  inferKind,
  normalizeChannel,
  normalizeAudiences,
} from '../schema/v1.js';
import type { MediaRef, Embed } from '../schema/v1.js';
import type { PostData } from '../types.js';

/**
 * Shape of a NEAR Social `Set` payload — a flat map of slash-keyed paths
 * to JSON-serialisable values (or `null` to delete).
 */
export type SocialSetData = Record<string, unknown>;

/**
 * Merge normalised feed metadata (`channel`, `kind`, `audiences`) into a
 * post body so every writer — direct post, reply, quote, group, group-reply,
 * group-quote — produces consistently indexed posts. Invalid `channel`
 * values are dropped (treated as "no channel") rather than silently landing
 * in the wrong bucket. `kind` is inferred from media/embeds/text if not
 * supplied or if the supplied value isn't in the known vocabulary.
 */
export function applyFeedMeta<T extends PostData>(post: T): T {
  const channel = normalizeChannel(
    (post as unknown as { channel?: unknown }).channel
  );
  const audiences = normalizeAudiences(
    (post as unknown as { audiences?: unknown }).audiences
  );
  const rawKind = (post as unknown as { kind?: unknown }).kind;
  const kind = inferKind({
    text: post.text,
    media: (post as unknown as { media?: MediaRef[] | string[] }).media,
    embeds: (post as unknown as { embeds?: Embed[] }).embeds,
    kind: typeof rawKind === 'string' ? rawKind : undefined,
  });
  const next = { ...post, kind } as T;
  if (channel !== undefined)
    (next as Record<string, unknown>).channel = channel;
  else delete (next as Record<string, unknown>).channel;
  if (audiences !== undefined)
    (next as Record<string, unknown>).audiences = audiences;
  else delete (next as Record<string, unknown>).audiences;
  return next;
}
