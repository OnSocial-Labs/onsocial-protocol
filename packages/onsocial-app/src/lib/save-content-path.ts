/**
 * Parse a private save content path into author + postId.
 * Supports personal (`alice.near/post/1`) and guild
 * (`alice.near/groups/g/content/post/1`) paths.
 * Also accepts full on-chain paths (`viewer.near/saved/...`) from older indexer rows.
 */
export function parseSaveContentPath(
  path: string | null | undefined
): { author: string; postId: string } | null {
  let trimmed = path?.trim() ?? '';
  if (!trimmed) return null;

  const full = trimmed.match(/^[^/]+\/saved\/(.+)$/);
  if (full?.[1]) trimmed = full[1];
  else {
    const relative = trimmed.match(/^saved\/(.+)$/);
    if (relative?.[1]) trimmed = relative[1];
  }

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
