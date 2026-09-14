'use client';

import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { useWallet } from '@/contexts/wallet-context';
import { getPublicAppBoostUrl } from '@/lib/portal-config';

type OpenBoostInAppLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
> & {
  children: ReactNode;
};

export const OpenBoostInAppLink = forwardRef<
  HTMLAnchorElement,
  OpenBoostInAppLinkProps
>(function OpenBoostInAppLink({ className, children, ...props }, ref) {
  const { accountId } = useWallet();
  return (
    <a
      ref={ref}
      className={className}
      {...props}
      href={getPublicAppBoostUrl(accountId)}
    >
      {children}
    </a>
  );
});
