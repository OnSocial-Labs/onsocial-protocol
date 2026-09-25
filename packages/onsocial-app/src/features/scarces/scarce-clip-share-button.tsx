'use client';

import { useState } from 'react';
import { CheckIcon, ShareIcon } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { requestDropCompose } from '@/features/scarces/drop-compose-draft';
import { shareUrl } from '@/lib/share-url';

export function ScarceClipShareButton({
  title,
  className,
  collectionId,
  mediaUrl,
  mediumKind = 'audio',
  /** Drop page uses dock Post — hide the on-page Post control. */
  showFeedPost = true,
  /** Listen row matches the Drop: Share, then Post. */
  postAfterShare = false,
}: {
  title: string;
  className?: string;
  /** When set, show “Post to feed” beside URL share. */
  collectionId?: string | null;
  mediaUrl?: string | null;
  mediumKind?: string | null;
  showFeedPost?: boolean;
  postAfterShare?: boolean;
}) {
  const { setTxResult } = useAppTransactionFeedback();
  const [copied, setCopied] = useState(false);
  const name = title.trim() || 'Drop';
  const dropId = collectionId?.trim() || '';
  const postButton =
    dropId && showFeedPost ? (
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
    ) : null;

  return (
    <div
      className={`scarce-clip-share-cluster${className ? ` ${className}` : ''}`}
    >
      {postAfterShare ? null : postButton}
      <button
        type="button"
        className={`media-download-control${copied ? ' is-done' : ''}`}
        aria-label={copied ? 'Link copied' : 'Share'}
        onClick={() => {
          void (async () => {
            const pageUrl =
              typeof window === 'undefined' ? '' : window.location.href;
            const result = await shareUrl({
              url: pageUrl,
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
      {postAfterShare ? postButton : null}
    </div>
  );
}
