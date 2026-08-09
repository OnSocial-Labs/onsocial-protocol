/**
 * Parse a private save content path into author + postId.
 * Supports personal (`alice.near/post/1`) and guild
 * (`alice.near/groups/g/content/post/1`) paths.
 */
export function parseSaveContentPath(
  path: string | null | undefined
): { author: string; postId: string } | null {
  const trimmed = path?.trim() ?? '';
  if (!trimmed) return null;

  const group = trimmed.match(
    /^([^/]+)\/groups\/[^/]+\/content\/post\/(.+)$/
  );
  if (group?.[1] && group[2]) {
    return { author: group[1], postId: group[2] };
  }

  const personal = trimmed.match(/^([^/]+)\/post\/(.+)$/);
  if (personal?.[1] && personal[2]) {
    return { author: personal[1], postId: personal[2] };
  }

  return null;
}
