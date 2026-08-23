'use client';

import { InfoDrawer } from '@onsocial/ui';

export const STUDIO_HELP_TITLE = 'Design your set';

const STUDIO_HELP_SUMMARY =
  'Bring PNG or WebP layers — stack, generate, start the drop.';

/**
 * Process + control glosses. One line each for the switches creators
 * actually misread (Optional, weight); the rest stays flow, not a glossary.
 */
const STUDIO_HELP_DETAIL =
  'First layer is the background; later layers stack on top — use transparent PNG or WebP, all the same pixel size. Optional: some pieces skip that layer (e.g. no hat). Tap a tile to rename it; higher weight means more common. Set how many pieces, then Generate. You can step back to the drop form — layers stay, and a large render keeps going and resumes if you refresh.';

interface GenerativeStudioHelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function GenerativeStudioHelpDrawer({
  open,
  onClose,
}: GenerativeStudioHelpDrawerProps) {
  return (
    <InfoDrawer
      open={open}
      onClose={onClose}
      title={STUDIO_HELP_TITLE}
      summary={STUDIO_HELP_SUMMARY}
      detail={STUDIO_HELP_DETAIL}
    />
  );
}
