'use client';

import { useState } from 'react';
import { CheckIcon, ShareIcon } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { requestDropCompose } from '@/features/scarces/drop-compose-draft';

async function shareCurrentPage(input: {
  title: string;
  text: string;
}): Promise<'shared' | 'copied' | 'aborted' | 'failed'> {
  const url = typeof window === 'undefined' ? '' : window.location.href;
  if (!url) return 'failed';

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: input.title,
        text: input.text,
        url,
      });
      return 'shared';
    } catch (cause) {
      if (
        cause instanceof DOMException &&
        (cause.name === 'AbortError' || cause.name === 'NotAllowedError')
      ) {
        return 'aborted';
      }
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function ScarceClipShareButton({
  title,
  className,
  collectionId,
  mediaUrl,
  mediumKind = 'audio',
}: {
  title: string;
  className?: string;
  /** When set, show “Post to feed” beside URL share. */
  collectionId?: string | null;
  mediaUrl?: string | null;
  mediumKind?: string | null;
}) {
  const { setTxResult } = useAppTransactionFeedback();
  const [copied, setCopied] = useState(false);
  const name = title.trim() || 'Drop';
  const dropId = collectionId?.trim() || '';

  return (
    <div
      className={`scarce-clip-share-cluster${className ? ` ${className}` : ''}`}
    >
      {dropId ? (
        <button
          type="button"
          className="media-download-control scarce-clip-post-feed"
          aria-label="Post to feed"
          onClick={() => {
            requestDropCompose({
              collectionId: dropId,
              title: name,
              ...(mediaUrl?.trim() ? { mediaUrl: mediaUrl.trim() } : {}),
              ...(mediumKind?.trim()
                ? { mediumKind: mediumKind.trim().toLowerCase() }
                : { mediumKind: 'audio' }),
            });
          }}
        >
          <span className="scarce-clip-post-feed-label">Post</span>
        </button>
      ) : null}
      <button
        type="button"
        className={`media-download-control${copied ? ' is-done' : ''}`}
        aria-label={copied ? 'Link copied' : 'Share'}
        onClick={() => {
          void (async () => {
            const result = await shareCurrentPage({
              title: name,
              text: `Check out ${name} on OnSocial`,
            });
            if (result === 'copied') {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
              return;
            }
            if (result === 'failed') {
              setTxResult({
                type: 'error',
                msg: 'Couldn’t share this drop.',
              });
            }
          })();
        }}
      >
        {copied ? (
          <CheckIcon className="media-download-glyph" aria-hidden />
        ) : (
          <ShareIcon className="media-download-glyph" aria-hidden />
        )}
      </button>
    </div>
  );
}
