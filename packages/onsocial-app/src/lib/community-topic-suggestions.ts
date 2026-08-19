/** Shared topic / category suggestions for hubs + guilds. */

export const COMMUNITY_TOPIC_SUGGESTIONS = [
  { id: 'music', label: 'Music' },
  { id: 'art', label: 'Art' },
  { id: 'books', label: 'Books' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'games', label: 'Games' },
  { id: 'film', label: 'Film' },
  { id: 'events', label: 'Events' },
  { id: 'community', label: 'Community' },
  { id: 'technology', label: 'Technology' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'sports', label: 'Sports' },
  { id: 'science', label: 'Science' },
  { id: 'news', label: 'News' },
  { id: 'business', label: 'Business' },
  { id: 'culture', label: 'Culture' },
  { id: 'food', label: 'Food' },
  { id: 'animals', label: 'Animals' },
] as const;

export type CommunityTopicId =
  (typeof COMMUNITY_TOPIC_SUGGESTIONS)[number]['id'];
