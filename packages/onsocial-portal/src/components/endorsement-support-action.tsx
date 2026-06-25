'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useReducedMotion } from 'framer-motion';
import { HeartHandshake } from 'lucide-react';
import { EndorsementSupportModal } from '@/components/endorsement-support-modal';
import { EndorsementSupportPreview } from '@/components/endorsement-support-preview';
import {
  EndorsementFooterIconButton,
  endorsementFooterRailIconClass,
  endorsementShareFooterLeadingClass,
  endorsementShareIconButtonClass,
} from '@/components/ui/endorsement-share';
import { getPortalEndorsementSupportersUrl } from '@/lib/portal-config';
import { isEndorsementSpendTargetId } from '@/lib/social-spend-endorsement';
import type {
  EndorsementSupportPreviewSupporter,
  EndorsementSupportSubmitInput,
} from '@/lib/social-spend-endorsement';
import { cn } from '@/lib/utils';

const supportRailClass = cn(
  endorsementShareFooterLeadingClass,
  'inline-flex items-center justify-end gap-1.5'
);

/** Heart pop + ring duration — defer stats reload until this finishes. */
const SUPPORT_CELEBRATE_MS = 1200;

function stopRowActivation(event: MouseEvent) {
  event.stopPropagation();
}

function SupportHeartIcon({
  highlighted,
  popping,
}: {
  highlighted: boolean;
  popping?: boolean;
}) {
  return (
    <HeartHandshake
      className={cn(
        endorsementFooterRailIconClass,
        highlighted ? 'portal-green-icon' : 'text-muted-foreground',
        popping && 'support-heart-pop'
      )}
      strokeWidth={2}
    />
  );
}

export function EndorsementSupportAction({
  pageAccountId,
  endorsementId,
  recipientAccountId,
  recipientDisplayName,
  issuer,
  issuerName,
  targetName,
  issuerAvatarUrl,
  targetAvatarUrl,
  topic,
  viewerAccountId,
  supporterCount = 0,
  previewSupporters = [],
  onSupport,
  onSupportConfirmed,
  suppressSupportersPreview = false,
}: {
  pageAccountId: string;
  endorsementId: string | null | undefined;
  recipientAccountId: string;
  recipientDisplayName: string;
  issuer: string;
  issuerName?: string | null;
  targetName?: string | null;
  issuerAvatarUrl?: string | null;
  targetAvatarUrl?: string | null;
  topic?: string | null;
  viewerAccountId: string | null;
  supporterCount?: number;
  previewSupporters?: EndorsementSupportPreviewSupporter[];
  onSupport?: (input: EndorsementSupportSubmitInput) => Promise<string[]>;
  onSupportConfirmed?: () => void;
  /** Hide avatar stack + link when already on the supporters page. */
  suppressSupportersPreview?: boolean;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [supportOpen, setSupportOpen] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const celebrateTimeoutRef = useRef<number | null>(null);
  const normalizedId =
    typeof endorsementId === 'string' ? endorsementId.trim() : '';
  const canSupport = Boolean(
    isEndorsementSpendTargetId(normalizedId) &&
      onSupport &&
      (!viewerAccountId || recipientAccountId !== viewerAccountId)
  );
  const hasSupporters = supporterCount > 0;

  useEffect(() => {
    return () => {
      if (celebrateTimeoutRef.current !== null) {
        window.clearTimeout(celebrateTimeoutRef.current);
      }
    };
  }, []);

  if (!canSupport && !hasSupporters) {
    return null;
  }

  const openSupportersPage = () => {
    if (!pageAccountId.trim() || !isEndorsementSpendTargetId(normalizedId)) {
      return;
    }
    router.push(
      getPortalEndorsementSupportersUrl(pageAccountId.trim(), {
        endorsementId: normalizedId,
        issuer,
        target: recipientAccountId,
        topic,
      })
    );
  };

  return (
    <>
      <span
        className={supportRailClass}
        onClick={stopRowActivation}
        onPointerDown={stopRowActivation}
      >
        {hasSupporters && !suppressSupportersPreview ? (
          <EndorsementSupportPreview
            previewSupporters={previewSupporters}
            supporterCount={supporterCount}
            onClick={openSupportersPage}
          />
        ) : null}
        {canSupport ? (
          <EndorsementFooterIconButton
            className={cn(
              'shrink-0 overflow-visible',
              celebrating && 'text-[var(--portal-green)]',
              hasSupporters
                ? 'text-[var(--portal-green)]'
                : 'hover:text-[var(--portal-green)]'
            )}
            aria-label="Support this endorsement with SOCIAL"
            onClick={(event) => {
              stopRowActivation(event);
              setSupportOpen(true);
            }}
          >
            {celebrating && !reduceMotion ? (
              <span
                aria-hidden="true"
                className="support-ring-burst pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 rounded-full border border-[var(--portal-green)]/50"
              />
            ) : null}
            <SupportHeartIcon
              highlighted={hasSupporters}
              popping={celebrating && !reduceMotion}
            />
          </EndorsementFooterIconButton>
        ) : (
          <span
            className={cn(endorsementShareIconButtonClass, 'shrink-0')}
            aria-hidden="true"
          >
            <SupportHeartIcon highlighted={hasSupporters} />
          </span>
        )}
      </span>

      {canSupport && onSupport ? (
        <EndorsementSupportModal
          open={supportOpen}
          endorsementId={normalizedId}
          recipientAccountId={recipientAccountId}
          recipientDisplayName={recipientDisplayName}
          issuer={issuer}
          issuerName={issuerName}
          targetName={targetName}
          issuerAvatarUrl={issuerAvatarUrl}
          targetAvatarUrl={targetAvatarUrl}
          topic={topic}
          onOpenChange={setSupportOpen}
          onSupport={onSupport}
          onConfirmed={() => {
            setCelebrating(true);
            if (celebrateTimeoutRef.current !== null) {
              window.clearTimeout(celebrateTimeoutRef.current);
            }
            celebrateTimeoutRef.current = window.setTimeout(() => {
              setCelebrating(false);
              celebrateTimeoutRef.current = null;
              onSupportConfirmed?.();
            }, SUPPORT_CELEBRATE_MS);
          }}
        />
      ) : null}
    </>
  );
}
