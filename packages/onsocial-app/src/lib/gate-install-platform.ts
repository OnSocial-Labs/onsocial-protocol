/** Logged-out install affordance chosen from the request user agent. */
export type GateInstallPlatform = 'ios' | 'other';

/**
 * iPhone, iPad, and iPod show the Share hint. Everything else reserves the
 * same slot and fills it when the browser fires `beforeinstallprompt`.
 * Same match as `detectIos` in the PWA provider.
 */
export function gateInstallPlatform(userAgent: string): GateInstallPlatform {
  return /iphone|ipad|ipod/i.test(userAgent) ? 'ios' : 'other';
}
