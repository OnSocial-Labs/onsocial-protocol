// src/utils/index.ts
// Utility helpers for OnSocial SDK

/**
 * Validate a NEAR account ID
 *
 * Rules:
 * - 2-64 characters
 * - Lowercase alphanumeric, underscore, hyphen, dot
 * - Cannot start/end with separator
 * - No consecutive separators (.. -- __)
 *
 * @example
 * ```ts
 * isValidAccountId('alice.near') // true
 * isValidAccountId('Alice.near') // false (uppercase)
 * isValidAccountId('a') // false (too short)
 * ```
 */
export function isValidAccountId(accountId: string): boolean {
  if (!accountId || accountId.length < 2 || accountId.length > 64) return false;
  if (/\.\.|\-\-|__/.test(accountId)) return false;
  return /^[a-z0-9]([a-z0-9_.-]*[a-z0-9])?$/.test(accountId);
}

/**
 * Parse a data path into components
 *
 * @example
 * ```ts
 * parsePath('profile/name') // { type: 'profile', id: 'name' }
 * parsePath('post/123/content') // { type: 'post', id: '123', field: 'content' }
 * ```
 */
export function parsePath(path: string): { type: string; id?: string; field?: string } {
  const parts = path.split('/');
  return {
    type: parts[0],
    id: parts[1],
    field: parts[2],
  };
}

/**
 * Build a data path from components
 *
 * @example
 * ```ts
 * buildPath('profile', 'name') // 'profile/name'
 * buildPath('post', '123', 'content') // 'post/123/content'
 * ```
 */
export function buildPath(type: string, id?: string, field?: string): string {
  if (field && id) return `${type}/${id}/${field}`;
  if (id) return `${type}/${id}`;
  return type;
}
