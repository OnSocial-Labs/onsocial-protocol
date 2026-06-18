'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EndorsementListCardRecord } from '@/components/ui/endorsement-flow';
import { EndorsementSupportAction } from '@/components/endorsement-support-action';
import type {
  EndorsementSupportPreviewSupporter,
  EndorsementSupportSubmitInput,
} from '@/lib/social-spend-endorsement';
import {
  fetchEndorsementSupportStats,
  resolveEndorsementSpendTargetId,
} from '@/lib/social-spend-endorsement';

export function EndorsementSupportFooter({
  record,
  pageAccountId,
  recipientDisplayName,
  viewerAccountId,
  onSupport,
}: {
  record: EndorsementListCardRecord;
  pageAccountId: string;
  recipientDisplayName: string;
  viewerAccountId: string | null;
  onSupport?: (input: EndorsementSupportSubmitInput) => Promise<string[]>;
}) {
  const spendTargetId = resolveEndorsementSpendTargetId(record);
  const [supporterCount, setSupporterCount] = useState(0);
  const [previewSupporters, setPreviewSupporters] = useState<
    EndorsementSupportPreviewSupporter[]
  >([]);
  const [refreshToken, setRefreshToken] = useState(0);

  const reloadStats = useCallback(() => {
    setRefreshToken((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!spendTargetId) {
      setSupporterCount(0);
      setPreviewSupporters([]);
      return;
    }

    let cancelled = false;
    void fetchEndorsementSupportStats(spendTargetId, {
      fresh: refreshToken > 0,
    })
      .then((stats) => {
        if (!cancelled) {
          setSupporterCount(stats.supporterCount);
          setPreviewSupporters(stats.previewSupporters);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSupporterCount(0);
          setPreviewSupporters([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken, spendTargetId]);

  if (!spendTargetId && supporterCount <= 0 && !onSupport) {
    return null;
  }

  return (
    <EndorsementSupportAction
      pageAccountId={pageAccountId}
      endorsementId={spendTargetId}
      recipientAccountId={record.target}
      recipientDisplayName={recipientDisplayName}
      issuer={record.issuer}
      topic={record.topic}
      viewerAccountId={viewerAccountId}
      supporterCount={supporterCount}
      previewSupporters={previewSupporters}
      onSupport={onSupport}
      onSupportConfirmed={reloadStats}
    />
  );
}
