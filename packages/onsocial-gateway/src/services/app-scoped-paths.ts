const SOCIAL_ROOTS = new Set([
  'profile',
  'post',
  'standing',
  'reaction',
  'saved',
  'endorsement',
  'claims',
  'page',
  'groups',
]);

function pathSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function looksLikeAccountPrefix(segment: string): boolean {
  return segment.includes('.') || segment.endsWith('.near');
}

/** App-scoped JWTs may write social graph paths plus `apps/<theirAppId>/…`. */
export function appScopedSetPathError(
  path: string,
  appId: string
): string | null {
  const parts = pathSegments(path);
  let index = 0;
  if (parts[0] && looksLikeAccountPrefix(parts[0])) {
    index = 1;
  }
  const root = parts[index];
  if (!root) return 'Path is empty';
  if (root === 'apps') {
    if (parts[index + 1] === appId) return null;
    return `App-scoped session can only write apps/${appId}`;
  }
  if (SOCIAL_ROOTS.has(root)) return null;
  return 'App-scoped session cannot write this path';
}

export function appScopedSetPathsError(
  paths: string[],
  appId: string
): string | null {
  for (const path of paths) {
    const error = appScopedSetPathError(path, appId);
    if (error) return error;
  }
  return null;
}

/**
 * Best-effort: pull Action::Set data keys from a NEP-366 blob.
 * SDK / prepare payloads embed UTF-8 JSON `{ type: "set", data: { … } }`.
 */
export function extractSetDataKeysFromSignedDelegate(
  signedDelegateB64: string
): string[] | null {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(signedDelegateB64, 'base64');
  } catch {
    return null;
  }
  if (bytes.length === 0) return null;
  const text = bytes.toString('latin1');
  const match = /"type"\s*:\s*"set"/.exec(text);
  if (!match || match.index === undefined) return null;
  const start = text.lastIndexOf('{', match.index);
  if (start < 0) return null;
  const max = Math.min(text.length, start + 2_000_000);
  for (let end = match.index + match[0].length; end < max; end++) {
    if (text[end] !== '}') continue;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as {
        type?: string;
        data?: unknown;
      };
      if (
        parsed.type !== 'set' ||
        !parsed.data ||
        typeof parsed.data !== 'object'
      ) {
        continue;
      }
      return Object.keys(parsed.data as Record<string, unknown>);
    } catch {
      // Expand until the action object is complete.
    }
  }
  return null;
}

/** Fence Set writes in a signed delegate. Other action types pass through. */
export function appScopedSignedDelegateError(
  signedDelegateB64: string,
  appId: string
): string | null {
  const keys = extractSetDataKeysFromSignedDelegate(signedDelegateB64);
  if (!keys) return null;
  return appScopedSetPathsError(keys, appId);
}
