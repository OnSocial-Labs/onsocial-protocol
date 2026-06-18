'use client';

import { useState } from 'react';
import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
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

function stopRowActivation(event: MouseEvent) {
  event.stopPropagation();
}

function SupportHeartIcon({ highlighted }: { highlighted: boolean }) {
  return (
    <HeartHandshake
      className={cn(
        endorsementFooterRailIconClass,
        highlighted ? 'portal-green-icon' : 'text-muted-foreground'
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
  topic,
  viewerAccountId,
  supporterCount = 0,
  previewSupporters = [],
  onSupport,
  onSupportConfirmed,
}: {
  pageAccountId: string;
  endorsementId: string | null | undefined;
  recipientAccountId: string;
  recipientDisplayName: string;
  issuer: string;
  topic?: string | null;
  viewerAccountId: string | null;
  supporterCount?: number;
  previewSupporters?: EndorsementSupportPreviewSupporter[];
  onSupport?: (input: EndorsementSupportSubmitInput) => Promise<string[]>;
  onSupportConfirmed?: () => void;
}) {
  const router = useRouter();
  const [supportOpen, setSupportOpen] = useState(false);
  const normalizedId =
    typeof endorsementId === 'string' ? endorsementId.trim() : '';
  const canSupport = Boolean(
    isEndorsementSpendTargetId(normalizedId) &&
      onSupport &&
      (!viewerAccountId || recipientAccountId !== viewerAccountId)
  );
  const hasSupporters = supporterCount > 0;

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
        {hasSupporters ? (
          <EndorsementSupportPreview
            previewSupporters={previewSupporters}
            supporterCount={supporterCount}
            onClick={openSupportersPage}
          />
        ) : null}
        {canSupport ? (
          <EndorsementFooterIconButton
            className={cn(
              'shrink-0',
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
            <SupportHeartIcon highlighted={hasSupporters} />
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
          topic={topic}
          onOpenChange={setSupportOpen}
          onSupport={async (input) => {
            const txHashes = await onSupport(input);
            onSupportConfirmed?.();
            return txHashes;
          }}
        />
      ) : null}
    </>
  );
}
