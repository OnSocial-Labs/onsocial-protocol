'use client';

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { OsGestureSheet } from '@onsocial/ui';
import { ProfileSupportForm } from '@/components/portfolio/profile-support-form';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { displayName, fallbackLabel } from '@/lib/profile-display';

interface ProfileSupportSheetProps {
  open: boolean;
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  /** Page owner mood when already known (portfolio). Otherwise fetched. */
  mood?: ResolvedMood | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dedicated money sheet for profile Support — one job, same family as
 * Endorse compose. Face Support and drawer Stand · Support open this; do not put
 * the amount form on the mood face.
 */
export function ProfileSupportSheet({
  open,
  pageAccountId,
  profileName = null,
  avatarUrl: _avatarUrl = null,
  mood = null,
  onOpenChange,
}: ProfileSupportSheetProps) {
  void _avatarUrl;
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing;
  const name = displayName(pageAccountId, profileName ?? undefined);
  const handle = fallbackLabel(pageAccountId);
  const fetchedMood = usePageOwnerMood(pageAccountId, open || closing);
  const effectiveMood = mood ?? fetchedMood;
  const panelStyle = useMemo(
    () =>
      effectiveMood
        ? (supportSheetPanelStyle(effectiveMood.cssVars) as CSSProperties)
        : undefined,
    [effectiveMood]
  );

  // Remount the form each open so amount/presets reset without an effect.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFormKey((key) => key + 1);
  }

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <OsGestureSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      verb="Support"
      personName={name}
      handle={handle}
      signal="reputation"
      closeAriaLabel="Close support"
      backdropLabel="Close support"
      moodId={effectiveMood?.id}
      panelStyle={panelStyle}
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={56}
    >
      <ProfileSupportForm
        key={formKey}
        pageAccountId={pageAccountId}
        profileName={profileName}
        onSuccess={requestClose}
      />
    </OsGestureSheet>
  );
}
