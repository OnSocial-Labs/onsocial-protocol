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
import {
  CommerceSheetFooter,
  commerceFooterStatesEqual,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { displayName } from '@/lib/profile-display';
import { SHEET_Z } from '@/lib/sheet-z';

interface ProfileSupportSheetProps {
  open: boolean;
  pageAccountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  /** Page owner mood when already known (portfolio). Otherwise fetched. */
  mood?: ResolvedMood | null;
  onOpenChange: (open: boolean) => void;
  zIndex?: number;
}

/**
 * Dedicated money sheet for profile Support. Header is the verb only, same
 * slot as Buy and Sell. The recipient face sits on the first body row.
 */
export function ProfileSupportSheet({
  open,
  pageAccountId,
  profileName = null,
  avatarUrl = null,
  mood = null,
  onOpenChange,
  zIndex = SHEET_Z.gesture,
}: ProfileSupportSheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState | null>(null);
  const sheetOpen = open && !closing;
  const name = displayName(pageAccountId, profileName ?? undefined);
  const fetchedMood = usePageOwnerMood(pageAccountId, open || closing);
  const effectiveMood = mood ?? fetchedMood;
  const { keyboardStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);
  const moodPanelStyle = useMemo(
    () =>
      effectiveMood
        ? (supportSheetPanelStyle(effectiveMood.cssVars) as CSSProperties)
        : undefined,
    [effectiveMood]
  );
  const panelStyle = useMemo(() => {
    if (!moodPanelStyle && !keyboardStyle) return undefined;
    return { ...moodPanelStyle, ...keyboardStyle };
  }, [keyboardStyle, moodPanelStyle]);

  // Remount the form each open so amount/presets reset without an effect.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormKey((key) => key + 1);
      setFooterState(null);
    }
  }

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    setFooterState(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleFooterStateChange = useCallback(
    (state: CommerceSheetFooterState | null) => {
      setFooterState((prev) =>
        commerceFooterStatesEqual(prev, state) ? prev : state
      );
    },
    []
  );

  return (
    <OsGestureSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      verb="Support"
      titleLabel={`Support ${name}`}
      signal="reputation"
      closeAriaLabel="Close support"
      backdropLabel="Close support"
      moodId={effectiveMood?.id}
      size="tall"
      keyboardOpen={keyboardOpen}
      panelStyle={panelStyle}
      panelClassName="profile-support-sheet-panel"
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={zIndex}
      footer={
        footerState?.visible ? (
          <CommerceSheetFooter
            formId={formId}
            keyboardOpen={keyboardOpen}
            state={footerState}
          />
        ) : undefined
      }
    >
      <ProfileSupportForm
        key={formKey}
        formId={formId}
        pageAccountId={pageAccountId}
        profileName={profileName}
        avatarUrl={avatarUrl}
        onFooterStateChange={handleFooterStateChange}
        onSuccess={requestClose}
      />
    </OsGestureSheet>
  );
}
