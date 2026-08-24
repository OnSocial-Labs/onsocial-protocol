'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { CommerceSheetFooterState } from '@/features/scarces/commerce-sheet-footer';
import {
  getProtocolDaoConfig,
  getProtocolGovernanceEligibility,
  viewerCanProposeOnDao,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { fetchProtocolDaoTransferAssets } from '@/features/protocol/protocol-dao-context-client';
import { proposalPeriodNsToDays } from '@/features/protocol/protocol-policy';
import { ProtocolTaskSheet } from '@/features/protocol/protocol-task-sheet';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { formatNearCompact } from '@/lib/format-near-balance';
import { formatSocialCompact } from '@/lib/format-social-balance';

function formatVotePolicySummary(policy: ProtocolDaoPolicy | null): string {
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

function resolveCouncilSize(policy: ProtocolDaoPolicy | null): number | null {
  for (const roleId of ['guardians', 'council'] as const) {
    const role = policy?.roles?.find(
      (entry) => entry.name?.trim().toLowerCase() === roleId
    );
    const group = role?.kind?.Group;
    if (Array.isArray(group) && group.length > 0) return group.length;
  }
  return null;
}

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
  const formId = useId();
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [configName, setConfigName] = useState('');
  const [configPurpose, setConfigPurpose] = useState('');
  const [eligibility, setEligibility] =
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
          accountId
            ? getProtocolGovernanceEligibility(accountId, daoAccountId)
            : Promise.resolve(null),
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
        setEligibility(nextEligibility);
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
  }, [open, daoAccountId, accountId]);

  const roleNames =
    daoPolicy?.roles
      ?.map((role) => role.name?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];
  const bondNear = daoPolicy?.proposal_bond
    ? yoctoToNear(daoPolicy.proposal_bond)
    : null;
  const periodDays = proposalPeriodNsToDays(daoPolicy?.proposal_period);
  const councilSize = resolveCouncilSize(daoPolicy);
  const quorum = daoPolicy?.default_vote_policy?.quorum?.trim() || '0';
  const voteSummary = formatVotePolicySummary(daoPolicy);
  const explorerHref = daoAccountId
    ? `${ACTIVE_NEAR_EXPLORER_URL}/address/${daoAccountId}`
    : null;

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (!open) return null;
    return {
      visible: true,
      primaryLabel: 'Close',
      primaryPendingLabel: 'Close',
      canSubmit: true,
      pending: false,
      primaryType: 'button',
      onPrimaryClick: onClose,
    };
  }, [open, onClose]);

  return (
    <ProtocolTaskSheet
      open={open}
      onClose={onClose}
      verb="DAO"
      handle={daoAccountId ?? undefined}
      whisper="On-chain policy snapshot for this board."
      closeAriaLabel="Close DAO info"
      backdropLabel="Close DAO info"
      formId={formId}
      footerState={footerState}
    >
      <div className="protocol-compose protocol-task-form" id={formId}>
        {loadState === 'loading' ? (
          <p className="protocol-empty">Loading DAO info…</p>
        ) : null}

        {loadState === 'error' ? (
          <p className="protocol-compose-note is-warn">
            Could not load DAO config. Policy below still reflects the feed
            snapshot.
          </p>
        ) : null}

        {configName ? (
          <div className="protocol-dao-info-block">
            <p className="protocol-dao-info-eyebrow">Name</p>
            <p className="protocol-dao-info-value">{configName}</p>
          </div>
        ) : null}

        {configPurpose ? (
          <div className="protocol-dao-info-block">
            <p className="protocol-dao-info-eyebrow">Purpose</p>
            <p className="protocol-dao-info-copy">{configPurpose}</p>
          </div>
        ) : null}

        <div className="protocol-policy-summary" aria-label="Policy snapshot">
          <div className="protocol-policy-summary-cell">
            <span className="protocol-policy-summary-label">Bond</span>
            <span className="protocol-policy-summary-value">
              {bondNear ? `${bondNear} NEAR` : '—'}
            </span>
          </div>
          <div className="protocol-policy-summary-cell">
            <span className="protocol-policy-summary-label">Period</span>
            <span className="protocol-policy-summary-value">
              {periodDays ? `${periodDays}d` : '—'}
            </span>
          </div>
          <div className="protocol-policy-summary-cell">
            <span className="protocol-policy-summary-label">Roles</span>
            <span className="protocol-policy-summary-value">
              {roleNames.length}
            </span>
          </div>
          <div className="protocol-policy-summary-cell">
            <span className="protocol-policy-summary-label">NEAR treasury</span>
            <span className="protocol-policy-summary-value">
              {treasuryBalances
                ? `${formatNearCompact(treasuryBalances.nearYocto)} NEAR`
                : '—'}
            </span>
          </div>
          <div className="protocol-policy-summary-cell">
            <span className="protocol-policy-summary-label">
              SOCIAL treasury
            </span>
            <span className="protocol-policy-summary-value">
              {treasuryBalances
                ? `${formatSocialCompact(treasuryBalances.socialYocto)} SOCIAL`
                : '—'}
            </span>
          </div>
        </div>

        <div className="protocol-dao-info-block">
          <p className="protocol-dao-info-eyebrow">Vote policy</p>
          <p className="protocol-dao-info-value">{voteSummary}</p>
          <p className="protocol-compose-note">
            Quorum {quorum}
            {councilSize != null ? ` · council ${councilSize}` : ''}
          </p>
        </div>

        {roleNames.length > 0 ? (
          <div className="protocol-dao-info-block">
            <p className="protocol-dao-info-eyebrow">Roles</p>
            <ul className="protocol-dao-info-roles">
              {roleNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {eligibility ? (
          <div className="protocol-dao-info-block">
            <p className="protocol-dao-info-eyebrow">Your position</p>
            <p className="protocol-dao-info-value">
              {viewerCanProposeOnDao(eligibility)
                ? 'Can propose'
                : `Need ${formatSocialCompact(eligibility.remainingToThreshold)} more SOCIAL`}
            </p>
            <p className="protocol-compose-note">
              Delegated {formatSocialCompact(eligibility.delegatedWeight)} ·
              wallet {formatSocialCompact(eligibility.walletBalance)} SOCIAL ·{' '}
              {formatNearCompact(eligibility.nearBalance)} NEAR
            </p>
          </div>
        ) : accountId && loadState === 'loading' ? (
          <p className="protocol-compose-note">Checking your position…</p>
        ) : accountId ? null : (
          <p className="protocol-compose-note">
            Connect a wallet to see your stake position.
          </p>
        )}

        <div className="protocol-dao-info-actions">
          <button
            type="button"
            className="protocol-tool"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
          >
            Settings
          </button>
          <button
            type="button"
            className="protocol-tool"
            onClick={() => {
              onClose();
              onOpenStake();
            }}
          >
            Stake
          </button>
          {explorerHref ? (
            <a
              className="protocol-tool is-ghost"
              href={explorerHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              Explorer
            </a>
          ) : null}
        </div>
      </div>
    </ProtocolTaskSheet>
  );
}
