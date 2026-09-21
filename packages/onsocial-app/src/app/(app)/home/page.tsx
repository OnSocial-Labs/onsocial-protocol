import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Home • OnSocial',
  description: 'Your OnSocial home feed.',
};

/**
 * The feed lives in FeedSessionHost so leaving for an article or a person
 * does not build a new list. This route only owns the URL.
 */
export default function HomePage() {
  return null;
}
