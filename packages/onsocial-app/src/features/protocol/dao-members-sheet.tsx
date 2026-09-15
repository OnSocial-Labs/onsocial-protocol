'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Divider, OsSheetAction, OsSheetActions, OsSheetFooter } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { DaoOrgHugSheet } from '@/features/protocol/dao-org-hug-sheet';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { listDaoMembershipSections } from '@/features/protocol/dao-group-roles';
import {
  DAO_STAKE_ROLE_CONNECT_CTA,
  DAO_STAKE_ROLE_META,
  DAO_STAKE_ROLE_MET_STATUS,
  DAO_STAKE_ROLE_PROGRESS_LABEL,
  daoStakeRoleCtaLabel,
  daoStakeRoleGateCopy,
  daoStakeRoleProgressValue,
} from '@/features/protocol/dao-members-copy';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { fetchProtocolFeed } from '@/features/protocol/protocol-feed-client';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import {
  readDaoFeedCache,
  writeDaoFeedCache,
} from '@/lib/dao-workspace-prefetch';
import { isProtocolFacePairDao } from '@/lib/portfolio-dao-entity';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { formatDaoRoleLabel } from '@/lib/page-drawer-meta';
import { portfolioPath } from '@/lib/overlay-routes';

/**
 * DAO membership — Group people as circles; Member roles show stake threshold
 * + viewer weight when connected (Group-or-stake model).
 */
export function DaoMembersSheet({
  open,
  daoAccountId,
  daoName,
  onClose,
  onRequestStake,
}: {
  open: boolean;
  daoAccountId: string;
  daoName?: string;
  onClose: () => void;
  onRequestStake?: () => void;
}) {
  const { accountId, connect } = useAppWallet();
  const face = useMatchingDaoFaceEligibility(daoAccountId);
  const [policy, setPolicy] = useState<ProtocolDaoPolicy | null>(
    () => readDaoFeedCache(daoAccountId)?.daoPolicy ?? null
  );
  const [fetchedEligibility, setFetchedEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const eligibility = face?.eligibility ?? fetchedEligibility;
  const [pending, setPending] = useState(
    () => readDaoFeedCache(daoAccountId)?.daoPolicy == null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const cached = readDaoFeedCache(daoAccountId);
    if (cached?.daoPolicy) {
      queueMicrotask(() => {
        if (cancelled) return;
        setPolicy(cached.daoPolicy);
        setPending(false);
        setError(null);
      });
    } else {
      queueMicrotask(() => {
        if (!cancelled) {
          setPending(true);
          setError(null);
        }
      });
    }
    void fetchProtocolFeed(daoAccountId)
      .then((feed) => {
        if (cancelled) return;
        writeDaoFeedCache(daoAccountId, feed);
        setPolicy(feed.daoPolicy);
        setPending(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        if (readDaoFeedCache(daoAccountId)?.daoPolicy) {
          setPending(false);
          return;
        }
        setPending(false);
        setError(
          cause instanceof Error ? cause.message : 'Could not load members.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, daoAccountId]);

  useEffect(() => {
    if (!open || !accountId) {
      queueMicrotask(() => setFetchedEligibility(null));
      return;
    }
    if (face) {
      queueMicrotask(() => setFetchedEligibility(face.eligibility));
      return;
    }
    let cancelled = false;
    void getProtocolGovernanceEligibility(accountId, daoAccountId).then(
      (next) => {
        if (!cancelled) setFetchedEligibility(next);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [open, accountId, daoAccountId, face]);

  const sections = useMemo(() => listDaoMembershipSections(policy), [policy]);
  const showProtocolRoleMarks = isProtocolFacePairDao(daoAccountId);
  const accountIds = useMemo(
    () => [
      ...new Set(
        sections.flatMap((section) =>
          section.kind === 'group' ? section.accountIds : []
        )
      ),
    ],
    [sections]
  );
  const profiles = usePostAuthorProfiles(accountIds);

  const viewerDelegatedLabel = eligibility
    ? formatSocialCompact(eligibility.delegatedWeight)
    : null;
  const viewerRemainingLabel = eligibility
    ? formatSocialCompact(eligibility.remainingToThreshold)
    : null;
  const viewerMeetsStake = Boolean(eligibility?.canPropose);
  const stakeTokenLabel = eligibility?.foreignStakeTokenLabel ?? 'SOCIAL';
  const hasStakeRole = sections.some((section) => section.kind === 'member');
  const stakeFooterReady =
    hasStakeRole &&
    (!accountId ||
      (!viewerMeetsStake &&
        Boolean(eligibility?.hasStakeProposePath) &&
        Boolean(onRequestStake) &&
        viewerRemainingLabel != null));

  const stakeFooter = stakeFooterReady ? (
    <OsSheetFooter>
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready
          onClick={() => {
            if (!accountId) {
              void connect();
              return;
            }
            onClose();
            onRequestStake?.();
          }}
        >
          {!accountId
            ? DAO_STAKE_ROLE_CONNECT_CTA
            : daoStakeRoleCtaLabel(viewerRemainingLabel!, stakeTokenLabel)}
        </OsSheetAction>
      </OsSheetActions>
    </OsSheetFooter>
  ) : null;

  return (
    <DaoOrgHugSheet
      daoAccountId={daoAccountId}
      open={open}
      onClose={onClose}
      title="Members"
      subtitle={daoName?.trim() || daoAccountId}
      closeAriaLabel="Close members"
      contentClassName="dao-members-sheet"
      footer={stakeFooter}
    >
      {pending && !policy ? (
        <p className="dao-members-empty">Loading roles…</p>
      ) : null}

      {error ? (
        <p className="dao-members-error" role="alert">
          {error}
        </p>
      ) : null}

      {!pending && !error && sections.length === 0 ? (
        <p className="dao-members-empty">No roles on this DAO yet.</p>
      ) : null}

      {sections.map((section) => {
        const roleLabel = formatDaoRoleLabel(section.roleName) || section.roleName;
        return section.kind === 'group' ? (
          <section
            key={`group:${section.roleName}`}
            className="dao-members-role"
            aria-label={roleLabel}
          >
            <h2 className="dao-members-role-title">
              {roleLabel}
              <span className="dao-members-role-count">
                {section.accountIds.length}
              </span>
            </h2>
            <div className="standing-list dao-members-list">
              {section.accountIds.map((memberId, index) => {
                const profile = profiles[memberId];
                return (
                  <div key={memberId}>
                    {index > 0 ? <Divider variant="item" /> : null}
                    <div className="standing-row">
                      <Link
                        href={portfolioPath(memberId)}
                        className="standing-row-main"
                        scroll={false}
                      >
                        <StandingIdentity
                          accountId={memberId}
                          profileName={profile?.displayName}
                          avatarUrl={profile?.avatarUrl}
                          nameTrailing={
                            showProtocolRoleMarks ? (
                              <ProtocolNameTrailing accountId={memberId} />
                            ) : null
                          }
                        />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section
            key={`member:${section.roleName}`}
            className="dao-members-role"
            aria-label={roleLabel}
          >
            <h2 className="dao-members-role-title">
              {roleLabel}
              <span className="dao-members-role-meta">{DAO_STAKE_ROLE_META}</span>
            </h2>
            <div className="dao-members-stake-block">
              <p className="dao-members-threshold">
                {daoStakeRoleGateCopy(
                  formatSocialCompact(section.thresholdYocto),
                  stakeTokenLabel
                )}
              </p>
              {accountId &&
              eligibility &&
              viewerDelegatedLabel != null &&
              viewerRemainingLabel != null ? (
                <>
                  <div className="dao-members-stake-metric">
                    <span className="dao-members-stake-metric-label">
                      {DAO_STAKE_ROLE_PROGRESS_LABEL}
                    </span>
                    <span className="dao-members-stake-metric-value">
                      {daoStakeRoleProgressValue(
                        viewerDelegatedLabel,
                        formatSocialCompact(section.thresholdYocto),
                        stakeTokenLabel
                      )}
                    </span>
                  </div>
                  {viewerMeetsStake ? (
                    <p className="dao-members-stake-status">
                      {DAO_STAKE_ROLE_MET_STATUS}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        );
      })}
    </DaoOrgHugSheet>
  );
}
