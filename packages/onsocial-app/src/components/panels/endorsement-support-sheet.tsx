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
  const [closing, setClosing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
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
  const panelStyle = useMemo(
    () =>
      effectiveMood
        ? (supportSheetPanelStyle(effectiveMood.cssVars) as CSSProperties)
        : undefined,
    [effectiveMood]
  );

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
      verb="Support endorsement"
      personName={name}
      handle={handle}
      signal="reputation"
      whisper={whisper}
      closeAriaLabel="Close endorsement support"
      backdropLabel="Close endorsement support"
      moodId={effectiveMood?.id}
      panelStyle={panelStyle}
      bodyClassName="profile-support-sheet-body"
      titleId={titleId}
      zIndex={zIndex}
    >
      {target ? (
        <EndorsementSupportForm
          key={formKey}
          endorsementId={target.endorsementId}
          recipientAccountId={target.recipientAccountId}
          recipientName={target.recipientName}
          issuer={target.issuer}
          topic={target.topic}
          onSuccess={() => {
            onSuccess?.();
            requestClose();
          }}
        />
      ) : null}
    </OsGestureSheet>
  );
}
