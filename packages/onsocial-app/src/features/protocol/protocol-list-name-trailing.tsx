'use client';

import type { PageMoodId } from '@onsocial/sdk';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';

/** @deprecated Prefer {@link ProtocolNameTrailing}. */
export function ProtocolListNameTrailing({
  accountId,
  isDao = false,
  moodId = null,
}: {
  accountId: string;
  isDao?: boolean;
  moodId?: PageMoodId | null;
  size?: 'face' | 'row';
}) {
  return (
    <ProtocolNameTrailing
      accountId={accountId}
      isDao={isDao}
      moodId={moodId}
    />
  );
}
