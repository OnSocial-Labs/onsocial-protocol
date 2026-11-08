'use client';

import { useTranslations } from 'next-intl';
import { InfoDrawer } from '@onsocial/ui';

export const HUB_CREATE_HELP_TITLE = 'Your hub';

interface HubCreateHelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function HubCreateHelpDrawer({
  open,
  onClose,
}: HubCreateHelpDrawerProps) {
  const t = useTranslations('shell');
  return (
    <InfoDrawer
      open={open}
      onClose={onClose}
      title={t('help.hubTitle')}
      summary={t('help.hubSummary')}
      detail={t('help.hubDetail')}
      gotItLabel={t('help.gotIt')}
    />
  );
}
