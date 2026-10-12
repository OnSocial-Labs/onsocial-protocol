import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Home • OnSocial',
  description: 'Your OnSocial home feed.',
};

/**
 * The feed lives in FeedSessionHost while this URL is open. Leaving saves
 * the list and removes it. This route only owns the URL.
 */
export default function HomePage() {
  return null;
}
