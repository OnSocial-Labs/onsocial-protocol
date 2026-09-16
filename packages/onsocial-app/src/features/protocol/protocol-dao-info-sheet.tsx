'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Divider,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
  SheetFactCopy,
  SheetFactRow,
  SheetFactSection,
} from '@onsocial/ui';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import { DaoOrgHugSheet } from '@/features/protocol/dao-org-hug-sheet';
import { daoRoleGroupMembers } from '@/features/protocol/protocol-dao-role-kind';
import {
  getProtocolDaoConfig,
  getProtocolGovernanceEligibility,
  viewerCanProposeOnDao,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { fetchProtocolDaoTransferAssets } from '@/features/protocol/protocol-dao-context-client';
import { proposalPeriodNsToDays } from '@/features/protocol/protocol-policy';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { formatNearCompact } from '@/lib/format-near-balance';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { formatDaoRoleLabel } from '@/lib/page-drawer-meta';

export function formatDaoVotePolicySummary(
  policy: ProtocolDaoPolicy | null
): string {
  const threshold = policy?.default_vote_policy?.threshold;
  if (!Array.isArray(threshold) || threshold.length < 2) return 'Unknown';
  const [num, den] = threshold;
  if (
    !Number.isInteger(num) ||
    !Number.isInteger(den) ||
    den <= 0 ||
    num <= 0
  ) {
    return 'Unknown';
  }
  const pct = Math.round((num / den) * 100);
  return `${num}/${den} · ${pct}%`;
}

/** Guardian/Council size note — label matches the role that supplied the count. */
export function resolveDaoCouncilNote(
  policy: ProtocolDaoPolicy | null
): string | null {
  for (const roleId of ['guardians', 'council'] as const) {
    const role = policy?.roles?.find(
      (entry) => entry.name?.trim().toLowerCase() === roleId
    );
    const group = role ? daoRoleGroupMembers(role) : [];
    if (group.length > 0) {
      return `${formatDaoRoleLabel(roleId)} ${group.length}`;
    }
  }
  return null;
}

export function formatDaoInfoRoleList(
  roleNames: readonly string[]
): string | null {
  const labels = roleNames
    .map((name) => formatDaoRoleLabel(name) || name.trim())
    .filter(Boolean);
  return labels.length > 0 ? labels.join(' · ') : null;
}

/**
 * DAO policy snapshot — same hug family as Members / Treasury.
 */
export function ProtocolDaoInfoSheet({
  open,
  onClose,
  daoAccountId,
  accountId,
  daoPolicy,
  onOpenStake,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  daoAccountId: string | null;
  accountId: string | null;
  daoPolicy: ProtocolDaoPolicy | null;
  onOpenStake: () => void;
  onOpenSettings: () => void;
}) {
  const face = useMatchingDaoFaceEligibility(daoAccountId);
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [configName, setConfigName] = useState('');
  const [configPurpose, setConfigPurpose] = useState('');
  const [fetchedEligibility, setFetchedEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [treasuryBalances, setTreasuryBalances] = useState<{
    nearYocto: string;
    socialYocto: string;
  } | null>(null);

  useEffect(() => {
    if (!open || !daoAccountId) return;

    let cancelled = false;
    void (async () => {
      setLoadState('loading');
      setTreasuryBalances(null);
      try {
        const [config, nextEligibility, assets] = await Promise.all([
          getProtocolDaoConfig(daoAccountId),
          face || !accountId
            ? Promise.resolve(null)
            : getProtocolGovernanceEligibility(accountId, daoAccountId),
          fetchProtocolDaoTransferAssets(daoAccountId).catch(() => []),
        ]);
        if (cancelled) return;
        const nearAsset = assets.find((asset) => asset.tokenId === '');
        const socialAsset = assets.find(
          (asset) =>
            asset.tokenId.trim().toLowerCase() ===
            SOCIAL_TOKEN_CONTRACT.toLowerCase()
        );
        setConfigName(config?.name?.trim() || '');
        setConfigPurpose(config?.purpose?.trim() || '');
        setFetchedEligibility(nextEligibility);
        setTreasuryBalances({
          nearYocto: nearAsset?.balanceSmallest ?? '0',
          socialYocto: socialAsset?.balanceSmallest ?? '0',
        });
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        setLoadState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, daoAccountId, face, open]);

  const eligibility = face?.eligibility ?? fetchedEligibility;

  const roleList = useMemo(() => {
    const names =
      daoPolicy?.roles
        ?.map((role) => role.name?.trim())
        .filter((name): name is string => Boolean(name)) ?? [];
    return formatDaoInfoRoleList(names);
  }, [daoPolicy]);

  const bondNear = daoPolicy?.proposal_bond
    ? yoctoToNear(daoPolicy.proposal_bond)
    : null;
  const periodDays = proposalPeriodNsToDays(daoPolicy?.proposal_period);
  const councilNote = resolveDaoCouncilNote(daoPolicy);
  const quorum = daoPolicy?.default_vote_policy?.quorum?.trim() || '0';
  const voteSummary = formatDaoVotePolicySummary(daoPolicy);
  const explorerHref = daoAccountId
    ? `${ACTIVE_NEAR_EXPLORER_URL}/address/${daoAccountId}`
    : null;

  const positionValue = eligibility
    ? viewerCanProposeOnDao(eligibility)
      ? 'Can propose'
      : eligibility.hasStakeProposePath
        ? `Need ${formatSocialCompact(eligibility.remainingToThreshold)} more SOCIAL`
        : eligibility.foreignStakeTokenLabel
          ? `Need ${eligibility.foreignStakeTokenLabel} stake`
          : 'Not on a proposing role'
    : null;

  const positionDetail = eligibility
    ? `Delegated ${formatSocialCompact(eligibility.delegatedWeight)} · wallet ${formatSocialCompact(eligibility.walletBalance)} SOCIAL · ${formatNearCompact(eligibility.nearBalance)} NEAR`
    : null;

  if (!daoAccountId) return null;

  const footer = (
    <OsSheetFooter>
      <OsSheetActions layout="row" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="ghost"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          Settings
        </OsSheetAction>
        <OsSheetAction
          type="button"
          variant="ghost"
          onClick={() => {
            onClose();
            onOpenStake();
          }}
        >
          Stake
        </OsSheetAction>
        {explorerHref ? (
          <OsSheetAction
            type="button"
            variant="ghost"
            onClick={() => {
              window.open(explorerHref, '_blank', 'noopener,noreferrer');
            }}
          >
            Explorer
          </OsSheetAction>
        ) : null}
      </OsSheetActions>
    </OsSheetFooter>
  );

  return (
    <DaoOrgHugSheet
      open={open}
      onClose={onClose}
      daoAccountId={daoAccountId}
      title="Info"
      subtitle={configName || daoAccountId}
      closeAriaLabel="Close DAO info"
      contentClassName="dao-info-sheet os-sheet-facts"
      footer={footer}
    >
      <p className="dao-info-lead">
        On-chain policy snapshot for this board.
      </p>

      {loadState === 'loading' ? (
        <p className="dao-info-empty">Loading DAO info…</p>
      ) : null}

      {loadState === 'error' ? (
        <p className="dao-info-warn" role="alert">
          Could not load DAO config. Policy below still reflects the feed
          snapshot.
        </p>
      ) : null}

      {configPurpose ? (
        <>
          <SheetFactSection title="About">
            <SheetFactCopy>{configPurpose}</SheetFactCopy>
          </SheetFactSection>
          <Divider variant="detail" />
        </>
      ) : null}

      <SheetFactSection title="Policy">
        <SheetFactRow
          label="Bond"
          value={bondNear ? `${bondNear} NEAR` : '—'}
        />
        <SheetFactRow
          label="Period"
          value={periodDays ? `${periodDays}d` : '—'}
        />
        <SheetFactRow
          label="NEAR treasury"
          value={
            treasuryBalances
              ? `${formatNearCompact(treasuryBalances.nearYocto)} NEAR`
              : '—'
          }
        />
        <SheetFactRow
          label="SOCIAL treasury"
          value={
            treasuryBalances
              ? `${formatSocialCompact(treasuryBalances.socialYocto)} SOCIAL`
              : '—'
          }
        />
        <SheetFactRow label="Vote policy" value={voteSummary} />
        <SheetFactCopy>
          Quorum {quorum}
          {councilNote ? ` · ${councilNote}` : ''}
        </SheetFactCopy>
        {roleList ? <SheetFactRow label="Roles" value={roleList} /> : null}
      </SheetFactSection>

      {positionValue ? (
        <>
          <Divider variant="detail" />
          <SheetFactSection title="Your position">
            <p className="dao-info-position-lead">{positionValue}</p>
            {positionDetail ? (
              <SheetFactCopy>{positionDetail}</SheetFactCopy>
            ) : null}
          </SheetFactSection>
        </>
      ) : accountId && loadState === 'loading' ? (
        <p className="dao-info-empty">Checking your position…</p>
      ) : accountId ? null : (
        <p className="dao-info-empty">
          Connect a wallet to see your stake position.
        </p>
      )}
    </DaoOrgHugSheet>
  );
}
