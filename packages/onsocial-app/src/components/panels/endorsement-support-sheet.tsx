'use client';

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { OsGestureSheet } from '@onsocial/ui';
import { EndorsementSupportForm } from '@/components/panels/endorsement-support-form';
import {
  CommerceSheetFooter,
  commerceFooterStatesEqual,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { humanizeEndorsementTopic } from '@/lib/endorsement-display';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { SHEET_Z } from '@/lib/sheet-z';

export interface EndorsementSupportTarget {
  endorsementId: string;
  recipientAccountId: string;
  recipientName?: string | null;
  issuer: string;
  topic?: string | null;
}

interface EndorsementSupportSheetProps {
  open: boolean;
  target: EndorsementSupportTarget | null;
  mood?: ResolvedMood | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  zIndex?: number;
}

/**
 * SOCIAL spend sheet for supporting an endorsement — same money gesture
 * family as profile Support (`OsGestureSheet` + AmountField). Topic lives in
 * the header whisper, not a body intro block.
 */
export function EndorsementSupportSheet({
  open,
  target,
  mood = null,
  onOpenChange,
  onSuccess,
  zIndex = SHEET_Z.facts,
}: EndorsementSupportSheetProps) {
  const titleId = useId();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [footerState, setFooterState] =
    useState<CommerceSheetFooterState | null>(null);
  const sheetOpen = open && !closing && Boolean(target);
  const recipientAccountId = target?.recipientAccountId ?? '';
  const name = displayName(
    recipientAccountId,
    target?.recipientName ?? undefined
  );
  const handle = fallbackLabel(recipientAccountId);
  const topicLabel = humanizeEndorsementTopic(target?.topic);
  const whisper = topicLabel
    ? `Vouch for ${topicLabel}`
    : 'Support this public vouch with SOCIAL.';
  const fetchedMood = usePageOwnerMood(
    recipientAccountId,
    Boolean(recipientAccountId) && (open || closing)
  );
  const effectiveMood = mood ?? fetchedMood;
  const { panelStyle: keyboardPanelStyle, keyboardOpen } =
    useCommerceSheetKeyboard(sheetOpen);
  const moodPanelStyle = useMemo(
    () =>
      effectiveMood
        ? (supportSheetPanelStyle(effectiveMood.cssVars) as CSSProperties)
        : undefined,
    [effectiveMood]
  );
  const panelStyle = useMemo(() => {
    if (!moodPanelStyle && !keyboardPanelStyle) return undefined;
    return { ...moodPanelStyle, ...keyboardPanelStyle };
  }, [keyboardPanelStyle, moodPanelStyle]);

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
      verb="Support endorsement"
      personName={name}
      handle={handle}
      signal="reputation"
      whisper={whisper}
      closeAriaLabel="Close endorsement support"
      backdropLabel="Close endorsement support"
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
      {target ? (
        <EndorsementSupportForm
          key={formKey}
          formId={formId}
          endorsementId={target.endorsementId}
          recipientAccountId={target.recipientAccountId}
          recipientName={target.recipientName}
          issuer={target.issuer}
          topic={target.topic}
          onFooterStateChange={handleFooterStateChange}
          onSuccess={() => {
            onSuccess?.();
            requestClose();
          }}
        />
      ) : null}
    </OsGestureSheet>
  );
}
