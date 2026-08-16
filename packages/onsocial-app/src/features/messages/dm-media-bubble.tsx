'use client';

import { useEffect, useState } from 'react';
import { decryptDmMedia } from '@/lib/dm/send';

interface DmMediaBubbleProps {
  accountId: string;
  senderAccountId: string;
  senderPubkey: string;
  cid: string;
  mime: string;
  nonce?: string | null;
  senderNonce?: string | null;
}

export function DmMediaBubble({
  accountId,
  senderAccountId,
  senderPubkey,
  cid,
  mime,
  nonce,
  senderNonce,
}: DmMediaBubbleProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const opened = await decryptDmMedia({
          accountId,
          senderAccountId,
          senderPubkey,
          cid,
          mime,
          nonce,
          senderNonce,
        });
        if (cancelled) {
          URL.revokeObjectURL(opened.objectUrl);
          return;
        }
        revoked = opened.objectUrl;
        setObjectUrl(opened.objectUrl);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [
    accountId,
    cid,
    mime,
    nonce,
    senderAccountId,
    senderNonce,
    senderPubkey,
  ]);

  if (error) {
    return <p className="messages-media-fallback">Media unavailable</p>;
  }
  if (!objectUrl) {
    return <p className="messages-media-fallback">Decrypting media…</p>;
  }
  if (mime.startsWith('video/')) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video className="messages-media" src={objectUrl} controls playsInline />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="messages-media" src={objectUrl} alt="" />
  );
}
