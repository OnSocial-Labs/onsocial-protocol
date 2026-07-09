'use client';

import { useCallback, useId, useMemo, useState, type CSSProperties } from 'react';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import { ProfileSupportForm } from '@/components/portfolio/profile-support-form';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { displayName, fallbackLabel } from '@/lib/profile-display';

interface ProfileSupportSheetProps {
  open: boolean;
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
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
  const panelStyle = useMemo(
    () =>
      mood
        ? (supportSheetPanelStyle(mood.cssVars) as CSSProperties)
        : undefined,
    [mood]
  );

  // Remount the form each open so amount/presets reset without an effect.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFormKey((key) => key + 1);
  }

  useScrollLock(open || closing);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      moodId={mood?.id}
      panelStyle={panelStyle}
      panelClassName="profile-support-sheet-panel"
      zIndex={56}
      ariaLabelledBy={titleId}
      backdropLabel="Close support"
      bodyClassName="profile-support-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Support"
            personName={name}
            handle={handle}
            signal="reputation"
            closeAriaLabel="Close support"
            onClose={requestClose}
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <ProfileSupportForm
        key={formKey}
        pageAccountId={pageAccountId}
        profileName={profileName}
        onSuccess={requestClose}
      />
    </GlassSheet>
  );
}
