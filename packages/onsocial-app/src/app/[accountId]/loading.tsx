import { PortfolioShellPending } from '@/components/portfolio/portfolio-shell';

/** Route suspense fallback. The frame is PortfolioShell. The face fills in. */
export default function AccountLoading() {
  return <PortfolioShellPending pageAccountId="" />;
}
