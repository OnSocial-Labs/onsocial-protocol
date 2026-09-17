import type { ReactNode } from 'react';
import { AccountLayoutClient } from '@/components/account/account-layout-client';
import { InterceptMisfireRecovery } from '@/components/overlay/intercept-misfire-recovery';
import {
  isInterceptMisfireSegment,
  resolveAccountId,
} from '@/lib/resolve-account';

export default async function AccountLayout({
  children,
  overlay,
  params,
}: {
  children: ReactNode;
  overlay: ReactNode;
  params: Promise<{ accountId: string }>;
}) {
  const { accountId: routeSegment } = await params;
  if (isInterceptMisfireSegment(routeSegment)) {
    return <InterceptMisfireRecovery />;
  }
  const accountId = await resolveAccountId(params);

  return (
    <AccountLayoutClient accountId={accountId} overlay={overlay}>
      {children}
    </AccountLayoutClient>
  );
}
