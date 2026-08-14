'use client';

import { InfoDrawer } from '@onsocial/ui';

export const HUB_CREATE_HELP_TITLE = 'Your hub';

const HUB_CREATE_HELP_SUMMARY =
  'Brand home for drops — you publish, or let creators in.';

const HUB_CREATE_HELP_DETAIL =
  'Primary category powers browse. Hub ID sticks. Commission hits every sale.';

interface HubCreateHelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function HubCreateHelpDrawer({
  open,
  onClose,
}: HubCreateHelpDrawerProps) {
  return (
    <InfoDrawer
      open={open}
      onClose={onClose}
      title={HUB_CREATE_HELP_TITLE}
      summary={HUB_CREATE_HELP_SUMMARY}
      detail={HUB_CREATE_HELP_DETAIL}
    />
  );
}
