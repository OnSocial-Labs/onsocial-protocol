'use client';

import { InfoDrawer } from '@onsocial/ui';

export const STUDIO_HELP_TITLE = 'Design your set';

const STUDIO_HELP_SUMMARY =
  'Stack layers, pick a supply, generate — each piece is one unique combo.';

/**
 * Process + control glosses. One line each for the switches creators
 * actually misread (Optional, weight); the rest stays flow, not a glossary.
 */
const STUDIO_HELP_DETAIL =
  'First layer is the background; later layers stack on top — use transparent PNG or WebP. Optional: some pieces skip that layer (e.g. no hat). Tap a tile to rename it; higher weight means more common. Set how many pieces, then Generate — OnSocial builds the set and brings you back to finish the drop. Large sets take a few minutes; keep this screen open.';

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
