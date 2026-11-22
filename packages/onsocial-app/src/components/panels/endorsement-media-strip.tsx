'use client';

import { useMemo, useState } from 'react';
import { PostMediaStrip } from '@/features/home/post-media';
import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { ScarceFeedMediumSheet } from '@/features/scarces/scarce-feed-medium-sheet';
import { useSheetMounted } from '@/hooks/use-sheet-mounted';
import { isRenderablePostAudioMime, type PostMediaItem } from '@/lib/post-media';

/**
 * Endorsement proof media — photos/video enlarge as before; audio uses the
 * same jacket → in-sheet player path as feed/quote cards.
 */
export function EndorsementMediaStrip({
  item,
  size,
  focused = false,
  activateLabel,
  onActivate,
}: {
  item: PostMediaItem;
  size: 'compact' | 'page';
  focused?: boolean;
  activateLabel?: string;
  onActivate?: () => void;
}) {
  const [audioOpen, setAudioOpen] = useState(false);
  const audioSheet = useSheetMounted(audioOpen);
  const isAudio = isRenderablePostAudioMime(item.mime);
  const playables: ScarcePlayableMedia[] = useMemo(() => {
    if (!isAudio || !item.url) return [];
    return [
      {
        url: item.url,
        mime: item.mime || 'audio/mpeg',
        ...(item.cid ? { cid: item.cid } : {}),
      },
    ];
  }, [isAudio, item.cid, item.mime, item.url]);
  const title = item.alt?.trim() || 'Audio';

  return (
    <>
      <PostMediaStrip
        items={[item]}
        size={size}
        focused={focused}
        activateLabel={activateLabel}
        onActivate={onActivate ? () => onActivate() : undefined}
        onAudioOpen={
          playables.length > 0 ? () => setAudioOpen(true) : undefined
        }
      />
      {audioSheet.mounted ? (
        <ScarceFeedMediumSheet
          open={audioOpen}
          onOpenChange={(next) => {
            setAudioOpen(next);
            if (!next) audioSheet.onClosed();
          }}
          mode="audio"
          title={title}
          playables={playables}
          feedEnlarge
        />
      ) : null}
    </>
  );
}
