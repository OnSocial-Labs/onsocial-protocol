'use client';

import { useEffect, useState } from 'react';
import { decryptDmMedia } from '@/lib/dm/send';
import { dmMediaObjectUrls } from '@/features/messages/dm-media-object-urls';

interface DmMediaBubbleProps {
  accountId: string;
  senderAccountId: string;
  senderPubkey: string;
  cid: string;
  mime: string;
  nonce?: string | null;
  senderNonce?: string | null;
  ephemeralPubkey?: string | null;
}

export function DmMediaBubble({
  accountId,
  senderAccountId,
  senderPubkey,
  cid,
  mime,
  nonce,
  senderNonce,
  ephemeralPubkey,
}: DmMediaBubbleProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The cache owns the object URL lifecycle (bounded LRU) so windowed
    // rows can unmount and remount without re-decrypting the blob.
    void dmMediaObjectUrls
      .resolve(`${accountId.trim().toLowerCase()}:${cid}`, () =>
        decryptDmMedia({
          accountId,
          senderAccountId,
          senderPubkey,
          cid,
          mime,
          nonce,
          senderNonce,
          ephemeralPubkey,
        }).then((opened) => opened.objectUrl)
      )
      .then((url) => {
        if (!cancelled) setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [
    accountId,
    cid,
    ephemeralPubkey,
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
      <video className="messages-media" src={objectUrl} controls playsInline />
    );
  }
  return <img className="messages-media" src={objectUrl} alt="" />;
}
