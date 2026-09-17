import { redirect } from 'next/navigation';
import { InterceptMisfireRecovery } from '@/components/overlay/intercept-misfire-recovery';
import { standingPath } from '@/lib/profile-social-standings';
import {
  isInterceptMisfireSegment,
  resolveAccountId,
} from '@/lib/resolve-account';

type StandingOverlayRedirectProps = {
  params: Promise<{ accountId: string }>;
};

export default async function StandingOverlayRedirect({
  params,
}: StandingOverlayRedirectProps) {
  const { accountId: routeSegment } = await params;
  if (isInterceptMisfireSegment(routeSegment)) {
    return <InterceptMisfireRecovery />;
  }
  const accountId = await resolveAccountId(params);
  redirect(standingPath(accountId, 'incoming'));
}
