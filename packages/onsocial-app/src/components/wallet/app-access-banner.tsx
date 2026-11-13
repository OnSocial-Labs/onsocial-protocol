'use client';

import { OsNoticeCard, OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { appAccessBannerCopy } from '@/lib/app-access-banner';
import { useAppAccessGrant } from '@/components/wallet/use-app-access-grant';

/** Compact attention card above the wallet balance. Hidden until the session check finishes. */
export function AppAccessBanner() {
  const {
    socialSessionSettled,
    socialSessionLifecycle,
    isBootstrappingSession,
  } = useAppWallet();
  const copy = appAccessBannerCopy({
    settled: socialSessionSettled,
    lifecycle: socialSessionLifecycle,
  });
  const { pending, allowOrRenew } = useAppAccessGrant(
    socialSessionLifecycle === 'expired' ? 'expired' : 'missing'
  );
  if (!copy) return null;

  const busy = pending || isBootstrappingSession;

  return (
    <OsNoticeCard
      data-app-access-banner=""
      className="os-notice-card--attention"
      align="start"
      title={copy.title}
      body={copy.body}
      footer={
        <OsSheetActions layout="row" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            variant="primary"
            ready={!busy}
            pending={busy}
            disabled={busy}
            pendingLabel={
              socialSessionLifecycle === 'expired' ? 'Renewing…' : 'Allowing…'
            }
            onClick={() => void allowOrRenew()}
          >
            {copy.action}
          </OsSheetAction>
        </OsSheetActions>
      }
    />
  );
}
