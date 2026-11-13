import type { AppSocialSessionLifecycle } from '@/lib/app-social-session';

export const APP_ACCESS_BANNER_BODY =
  'So you can post and message without signing every action.';

export interface AppAccessBannerCopy {
  title: string;
  body: string;
  action: string;
}

/**
 * Banner copy after the session check has finished.
 * Active and unresolved checks render nothing, so the drawer does not reserve space.
 */
export function appAccessBannerCopy(input: {
  settled: boolean;
  lifecycle: AppSocialSessionLifecycle | null;
}): AppAccessBannerCopy | null {
  if (
    !input.settled ||
    input.lifecycle == null ||
    input.lifecycle === 'active'
  ) {
    return null;
  }
  if (input.lifecycle === 'expired') {
    return {
      title: 'Renew app access',
      body: APP_ACCESS_BANNER_BODY,
      action: 'Renew access',
    };
  }
  return {
    title: 'Allow app access',
    body: APP_ACCESS_BANNER_BODY,
    action: 'Allow access',
  };
}
