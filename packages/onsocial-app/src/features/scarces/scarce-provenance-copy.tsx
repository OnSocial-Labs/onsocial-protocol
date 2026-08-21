'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { CollectionAboutTeaser } from '@/features/scarces/collection-about-sheet';
import {
  ScarceAboutSheet,
  type ScarceAboutEvent,
} from '@/features/scarces/scarce-about-sheet';
import { ticketEventPlaceLabel } from '@/features/scarces/ticket-event-meta';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { parsePostText } from '@/lib/post-display';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';
import { personalPostPath, postThreadPath } from '@/lib/post-routes';

export interface ScarceProvenanceCopyProps {
  /** Cover / NEP-177 title — body is suppressed when identical. */
  title?: string | null;
  /** NEP-177 description (full post text when minted from a post). */
  description?: string | null;
  /** Live feed post — used for body when description is absent. */
  post?: PostRow | null;
  /** App thread href when already resolved. */
  postHref?: string | null;
  /** `author/post/id` or guild path from metadata.extra.sourcePost. */
  sourcePostPath?: string | null;
  /**
   * When true, skip "View original" — caller is already on that post
   * (feed buy sheet / list sheet).
   */
  hideOriginalLink?: boolean;
  /**
   * When true, always render the title row even if body is absent
   * (mint drawer — creator should see what becomes NEP-177 title).
   */
  showTitle?: boolean;
  /** Ticket event — shown in the About hug when the teaser opens. */
  event?: ScarceAboutEvent | null;
  /** About sheet stack above commerce. */
  aboutZIndex?: number;
}

/** Full post body for scarce sheets — cover stays on the art above. */
export function resolveScarceBodyText(opts: {
  title?: string | null;
  description?: string | null;
  post?: PostRow | null;
}): string | null {
  const title = opts.title?.trim() || '';
  const fromDescription = opts.description?.trim() || '';
  if (fromDescription) {
    return stripLeadingTitleEcho(fromDescription, title);
  }
  if (opts.post) {
    const fromPost = parsePostText(opts.post.value).trim();
    if (fromPost) return stripLeadingTitleEcho(fromPost, title);
  }
  return null;
}

/**
 * Drop a leading cover title so Buy/Sell don’t restate the summary line.
 * Exact match hides the body. Otherwise the title must end with sentence
 * punctuation (then whitespace), or be followed by punctuation / a newline —
 * never a bare mid-sentence space after a short word title.
 */
function stripLeadingTitleEcho(body: string, title: string): string | null {
  const text = body.trim();
  const cover = title.trim();
  if (!text) return null;
  if (!cover) return text;
  if (text === cover) return null;
  if (!text.startsWith(cover)) return text;
  const after = text.slice(cover.length);
  if (/[.!?…]$/.test(cover) && /^\s+/.test(after)) {
    return after.trim() || null;
  }
  if (!/^([.!?…]+|\n+|[·—–:;])\s*/.test(after)) return text;
  const rest = after.replace(/^([.!?…]+|\n+|[·—–:;])\s*/, '').trim();
  return rest || null;
}

export function resolveScarceOriginalHref(opts: {
  postHref?: string | null;
  sourcePostPath?: string | null;
}): string | null {
  const direct = opts.postHref?.trim();
  if (direct) return direct;
  return postHrefFromSourcePath(opts.sourcePostPath ?? undefined);
}

/**
 * True when the sheet’s live `post` is already the mint source — hide
 * “View original post” (resale announce posts keep the link).
 */
export function isScarceOriginalSelf(
  post: PostRow | null | undefined,
  sourcePostPath?: string | null,
  postHref?: string | null
): boolean {
  if (!post) return false;
  const contentPath = `${post.accountId.trim()}/post/${post.postId.trim()}`;
  const source = sourcePostPath?.trim();
  if (source && source === contentPath) return true;

  const href = postHref?.trim();
  if (!href) return false;
  if (href === postThreadPath(post)) return true;
  if (href === personalPostPath(post.accountId, post.postId)) return true;
  return false;
}

/**
 * Scarce sheet copy under the cover: title + one-line teaser (About sheet
 * when truncated or when Event / more metadata exists) + source post link.
 */
export function ScarceProvenanceCopy({
  title = null,
  description = null,
  post = null,
  postHref = null,
  sourcePostPath = null,
  hideOriginalLink = false,
  showTitle = false,
  event = null,
  aboutZIndex = SCARCE_Z.nestedOverCommerce,
}: ScarceProvenanceCopyProps) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const resolvedTitle = title?.trim() || null;
  const body = resolveScarceBodyText({ title, description, post });
  const originalHref = hideOriginalLink
    ? null
    : resolveScarceOriginalHref({ postHref, sourcePostPath });
  const hasEvent = Boolean(
    (event?.eventStartsAtMs != null && event.eventStartsAtMs > 0) ||
      (event?.eventEndsAtMs != null && event.eventEndsAtMs > 0) ||
      event?.place?.trim()
  );
  const hasAccess = Boolean(
    event?.accessEndsAtMs != null &&
      event.accessEndsAtMs > 0 &&
      !hasEvent
  );
  const hasMoreStory = hasEvent || hasAccess;
  const teaserText =
    body ||
    (hasEvent
      ? ticketEventPlaceLabel(event?.place) || 'Event details'
      : hasAccess
        ? 'Access details'
        : null);
  // Title lives in the commerce summary; only force it here when asked
  // (e.g. list/compose preview).
  const showTitleRow = Boolean(resolvedTitle) && showTitle;

  if (!showTitleRow && !teaserText && !originalHref) return null;

  return (
    <>
      <div className="scarce-provenance-copy">
        {showTitleRow ? (
          <p className="scarce-provenance-title">{resolvedTitle}</p>
        ) : null}
        {teaserText ? (
          <CollectionAboutTeaser
            text={teaserText}
            hasMore={hasMoreStory}
            onReadMore={() => setAboutOpen(true)}
          />
        ) : null}
        {originalHref ? (
          <p className="scarce-provenance-original">
            <Link
              href={originalHref}
              scroll={false}
              className="scarce-provenance-original-link"
            >
              View original post
            </Link>
          </p>
        ) : null}
      </div>
      {teaserText ? (
        <ScarceAboutSheet
          open={aboutOpen}
          onClose={() => setAboutOpen(false)}
          title={resolvedTitle}
          body={body || ''}
          originalHref={originalHref}
          event={event}
          zIndex={aboutZIndex}
        />
      ) : null}
    </>
  );
}
