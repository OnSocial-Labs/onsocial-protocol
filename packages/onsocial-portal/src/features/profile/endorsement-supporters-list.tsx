'use client';

import { EndorsementSupportAmountSummary } from '@/components/endorsement-support-amount-summary';
import { ProfileAccountAvatar } from '@/components/profile-account-avatar';
import { RelationshipSignal } from '@/components/ui/relationship-signal';
import {
  profileListBioClass,
  profileListContainerClass,
  profileListResultRowClass,
} from '@/features/profile/profile-list-row';
import { cleanHandle, formatEndorsementTime } from '@/lib/endorsements';
import { ProfileGraphRowLink } from '@/lib/profile-graph-link';
import { formatSupportBalanceLabel } from '@/lib/social-spend-profile';
import type { EndorsementSupporterSummary } from '@/lib/social-spend-endorsement';

function accountLabel(account: EndorsementSupporterSummary): string {
  return account.name?.trim() || cleanHandle(account.accountId);
}

export function EndorsementSupportersList({
  supporters,
  pageLayout = true,
  onSelectAccount,
}: {
  supporters: EndorsementSupporterSummary[];
  pageLayout?: boolean;
  onSelectAccount?: (accountId: string) => void;
}) {
  if (supporters.length === 0) {
    return null;
  }

  return (
    <div className={profileListContainerClass}>
      {supporters.map((account) => {
        const sharedSolidarity =
          account.viewerStanding && account.theyStandWithViewer;
        const theyStandWithViewer =
          account.theyStandWithViewer && !sharedSolidarity;
        const amountLabel = formatSupportBalanceLabel(
          BigInt(account.totalAmountYocto)
        );
        const timeLabel = formatEndorsementTime(account.latestSupportAt);
        const bio = account.bio?.trim() || null;

        return (
          <div key={account.accountId} className={profileListResultRowClass}>
            <ProfileGraphRowLink
              accountId={account.accountId}
              pageLayout={pageLayout}
              onNavigate={onSelectAccount}
              className="w-full"
            >
              <ProfileAccountAvatar
                accountId={account.accountId}
                avatarUrl={account.avatarUrl}
                kind={account.kind}
                className="mt-0.5 h-9 w-9"
              />
              <span className="min-w-0 flex-1">
                {sharedSolidarity || theyStandWithViewer ? (
                  <span className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {sharedSolidarity ? (
                      <RelationshipSignal
                        label="Solidarity"
                        tone="purple"
                        title="You both stand with each other"
                      />
                    ) : (
                      <RelationshipSignal
                        label="Stands with you"
                        tone="blue"
                        title="This account stands with you"
                      />
                    )}
                  </span>
                ) : null}
                <span className="block truncate portal-type-lead font-medium text-foreground">
                  {accountLabel(account)}
                </span>
                <span className="block truncate portal-type-body-sm text-muted-foreground/55">
                  @{account.accountId}
                </span>
                {bio ? (
                  <span className={profileListBioClass}>{bio}</span>
                ) : null}
              </span>
              <EndorsementSupportAmountSummary
                amountLabel={amountLabel}
                spendCount={account.spendCount}
                timeLabel={timeLabel}
              />
            </ProfileGraphRowLink>
          </div>
        );
      })}
    </div>
  );
}
