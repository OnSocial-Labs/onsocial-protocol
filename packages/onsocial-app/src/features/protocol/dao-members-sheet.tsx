'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Divider, StandingIdentity } from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { listDaoGroupRoleSections } from '@/features/protocol/dao-group-roles';
import { fetchProtocolFeed } from '@/features/protocol/protocol-feed-client';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';

const MEMBERS_Z = 74;

/**
 * DAO group roles — people as circles (StandingIdentity).
 */
export function DaoMembersSheet({
  open,
  daoAccountId,
  daoName,
  onClose,
}: {
  open: boolean;
  daoAccountId: string;
  daoName?: string;
  onClose: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(open);
  if (open && !sheetOpen) setSheetOpen(true);

  const [policy, setPolicy] = useState<ProtocolDaoPolicy | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestClose = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    setPolicy(null);
    setError(null);
    setPending(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!sheetOpen) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setPending(true);
        setError(null);
      }
    });
    void fetchProtocolFeed(daoAccountId)
      .then((feed) => {
        if (cancelled) return;
        setPolicy(feed.daoPolicy);
        setPending(false);
      })
      .catch((cause) => {
        if (cancelled) return;
        setPending(false);
        setError(
          cause instanceof Error ? cause.message : 'Could not load members.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [sheetOpen, daoAccountId]);

  const sections = useMemo(() => listDaoGroupRoleSections(policy), [policy]);
  const accountIds = useMemo(
    () => [...new Set(sections.flatMap((section) => section.accountIds))],
    [sections]
  );
  const profiles = usePostAuthorProfiles(accountIds);

  return (
    <OsSlideOverScreen
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
        <p className="dao-members-empty">
          No group roles on this DAO yet.
        </p>
      ) : null}

      {sections.map((section) => (
        <section
          key={section.roleName}
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
            {section.accountIds.map((accountId, index) => {
              const profile = profiles[accountId];
              return (
                <div key={accountId}>
                  {index > 0 ? <Divider variant="item" /> : null}
                  <div className="standing-row">
                    <Link
                      href={portfolioPath(accountId)}
                      className="standing-row-main"
                      scroll={false}
                    >
                      <StandingIdentity
                        accountId={accountId}
                        profileName={profile?.displayName}
                        avatarUrl={profile?.avatarUrl}
                      />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </OsSlideOverScreen>
  );
}
