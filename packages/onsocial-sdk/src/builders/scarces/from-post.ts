// ---------------------------------------------------------------------------
// Helpers for "mint a post / list a post" flows. These are pure projections
// over a `PostRow` (or `PostRef`) — they extract the post's text and first
// IPFS media CID so callers can hand them straight to a token / lazy
// builder.
// ---------------------------------------------------------------------------

import type { MediaRef } from '../../schema/v1.js';
import type { PostRow } from '../../query/index.js';
import type { PostRef } from '../../types.js';

/** Anything identifying a post. */
export type PostSource = PostRow | PostRef;

/** Parsed projection of a post body — text + first usable media CID. */
export interface ExtractedPost {
  text: string;
  /** First image CID found in `media[]`, if any. Convenience for the
   *  common single-photo case. Equals `mediaCids[0]` when present. */
  mediaCid?: string;
  /** All image CIDs found in `media[]`, in source order. Excludes
   *  video/audio entries (those would render broken in NFT artwork). */
  mediaCids: string[];
  /** Raw `media[]` entries as stored on chain (unfiltered). */
  media: Array<string | MediaRef>;
}

/** Treat as image when MIME is missing (legacy posts) or starts with `image/`. */
function isImageMime(mime: string | undefined): boolean {
  if (!mime) return true;
  return /^image\//i.test(mime);
}

/**
 * Pull text + image CIDs out of a post body. Accepts the raw `value`
 * field from `posts_current` (a JSON string), or a pre-parsed object.
 * Non-image media (video, audio) is excluded — those would render as
 * broken artwork in wallets that only show the `media` field as `<img>`.
 */
export function extractPostMedia(
  value: string | Record<string, unknown> | null | undefined
): ExtractedPost {
  let parsed: Record<string, unknown> | null = null;
  if (value == null) {
    return { text: '', media: [], mediaCids: [] };
  }
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as Record<string, unknown>;
    } catch {
      return { text: value, media: [], mediaCids: [] };
    }
  } else {
    parsed = value;
  }

  const text = typeof parsed.text === 'string' ? parsed.text : '';
  const rawMedia = Array.isArray(parsed.media)
    ? (parsed.media as Array<string | MediaRef>)
    : [];
  const mediaCids: string[] = [];
  for (const entry of rawMedia) {
    if (typeof entry === 'string') {
      // Legacy string-only entries: assume image (no MIME info available).
      if (entry.startsWith('ipfs://')) {
        mediaCids.push(entry.slice('ipfs://'.length));
      }
    } else if (entry && typeof entry.cid === 'string' && entry.cid) {
      if (isImageMime(entry.mime)) {
        mediaCids.push(entry.cid);
      }
    }
  }
  const result: ExtractedPost = { text, media: rawMedia, mediaCids };
  if (mediaCids.length > 0) result.mediaCid = mediaCids[0];
  return result;
}

export function isPostRow(p: PostSource): p is PostRow {
  return 'accountId' in p && 'value' in p;
}

export function postCoords(p: PostSource): { author: string; postId: string } {
  if (isPostRow(p)) return { author: p.accountId, postId: p.postId };
  return { author: p.author, postId: p.postId };
}

/** Options for `os.scarces.fromPost.mint` / `os.scarces.fromPost.list`. */
export interface MintFromPostOptions {
  /** Override NFT title (default: post text truncated to 100 chars). */
  title?: string;
  /** Override NFT description (default: full post text). */
  description?: string;
  /** Number of editions (default: 1). */
  copies?: number;
  /** Royalty map — e.g. `{ 'alice.near': 1000 }` for 10%. */
  royalty?: Record<string, number>;
  /** Override media CID (default: first IPFS CID in the post's `media[]`). */
  mediaCid?: string;
  /** Optional file to upload (used only when no `mediaCid`). */
  image?: Blob | File;
  /** App ID for attribution / quotas. */
  appId?: string;
  /** Receiver of the minted token (default: caller). */
  receiverId?: string;
  /** Extra metadata merged into the scarce's `extra` (post link is always added). */
  extra?: Record<string, unknown>;
  /** Auto-card background theme key (forwarded when no media is supplied). */
  cardBg?: string;
  /** Auto-card typography key (forwarded when no media is supplied). */
  cardFont?: string;
  /** Lock the author-mark colour to a named palette colour. */
  cardMarkColor?: string;
  /** Author-mark shape: 'rule' | 'dot' | 'square' | 'bar'. */
  cardMarkShape?: string;
  /** Title alignment on the auto-card: 'left' | 'center'. */
  cardTitleAlign?: string;
  /**
   * Photo CID rendered as the embedded proof on a receipt card. Only
   * meaningful when `cardBg` selects a receipt mood (e.g. via
   * `mintReceipt(...)`). Defaults to the post's first image CID.
   */
  cardPhotoCid?: string;
}
