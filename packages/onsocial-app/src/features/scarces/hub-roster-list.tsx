'use client';

import Link from 'next/link';
import { Divider } from '@onsocial/ui';
import { standingIdentityLabel } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { RosterRoleBadge } from '@/features/guilds/roster-role-badge';
import type { HubRosterRow } from '@/features/scarces/hub-roster';
import { HubRosterRowMenu } from '@/features/scarces/hub-roster-row-menu';
import type {
  HubRosterManageContext,
  HubRosterRowActionId,
} from '@/features/scarces/hub-roster-row-actions';
import { hubRosterRowActions } from '@/features/scarces/hub-roster-row-actions';
import { hubRosterTimeMeta } from '@/features/scarces/hub-roster-time-meta';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';
import { socialTimeProps } from '@/lib/post-display';

interface HubRosterListProps {
  appId: string;
  rows: HubRosterRow[];
  profiles: Record<string, PostAuthorProfile>;
  manageContext?: HubRosterManageContext | null;
  onRosterChanged?: (input?: {
    accountId: string;
    actionId: HubRosterRowActionId;
  }) => void;
  onRowNavigate?: () => void;
}

export function HubRosterList({
  appId,
  rows,
  profiles,
  manageContext,
  onRosterChanged,
  onRowNavigate,
}: HubRosterListProps) {
  return (
    <div className="standing-list guild-member-list">
      {rows.map((row, index) => {
        const profile = profiles[row.accountId];
        const { label } = standingIdentityLabel(
          row.accountId,
          profile?.displayName
        );
        const href = portfolioPath(row.accountId);
        const timeMeta = hubRosterTimeMeta(row.addedAtNs, row.role);
        const rowActions =
          manageContext != null
            ? hubRosterRowActions(row, manageContext)
            : [];
        const showRowMenu = rowActions.length > 0;
        const asideEmpty = !timeMeta && !showRowMenu;

        return (
          <div key={`${row.role}:${row.accountId}`}>
            {index > 0 ? <Divider variant="item" /> : null}
            <div className="standing-row guild-member-row">
              <Link
                href={href}
                className="standing-row-main"
                scroll={false}
                onClick={onRowNavigate}
              >
                <StandingIdentity
                  accountId={row.accountId}
                  profileName={profile?.displayName}
                  avatarUrl={profile?.avatarUrl}
                  kind={profile?.kind}
                  nameRowClassName="guild-member-row-name-row"
                  nameTrailing={
                    <ProtocolNameTrailing
                      accountId={row.accountId}
                      extra={<RosterRoleBadge label={row.roleLabel} />}
                    />
                  }
                />
              </Link>

              <div
                className={`drops-discovery-head-trail${
                  asideEmpty ? ' is-empty' : ''
                }`}
              >
                {timeMeta ? (
                  <time
                    className="market-listing-meta-right"
                    aria-label={timeMeta.description}
                    {...(row.addedAtNs != null
                      ? socialTimeProps(row.addedAtNs)
                      : {})}
                  >
                    {timeMeta.label}
                  </time>
                ) : null}
                {showRowMenu && manageContext ? (
                  <HubRosterRowMenu
                    appId={appId}
                    row={row}
                    manageContext={manageContext}
                    memberLabel={label}
                    onActionComplete={onRosterChanged}
                  />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
