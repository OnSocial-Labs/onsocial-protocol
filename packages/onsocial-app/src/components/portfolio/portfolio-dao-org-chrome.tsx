'use client';

/**
 * DAO org tools on the person portfolio face — quiet standing-style row + overlays.
 * Replaces the separate `/dao` workspace shell.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { rememberCommunityDao } from '@/features/protocol/dao-accounts';
import type { DaoBranding } from '@/features/protocol/dao-branding';
import { DaoEditSheet } from '@/features/protocol/dao-edit-sheet';
import { DaoBoostSheet } from '@/features/protocol/dao-boost-sheet';
import {
  DaoManageSheet,
  type DaoManageAction,
} from '@/features/protocol/dao-manage-sheet';
import { DaoMembersSheet } from '@/features/protocol/dao-members-sheet';
import { DaoProposalsSheet } from '@/features/protocol/dao-proposals-sheet';
import { DaoTreasurySheet } from '@/features/protocol/dao-treasury-sheet';
import type { DaoWorkspaceTool } from '@/features/protocol/dao-workspace-panel';
import { DaoWorkspaceToolsHost } from '@/features/protocol/dao-workspace-tools-host';
import { hasDaoProposalsDeepLink } from '@/features/protocol/protocol-proposal-family';
import { useDaoPageCapability } from '@/hooks/use-dao-page-capability';
import { softIndexDaoMemberships } from '@/features/protocol/my-daos-client';
import {
  bumpDaoWorkspacePrefetch,
  scheduleDaoWorkspacePrefetch,
} from '@/lib/dao-workspace-prefetch';
import { buildDaoClaimSupportProposalPayload } from '@/features/protocol/dao-claim-support';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import { submitProtocolProposal } from '@/features/protocol/protocol-create';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';
import { rememberDaoStandingTarget } from '@/lib/dao-standing-account';
import { seedDaoBrandingCache } from '@/lib/dao-shell-cache';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { fetchProfileSupportBalanceYocto } from '@/lib/social-spend-profile';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type PortfolioOverlay =
  | 'manage'
  | 'members'
  | 'treasury'
  | 'proposals'
  | 'tools'
  | 'edit'
  | 'boost'
  | null;

export type PortfolioDaoOrgChromeProps = {
  daoAccountId: string;
  daoName: string;
  initialBranding: DaoBranding | null;
  configName: string | null;
  configPurpose: string | null;
  configMetadata: string;
};

function PortfolioDaoOrgChromeInner({
  daoAccountId,
  daoName,
  initialBranding,
  configName,
  configPurpose,
  configMetadata,
}: PortfolioDaoOrgChromeProps) {
  const searchParams = useSearchParams();
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const {
    registerDaoStakeRequest,
    unregisterDaoStakeRequest,
    requestOpenMoodSheet,
  } = usePortfolioMoodPreview();
  const [overlay, setOverlay] = useState<PortfolioOverlay>(() =>
    hasDaoProposalsDeepLink(searchParams) ? 'proposals' : null
  );
  const [toolRequest, setToolRequest] = useState<DaoWorkspaceTool>(null);
  const {
    canPropose,
    isLoading: councilAccessPending,
    eligibility: liveEligibility,
    hasStakeProposePath,
    stakePathReady,
  } = useDaoPageCapability(daoAccountId, true);
  const [claimableYocto, setClaimableYocto] = useState<bigint | null>(null);
  const [claimPending, setClaimPending] = useState(false);
  const [claimConfirmOpen, setClaimConfirmOpen] = useState(false);

  const title = initialBranding?.name?.trim() || daoName;

  useEffect(() => {
    if (initialBranding) {
      seedDaoBrandingCache(daoAccountId, initialBranding);
    }
  }, [initialBranding, daoAccountId]);

  useEffect(() => {
    rememberDaoStandingTarget(daoAccountId);
    if (initialBranding?.kind === 'community') {
      rememberCommunityDao(daoAccountId);
    }
  }, [initialBranding?.kind, daoAccountId]);

  useEffect(() => {
    softIndexDaoMemberships(daoAccountId);
    return scheduleDaoWorkspacePrefetch(daoAccountId);
  }, [daoAccountId]);

  useEffect(() => {
    if (!hasDaoProposalsDeepLink(searchParams)) return;
    queueMicrotask(() => {
      setOverlay((current) => (current == null ? 'proposals' : current));
    });
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    void fetchProfileSupportBalanceYocto(daoAccountId, { fresh: true })
      .then((next) => {
        if (!cancelled) setClaimableYocto(next);
      })
      .catch(() => {
        if (!cancelled) setClaimableYocto(0n);
      });
    return () => {
      cancelled = true;
    };
  }, [daoAccountId]);

  const openStakeFromFace = useCallback(() => {
    setOverlay('tools');
    setToolRequest('stake');
  }, []);

  useEffect(() => {
    registerDaoStakeRequest(openStakeFromFace);
    return () => unregisterDaoStakeRequest();
  }, [openStakeFromFace, registerDaoStakeRequest, unregisterDaoStakeRequest]);

  const canEdit = canPropose;
  const claimSupportLabel =
    canEdit && claimableYocto != null && claimableYocto > 0n
      ? formatSocialCompact(claimableYocto.toString())
      : null;

  const handleProposed = useCallback(() => {
    setOverlay(null);
  }, []);

  const handleClaimSupport = useCallback(async () => {
    if (claimPending || !claimableYocto || claimableYocto <= 0n) return;
    setClaimPending(true);
    try {
      const { accountId: signerId, wallet } = await getSigningWallet();
      const amountLabel = formatSocialCompact(claimableYocto.toString());
      const payload = buildDaoClaimSupportProposalPayload({
        daoLabel: title,
        amountLabel,
      });
      const response = await submitProtocolProposal({
        daoAccountId,
        accountId: signerId,
        wallet,
        payload,
      });
      const confirmed = await trackTransaction({
        txHashes: response.txHashes,
        submittedMessage: txToastGovPending.actionSubmitted('Claim support'),
        successMessage:
          txToastGovSuccess.actionConfirmed('Claim support proposal') +
          ' Approve to collect.',
        failureMessage: txToastGovError.actionFailed('Claim support proposal'),
      });
      if (confirmed) {
        bumpDaoWorkspacePrefetch(daoAccountId);
        setClaimConfirmOpen(false);
        setOverlay(null);
      }
    } catch (cause) {
      if (!isWalletUserCancellation(cause)) {
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastGovError.actionFailed('Claim support proposal'),
        });
      }
    } finally {
      setClaimPending(false);
    }
  }, [
    claimPending,
    claimableYocto,
    daoAccountId,
    getSigningWallet,
    setTxResult,
    title,
    trackTransaction,
  ]);

  const handleToolsHostClose = useCallback(() => {
    setToolRequest(null);
    setOverlay((current) => (current === 'tools' ? null : current));
  }, []);

  const handleManageAction = useCallback(
    (action: DaoManageAction) => {
      if (action === 'edit') {
        setOverlay('edit');
        return;
      }
      if (action === 'propose-mood') {
        setOverlay(null);
        requestOpenMoodSheet();
        return;
      }
      if (action === 'claim-support') {
        setOverlay(null);
        setClaimConfirmOpen(true);
        return;
      }
      if (action === 'boost') {
        setOverlay('boost');
        return;
      }
      setOverlay('tools');
      setToolRequest(action as DaoWorkspaceTool);
    },
    [requestOpenMoodSheet]
  );

  const tools = [
    { id: 'proposals' as const, label: 'Proposals' },
    { id: 'members' as const, label: 'Members' },
    { id: 'treasury' as const, label: 'Treasury' },
    { id: 'manage' as const, label: 'Manage' },
  ];

  return (
    <>
      <nav className="portfolio-dao-tools-inline" aria-label="DAO tools">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className="portfolio-dao-tools-link"
            aria-expanded={overlay === tool.id}
            onClick={() =>
              setOverlay((current) => (current === tool.id ? null : tool.id))
            }
          >
            {tool.label}
          </button>
        ))}
      </nav>

      <DaoManageSheet
        open={overlay === 'manage'}
        daoName={title}
        canEdit={canEdit}
        showStake={!stakePathReady || hasStakeProposePath}
        claimSupportLabel={claimSupportLabel}
        councilAccessPending={councilAccessPending}
        onClose={() =>
          setOverlay((current) => (current === 'manage' ? null : current))
        }
        onAction={handleManageAction}
      />

      <DaoProposeConfirmSheet
        open={claimConfirmOpen}
        title="Propose claim support?"
        body={
          claimSupportLabel
            ? `Submit a proposal to collect ${claimSupportLabel} from the Support pot into the DAO wallet.`
            : 'Submit a proposal to collect Support into the DAO wallet.'
        }
        eligibility={liveEligibility}
        eligibilityLoading={councilAccessPending}
        pending={claimPending}
        proposeLabel="Propose"
        onDiscard={() => setClaimConfirmOpen(false)}
        onPropose={() => {
          void handleClaimSupport();
        }}
        onStake={() => {
          setClaimConfirmOpen(false);
          openStakeFromFace();
        }}
      />

      <DaoProposalsSheet
        open={overlay === 'proposals'}
        daoAccountId={daoAccountId}
        daoName={title}
        canPropose={canPropose}
        onClose={() =>
          setOverlay((current) => (current === 'proposals' ? null : current))
        }
      />

      <DaoWorkspaceToolsHost
        open={overlay === 'tools'}
        daoAccountId={daoAccountId}
        toolRequest={overlay === 'tools' ? toolRequest : null}
        onClose={handleToolsHostClose}
      />

      <DaoMembersSheet
        open={overlay === 'members'}
        daoAccountId={daoAccountId}
        daoName={title}
        onRequestStake={openStakeFromFace}
        onClose={() =>
          setOverlay((current) => (current === 'members' ? null : current))
        }
      />

      <DaoTreasurySheet
        open={overlay === 'treasury'}
        daoAccountId={daoAccountId}
        daoName={title}
        onClose={() =>
          setOverlay((current) => (current === 'treasury' ? null : current))
        }
      />

      {initialBranding ? (
        <DaoEditSheet
          open={overlay === 'edit'}
          daoAccountId={daoAccountId}
          branding={initialBranding}
          configName={configName ?? initialBranding.name}
          configPurpose={configPurpose ?? initialBranding.description ?? ''}
          configMetadata={configMetadata}
          onClose={() =>
            setOverlay((current) => (current === 'edit' ? null : current))
          }
          onProposed={handleProposed}
        />
      ) : null}

      <DaoBoostSheet
        open={overlay === 'boost'}
        daoAccountId={daoAccountId}
        daoName={title}
        eligibility={liveEligibility}
        eligibilityLoading={councilAccessPending}
        onClose={() =>
          setOverlay((current) => (current === 'boost' ? null : current))
        }
        onRequestStake={openStakeFromFace}
      />
    </>
  );
}

/** Suspense boundary for `useSearchParams` deep-links. */
export function PortfolioDaoOrgChrome(props: PortfolioDaoOrgChromeProps) {
  return (
    <Suspense
      fallback={
        <nav className="portfolio-dao-tools-inline" aria-hidden>
          <span className="portfolio-dao-tools-link">Proposals</span>
          <span className="portfolio-dao-tools-link">Members</span>
          <span className="portfolio-dao-tools-link">Treasury</span>
          <span className="portfolio-dao-tools-link">Manage</span>
        </nav>
      }
    >
      <PortfolioDaoOrgChromeInner {...props} />
    </Suspense>
  );
}
