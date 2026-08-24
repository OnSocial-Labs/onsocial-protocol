'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Divider, StandingIdentity } from '@onsocial/ui';
import { DaoPageSlideOverScreen } from '@/features/protocol/dao-page-slide-over-screen';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { listDaoMembershipSections } from '@/features/protocol/dao-group-roles';
import {
  primaryProtocolCouncilGuardianRoleId,
} from '@/features/protocol/protocol-council-guardian';
import { ProtocolCouncilGuardianMark } from '@/features/protocol/protocol-council-guardian-mark';
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
import { portfolioPath } from '@/lib/overlay-routes';

const MEMBERS_Z = 74;

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
  const { accountId } = useAppWallet();
  const face = useMatchingDaoFaceEligibility(daoAccountId);
  const [sheetOpen, setSheetOpen] = useState(open);
  if (open && !sheetOpen) setSheetOpen(true);

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

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    setPolicy(null);
    setFetchedEligibility(null);
    setError(null);
    setPending(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!sheetOpen) return;
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
  }, [sheetOpen, daoAccountId]);

  useEffect(() => {
    if (!sheetOpen || !accountId) {
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
  }, [sheetOpen, accountId, daoAccountId, face]);

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

  return (
    <DaoPageSlideOverScreen
      pageAccountId={daoAccountId}
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      title="Members"
      subtitle={daoName?.trim() || daoAccountId}
      closeAriaLabel="Back from members"
      zIndex={MEMBERS_Z}
      className="dao-members-slide"
      contentClassName="dao-members-sheet"
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

      {sections.map((section) =>
        section.kind === 'group' ? (
          <section
            key={`group:${section.roleName}`}
            className="dao-members-role"
            aria-label={section.roleName}
          >
            <h2 className="dao-members-role-title">
              {section.roleName}
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
                              <ProtocolCouncilGuardianMark
                                roleId={primaryProtocolCouncilGuardianRoleId([
                                  section.roleName,
                                ])}
                              />
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
            aria-label={section.roleName}
          >
            <h2 className="dao-members-role-title">
              {section.roleName}
              <span className="dao-members-role-meta">Stake</span>
            </h2>
            <p className="dao-members-threshold">
              Need {formatSocialCompact(section.thresholdYocto)} SOCIAL
              delegated to hold this role.
            </p>
            {accountId && eligibility ? (
              <div className="dao-members-viewer">
                <p className="dao-members-viewer-line">
                  {viewerMeetsStake
                    ? `You meet it · ${viewerDelegatedLabel} SOCIAL`
                    : `You have ${viewerDelegatedLabel} SOCIAL · need ${viewerRemainingLabel} more`}
                </p>
                {!viewerMeetsStake &&
                eligibility.hasStakeProposePath &&
                onRequestStake ? (
                  <button
                    type="button"
                    className="dao-members-stake"
                    onClick={() => {
                      requestClose();
                      onRequestStake();
                    }}
                  >
                    Stake to join
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        )
      )}
    </DaoPageSlideOverScreen>
  );
}
