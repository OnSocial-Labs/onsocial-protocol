/**
 * Islands that own a gesture other than opening this post. A pointer that
 * starts on one of them must not warm the thread: like, menu, media, the
 * article cover, a quote inset, a profile or guild link.
 *
 * The stretched `.post-card-hit` and the time link do open this post.
 * Everything else in the copy is `pointer-events: none` and lands on the hit.
 */
const POINTER_WARM_SKIP = [
  'button',
  '[role="button"]',
  '.post-card-menu',
  '.post-card-react',
  '.post-card-stat',
  '.post-card-stat-button',
  '.post-card-amplify',
  '.post-card-like-count',
  '.post-card-quote-inset',
  '.post-media-tile',
  '.post-audio-row',
  '.post-audio-preview',
  '.post-audio-jacket',
  '.post-media-unmute-gate',
  '.post-media-mute',
  '.post-card-article-cover',
  '.scarce-post-preview',
  '.post-card-guild',
  '.post-card-identity',
  '.post-card-avatar-link',
  '.post-identity-name',
  '.post-identity-handle',
  '.post-poll-option',
  '.post-card-scarce-buy',
  '.post-card-scarce-link',
  '.post-card-scarce-read',
  '.post-card-show-more',
  '.os-hashtag',
  '.os-mention',
  '.os-ticker',
  '.os-link',
  '.post-card-repost-line',
].join(', ');

/**
 * Primary pointer on the row that opens this post. Inner controls return
 * false so a like, menu, or media tap does not start the reply fetch.
 */
export function pointerOpensThisPost(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined') return false;
  if (!(target instanceof Element)) return false;
  if (target.closest(POINTER_WARM_SKIP)) return false;
  const link = target.closest('a');
  if (!link) return true;
  return (
    link.classList.contains('post-card-hit') ||
    link.classList.contains('post-identity-time')
  );
}
