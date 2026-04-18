// ---------------------------------------------------------------------------
// OnSocial SDK — advanced/paths
//
// Path namespace helpers, validator (mirrors core-onsocial Path::new rules),
// and a batch-merge helper for composing multi-key Set actions.
// ---------------------------------------------------------------------------

import type { SocialSetData } from '../social.js';

/** Path keys reserved by the base social schema. Apps SHOULD NOT write here. */
export const RESERVED_PREFIXES = [
  'profile/',
  'post/',
  'standing/',
  'reaction/',
  'saved/',
  'endorsement/',
  'claims/',
  'graph/',
  'groups/',
  'apps/', // reserved for app namespacing — use `paths.app(appId, …)`
] as const;

/** Default path constraints — must mirror contract `Config` defaults. */
export const PATH_DEFAULTS = {
  maxKeyLength: 256,
  maxPathDepth: 12,
} as const;

export interface ValidatePathOptions {
  maxKeyLength?: number;
  maxPathDepth?: number;
  /** When true, allow paths under `groups/...` and `apps/...`. Defaults true. */
  allowReserved?: boolean;
}

/**
 * Client-side mirror of `validate_and_normalize_path` from
 * contracts/core-onsocial/src/validation/path.rs.
 *
 * Returns null on success or a human-readable error message on failure.
 * Does NOT prepend the actor account; checks the raw path the SDK will send.
 */
export function validatePath(
  path: string,
  opts: ValidatePathOptions = {}
): string | null {
  const maxLen = opts.maxKeyLength ?? PATH_DEFAULTS.maxKeyLength;
  const maxDepth = opts.maxPathDepth ?? PATH_DEFAULTS.maxPathDepth;

  if (!path || path.length > maxLen) return 'Invalid path length';
  if (path === 'groups' || path === 'groups/') return 'Invalid path format';
  if (path.startsWith('/')) return 'Invalid path format';
  if (path.includes('..') || path.includes('\\') || path.includes('//')) {
    return 'Invalid path format';
  }
  if (
    path === '.' ||
    path.startsWith('./') ||
    path.includes('/./') ||
    path.endsWith('/.')
  ) {
    return 'Invalid path format';
  }

  // Allowed character set: a-zA-Z0-9_.-/
  if (!/^[A-Za-z0-9_.\-/]+$/.test(path)) return 'Invalid path format';

  const depth = path.split('/').filter(Boolean).length;
  if (depth > maxDepth) return 'Path depth exceeded';

  return null;
}

/** Throws if any key in `data` fails validation. */
export function assertValidPaths(
  data: SocialSetData,
  opts?: ValidatePathOptions
): void {
  for (const key of Object.keys(data)) {
    const err = validatePath(key, opts);
    if (err) throw new Error(`${err}: ${key}`);
  }
}

// ── Path namespace builders ────────────────────────────────────────────────

/**
 * Convention: third-party schemas live under `apps/<appId>/...` so they cannot
 * collide with the base social schema or another app's keys.
 */
export const paths = {
  app(appId: string, ...segments: string[]): string {
    if (!appId) throw new Error('appId is required');
    const tail = segments.filter((s) => s !== undefined && s !== '').join('/');
    return tail ? `apps/${appId}/${tail}` : `apps/${appId}`;
  },
  group(groupId: string, ...segments: string[]): string {
    if (!groupId) throw new Error('groupId is required');
    const tail = segments.filter((s) => s !== undefined && s !== '').join('/');
    return tail ? `groups/${groupId}/${tail}` : `groups/${groupId}`;
  },
  /**
   * Group content path: `groups/<groupId>/content[/...segments]`. Use this for
   * any member-writable group payload — default member permissions only
   * authorize writes under the `content/` subpath.
   */
  groupContent(groupId: string, ...segments: string[]): string {
    if (!groupId) throw new Error('groupId is required');
    const tail = segments.filter((s) => s !== undefined && s !== '').join('/');
    return tail
      ? `groups/${groupId}/content/${tail}`
      : `groups/${groupId}/content`;
  },
  /** Convenience: `groups/<groupId>/content/post/<postId>`. */
  groupPost(groupId: string, postId: string): string {
    if (!groupId) throw new Error('groupId is required');
    if (!postId) throw new Error('postId is required');
    return `groups/${groupId}/content/post/${postId}`;
  },
  profile(field?: string): string {
    return field ? `profile/${field}` : 'profile';
  },
  post(postId: string): string {
    return `post/${postId}`;
  },
  standing(target: string): string {
    return `standing/${target}`;
  },
  /**
   * Reaction path. v1 includes the reaction kind so a single reactor can emit
   * multiple reactions (e.g. like + bookmark) to the same target.
   */
  reaction(owner: string, kind: string, contentPath: string): string {
    if (!kind) throw new Error('reaction kind required');
    return `reaction/${owner}/${kind}/${contentPath}`;
  },
  /** Private save (bookmark) path: `saved/<contentPath>`. */
  saved(contentPath: string): string {
    if (!contentPath) throw new Error('contentPath required');
    return `saved/${contentPath}`;
  },
  /** Endorsement path: `endorsement/<target>` or `endorsement/<target>/<topic>`. */
  endorsement(target: string, topic?: string): string {
    if (!target) throw new Error('target required');
    return topic ? `endorsement/${target}/${topic}` : `endorsement/${target}`;
  },
  /** Attestation path: `claims/<subject>/<type>/<claimId>`. */
  claim(subject: string, type: string, claimId: string): string {
    if (!subject) throw new Error('subject required');
    if (!type) throw new Error('type required');
    if (!claimId) throw new Error('claimId required');
    return `claims/${subject}/${type}/${claimId}`;
  },
} as const;

/**
 * Build a `Set`-shaped data object scoped to an app namespace.
 *
 * ```ts
 * const data = buildAppSetData('dating', {
 *   'profile/orientation': 'queer',
 *   'match/bob.near': { liked: true },
 * });
 * // → { 'apps/dating/profile/orientation': 'queer',
 * //     'apps/dating/match/bob.near': { liked: true } }
 * ```
 */
export function buildAppSetData(
  appId: string,
  fields: Record<string, unknown>
): SocialSetData {
  if (!appId) throw new Error('appId is required');
  const data: SocialSetData = {};
  for (const [key, value] of Object.entries(fields)) {
    data[paths.app(appId, key)] = value;
  }
  return data;
}

// ── Batch helpers ──────────────────────────────────────────────────────────

export interface MergeOptions {
  /**
   * What to do when two entries declare the same key.
   * - `'error'` (default): throw
   * - `'last'`: last write wins
   * - `'first'`: first write wins
   */
  onCollision?: 'error' | 'last' | 'first';
}

/**
 * Merge multiple `SocialSetData` maps into a single object suitable for a
 * single `Action::Set`. Detects key collisions by default so unrelated
 * builders can be composed safely.
 */
export function mergeSetData(
  entries: SocialSetData[],
  opts: MergeOptions = {}
): SocialSetData {
  const mode = opts.onCollision ?? 'error';
  const out: SocialSetData = {};
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry)) {
      if (key in out) {
        if (mode === 'error') {
          throw new Error(`Duplicate key in batch set: ${key}`);
        }
        if (mode === 'first') continue;
      }
      out[key] = value;
    }
  }
  return out;
}
