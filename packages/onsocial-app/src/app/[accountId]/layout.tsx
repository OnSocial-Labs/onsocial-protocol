import type { ReactNode } from 'react';
import { AccountLayoutClient } from '@/components/account/account-layout-client';
import { resolveAccountId } from '@/lib/resolve-account';

export default async function AccountLayout({
  children,
  overlay,
  params,
}: {
  children: ReactNode;
  overlay: ReactNode;
  params: Promise<{ accountId: string }>;
}) {
  const accountId = await resolveAccountId(params);

  return (
    <AccountLayoutClient accountId={accountId} overlay={overlay}>
      {children}
    </AccountLayoutClient>
  );
}
