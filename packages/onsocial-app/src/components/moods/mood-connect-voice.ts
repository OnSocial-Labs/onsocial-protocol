/** Logged-out Moods CTA — never Connect wallet. */
export const MOOD_CONNECT_CTA = 'Connect';

/** Moods sheet body — button owns Connect. */
export function moodConnectHint(opts: { isDao: boolean }): string {
  if (opts.isDao) return 'Connect to set this DAO mood.';
  return 'Connect to apply a mood.';
}
