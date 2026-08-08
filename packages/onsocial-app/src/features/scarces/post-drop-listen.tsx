'use client';

import { useId, useState } from 'react';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { useScrollLock } from '@/hooks/use-scroll-lock';

/**
 * Compact Listen affordance for Drop reference posts — opens the existing
 * clip player (with listen sheet) rather than an in-strip immersive player.
 */
export function PostDropListenButton({
  title,
  cover,
  playables,
  creatorId,
}: {
  title: string;
  cover?: string | null;
  playables: ScarcePlayableMedia[];
  creatorId?: string | null;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const clip = playables[0] ?? null;
  const sheetOpen = open && !closing && Boolean(clip);
  useScrollLock(open || closing);

  if (!clip) return null;

  return (
    <>
      <button
        type="button"
        className="post-card-scarce-listen"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setClosing(false);
          setOpen(true);
        }}
      >
        Listen
      </button>
      <GlassSheet
        open={sheetOpen}
        onClose={() => setClosing(true)}
        onClosed={() => {
          setClosing(false);
          setOpen(false);
        }}
        tone="os"
        initialDetent="full"
        peekRatio={1}
        zIndex={56}
        ariaLabelledBy={titleId}
        backdropLabel="Close listen"
        bodyClassName="profile-support-sheet-body"
        header={
          <>
            <GestureSheetHeader
              titleId={titleId}
              verb="Listen"
              personName=""
              handle={title.trim() || 'Drop'}
              signal="reputation"
              closeAriaLabel="Close listen"
              onClose={() => setClosing(true)}
              whisper="Preview this Drop"
            />
            <Divider variant="section" className="glass-sheet-header-divider" />
          </>
        }
      >
        {sheetOpen ? (
          <ScarceClipPlayer
            clip={clip}
            tracks={playables}
            poster={cover ?? null}
            layout="cover"
            creatorId={creatorId ?? null}
            showTransport
          />
        ) : null}
      </GlassSheet>
    </>
  );
}
