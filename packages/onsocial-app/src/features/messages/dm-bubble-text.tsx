'use client';

import { PostRichText } from '@/features/home/post-rich-text';

/**
 * Decrypted DM body — same # / @ / $ / url chips as posts.
 * Plaintext send stays unchanged. No unfurl, no mention pings.
 */
export function DmBubbleText({ text }: { text: string }) {
  return (
    <p className="messages-bubble-text">
      <PostRichText text={text} />
    </p>
  );
}
