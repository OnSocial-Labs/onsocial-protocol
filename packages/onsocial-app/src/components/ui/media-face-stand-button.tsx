'use client';

import { StandingToggle } from '@/components/ui/standing-toggle';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerRelationship } from '@/hooks/use-viewer-relationship';
import { useViewerStanding } from '@/hooks/use-viewer-standing';
import { peekPostAuthorKind } from '@/hooks/use-post-author-profiles';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';
import {
  isDaoStandingTarget,
  rememberDaoStandingTarget,
} from '@/lib/dao-standing-account';
import {
  formatStandingActionError,
  isWalletUserCancellation,
} from '@/lib/wallet-errors';

/** Face-row Stand — same control as the feed video peek. Errors toast only. */
export function MediaFaceStandButton({
  accountId,
  name,
  avatarUrl = null,
  className,
}: {
  accountId: string;
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  const { isConnected, connect } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const { viewerStanding, theyStandWithViewer } =
    useViewerRelationship(accountId);
  const { updateStanding, isStandingPendingForTarget } =
    useViewerStanding(accountId);
  const pending = isStandingPendingForTarget(accountId);
  const isDao = isDaoStandingTarget(
    accountId,
    peekPostAuthorKind(accountId) === 'dao'
  );

  async function handleStandToggle() {
    if (pending) return;
    if (!isConnected) {
      await connect();
      return;
    }
    if (isBlockEitherWay(accountId)) {
      setTxResult({
        type: 'error',
        msg: 'Standing is unavailable while a block is in place.',
      });
      return;
    }
    if (isDao) rememberDaoStandingTarget(accountId);
    try {
      await updateStanding(
        {
          accountId,
          name: name.trim() || null,
          bio: null,
          avatarUrl: avatarUrl ?? null,
          isDao: isDao || undefined,
          theyStandWithViewer,
        },
        !viewerStanding
      );
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg: formatStandingActionError(error),
      });
    }
  }

  return (
    <button
      type="button"
      className={`standing-action group${
        className ? ` ${className}` : ''
      }${viewerStanding ? ' is-standing' : ''}`}
      disabled={pending}
      onClick={() => void handleStandToggle()}
      aria-label={
        viewerStanding ? `Step back from ${name}` : `Stand with ${name}`
      }
    >
      <StandingToggle active={viewerStanding} pending={pending} />
    </button>
  );
}
