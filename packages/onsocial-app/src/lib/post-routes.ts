import { portfolioPath } from '@/lib/overlay-routes';
import { guildPostPath } from '@/features/guilds/guilds-data';

/** App route for a personal post thread: `/@{author}/posts/{postId}`. */
export function personalPostPath(author: string, postId: string): string {
  return `${portfolioPath(author)}/posts/${encodeURIComponent(postId)}`;
}

/** Indexed content path for a personal post. */
export function personalPostContentPath(
  author: string,
  postId: string
): string {
  return `${author}/post/${postId}`;
}

/** Thread page for any post row — guild or personal. */
export function postThreadPath(post: {
  accountId: string;
  postId: string;
  groupId?: string | null;
}): string {
  if (post.groupId) {
    return guildPostPath(post.groupId, post.accountId, post.postId);
  }
  return personalPostPath(post.accountId, post.postId);
}
