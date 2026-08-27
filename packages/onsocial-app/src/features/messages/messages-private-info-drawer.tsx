'use client';

import { InfoDrawer } from '@onsocial/ui';

export const MESSAGES_PRIVATE_INFO_TITLE = 'Private messages';

const MESSAGES_PRIVATE_INFO_SUMMARY =
  'Encrypted on your device before anything leaves this phone or browser.';

const MESSAGES_PRIVATE_INFO_DETAIL =
  'Only you and the person you\u2019re messaging can read them. Save your recovery code \u2014 it unlocks messages on a new device. On this device, passkeys skip typing the code each visit.';

interface MessagesPrivateInfoDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MessagesPrivateInfoDrawer({
  open,
  onClose,
}: MessagesPrivateInfoDrawerProps) {
  return (
    <InfoDrawer
      open={open}
      onClose={onClose}
      title={MESSAGES_PRIVATE_INFO_TITLE}
      summary={MESSAGES_PRIVATE_INFO_SUMMARY}
      detail={MESSAGES_PRIVATE_INFO_DETAIL}
    />
  );
}
