'use client';

import { InfoDrawer } from '@onsocial/ui';
import {
  APP_SOCIAL_HELP_DETAIL,
  APP_SOCIAL_HELP_SUMMARY,
  APP_SOCIAL_HELP_TITLE,
} from '@/lib/app-reward-constants';

interface AppSocialHelpCardProps {
  open: boolean;
  onClose: () => void;
}

/** Content-hugging SOCIAL help — shared InfoDrawer chrome. */
export function AppSocialHelpCard({ open, onClose }: AppSocialHelpCardProps) {
  return (
    <InfoDrawer
      open={open}
      onClose={onClose}
      title={APP_SOCIAL_HELP_TITLE}
      summary={APP_SOCIAL_HELP_SUMMARY}
      detail={APP_SOCIAL_HELP_DETAIL}
    />
  );
}
