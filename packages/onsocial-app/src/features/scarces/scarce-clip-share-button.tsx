'use client';

import { useState } from 'react';
import { CheckIcon, ShareIcon } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';

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
}: {
  title: string;
  className?: string;
}) {
  const { setTxResult } = useAppTransactionFeedback();
  const [copied, setCopied] = useState(false);
  const name = title.trim() || 'Drop';

  return (
    <button
      type="button"
      className={`media-download-control${className ? ` ${className}` : ''}${
        copied ? ' is-done' : ''
      }`}
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
  );
}
