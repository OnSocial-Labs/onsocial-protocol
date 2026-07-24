'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PostRow } from '@onsocial/sdk';
import {
  parsePostText,
  postPreviewNeedsExpand,
  truncatePostPreview,
} from '@/lib/post-display';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';

/** Soft cap for collapsed body on scarce sheets — about 3–4 short lines. */
const SCARCE_BODY_PREVIEW_CHARS = 160;

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
 * Scarce sheet copy under the cover: title + full minted text (Show more
 * when long) + link back to the source post. Card art stays the
 * format-capped cover.
 */
export function ScarceProvenanceCopy({
  title = null,
  description = null,
  post = null,
  postHref = null,
  sourcePostPath = null,
  hideOriginalLink = false,
  showTitle = false,
}: ScarceProvenanceCopyProps) {
  const [expanded, setExpanded] = useState(false);
  const resolvedTitle = title?.trim() || null;
  const body = resolveScarceBodyText({ title, description, post });
  const originalHref = hideOriginalLink
    ? null
    : resolveScarceOriginalHref({ postHref, sourcePostPath });
  const canExpand = Boolean(
    body && postPreviewNeedsExpand(body, SCARCE_BODY_PREVIEW_CHARS)
  );
  const displayBody =
    body && canExpand && !expanded
      ? truncatePostPreview(body, SCARCE_BODY_PREVIEW_CHARS)
      : body;
  const showTitleRow =
    Boolean(resolvedTitle) &&
    (showTitle || Boolean(body && body !== resolvedTitle));

  if (!showTitleRow && !body && !originalHref) return null;

  return (
    <div className="scarce-provenance-copy">
      {showTitleRow ? (
        <p className="scarce-provenance-title">{resolvedTitle}</p>
      ) : null}
      {displayBody ? (
        <div className="scarce-provenance-body-block">
          <p className="scarce-provenance-body">{displayBody}</p>
          {canExpand ? (
            <button
              type="button"
              className="scarce-provenance-more"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </div>
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
  );
}
