'use client';

import { useState } from 'react';
import { DropArtOverlay } from '@/features/scarces/drop-artwork-preview';

/**
 * Commerce cover thumb — tap opens the same zoom overlay as list / Drop art.
 */
export function ScarceBuyCover({ src, label }: { src: string; label: string }) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const trimmed = src.trim();
  if (!trimmed) return null;

  return (
    <>
      <button
        type="button"
        className="scarce-buy-media scarce-buy-media--zoom"
        aria-label={`Preview ${label}`}
        aria-haspopup="dialog"
        aria-expanded={zoomOpen}
        onClick={() => setZoomOpen(true)}
      >
        <img src={trimmed} alt="" />
      </button>
      <DropArtOverlay
        open={zoomOpen}
        src={trimmed}
        label={`Preview ${label}`}
        onClose={() => setZoomOpen(false)}
      />
    </>
  );
}
