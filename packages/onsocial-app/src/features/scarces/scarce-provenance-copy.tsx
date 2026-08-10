'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import { CollectionAboutTeaser } from '@/features/scarces/collection-about-sheet';
import { ScarceAboutSheet } from '@/features/scarces/scarce-about-sheet';
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
  if (fromDescription && fromDescription !== title) return fromDescription;
  if (opts.post) {
    const fromPost = parsePostText(opts.post.value).trim();
    if (fromPost && fromPost !== title) return fromPost;
  }
  return null;
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
 * when truncated) + link back to the source post — Drop play parity.
 */
export function ScarceProvenanceCopy({
  title = null,
  description = null,
  post = null,
  postHref = null,
  sourcePostPath = null,
  hideOriginalLink = false,
  showTitle = false,
  aboutZIndex = SCARCE_Z.nestedOverCommerce,
}: ScarceProvenanceCopyProps) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const resolvedTitle = title?.trim() || null;
  const body = resolveScarceBodyText({ title, description, post });
  const originalHref = hideOriginalLink
    ? null
    : resolveScarceOriginalHref({ postHref, sourcePostPath });
  // Title lives in the commerce summary; only force it here when asked
  // (e.g. list/compose preview).
  const showTitleRow = Boolean(resolvedTitle) && showTitle;

  if (!showTitleRow && !body && !originalHref) return null;

  return (
    <>
      <div className="scarce-provenance-copy">
        {showTitleRow ? (
          <p className="scarce-provenance-title">{resolvedTitle}</p>
        ) : null}
        {body ? (
          <CollectionAboutTeaser
            text={body}
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
      {body ? (
        <ScarceAboutSheet
          open={aboutOpen}
          onClose={() => setAboutOpen(false)}
          title={resolvedTitle}
          body={body}
          originalHref={originalHref}
          zIndex={aboutZIndex}
        />
      ) : null}
    </>
  );
}
