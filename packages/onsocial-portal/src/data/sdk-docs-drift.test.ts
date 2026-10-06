import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OnSocial } from '@onsocial/sdk';

/**
 * Guards against SDK docs drift, in both directions:
 *
 * 1. Every `os.*` path referenced in the portal SDK docs must resolve on a
 *    real `OnSocial` instance, so a rename or removal in @onsocial/sdk fails
 *    portal tests before stale docs ship.
 * 2. Every public method on the client must be documented (exact path or a
 *    wildcard like `os.endorsements.*`) or listed in INTENTIONALLY_UNDOCUMENTED
 *    with a reason — so new SDK surface can never ship undocumented by accident.
 */
const DOCS_FILES = [
  'src/data/sdk-method-guides.ts',
  'src/data/sdk-hub-content.ts',
  'src/app/sdk/sdk-hub-client.tsx',
  'src/app/sdk/[family]/family-guide-client.tsx',
];

// Paths the docs mention precisely because they do NOT exist. Asserting
// absence keeps notes like "there is no os.social.delete" true.
const KNOWN_ABSENT = new Set(['os.social.delete']);

/**
 * Public client surface the docs deliberately do not cover, with the reason.
 * Adding a method here is a conscious docs decision reviewed in PRs — the
 * coverage guard fails on anything not documented and not listed here.
 */
const INTENTIONALLY_UNDOCUMENTED = new Map<string, string>([
  [
    'os.attachSession',
    'session plumbing is covered in prose, not method lists',
  ],
  [
    'os.detachSession',
    'session plumbing is covered in prose, not method lists',
  ],
  ['os.session', 'session plumbing is covered in prose, not method lists'],
]);

/** Top-level client properties that are alias groupings or internal plumbing. */
const SKIP_TOP_LEVEL = new Set([
  'content', // alias of os.profiles/os.posts/… — same instances
  'economy', // alias of os.scarces/os.rewards/…
  'platform', // alias of os.storage/os.permissions/…
  'raw', // documented via os.raw.* prose tokens
  'http', // advanced escape hatch
]);

/** Nested sub-APIs worth enumerating one level deeper. */
const NESTED_SUB_APIS: Record<string, string[]> = {
  scarces: [
    'tokens',
    'collections',
    'market',
    'auctions',
    'offers',
    'lazy',
    'approvals',
    'storage',
    'fromPost',
    'apps',
  ],
  subscribe: ['scarces'],
};

const TOKEN_RE =
  /\bos(?:\.[A-Za-z_$][\w$]*)+(?:\/(?:[A-Za-z_$][\w$]*|\.\.\.))*/g;

/** Matches wildcard mentions like `os.endorsements.*` that TOKEN_RE drops. */
const WILDCARD_RE = /\bos(?:\.[A-Za-z_$][\w$]*)+\.\*/g;

function expandToken(raw: string): string[] {
  let token = raw;
  if (token.endsWith('.*')) token = token.slice(0, -2);
  const segments = token.split('.');
  const last = segments[segments.length - 1];
  const alternatives = last
    .split('/')
    .filter((alt) => alt.length > 0 && alt !== '...');
  const base = segments.slice(0, -1).join('.');
  return alternatives.map((alt) => (base ? `${base}.${alt}` : alt));
}

function resolvePath(root: unknown, dottedPath: string): boolean {
  let current: unknown = root;
  for (const segment of dottedPath.split('.')) {
    if (
      current === null ||
      (typeof current !== 'object' && typeof current !== 'function')
    ) {
      return false;
    }
    const record = current as Record<string, unknown>;
    if (!(segment in record)) return false;
    current = record[segment];
  }
  return current !== undefined && current !== null;
}

/**
 * Pure existence walk: every segment must be `in` its parent, but the final
 * value may be null (e.g. the `session` getter returns null at rest).
 */
function pathExists(root: unknown, dottedPath: string): boolean {
  let current: unknown = root;
  for (const segment of dottedPath.split('.')) {
    if (
      current === null ||
      (typeof current !== 'object' && typeof current !== 'function')
    ) {
      return false;
    }
    const record = current as Record<string, unknown>;
    if (!(segment in record)) return false;
    current = record[segment];
  }
  return true;
}

function collectTokens(): Map<string, Set<string>> {
  const byFile = new Map<string, Set<string>>();
  for (const file of DOCS_FILES) {
    const text = readFileSync(path.resolve(process.cwd(), file), 'utf8');
    const tokens = new Set<string>();
    for (const match of text.matchAll(TOKEN_RE)) {
      for (const expanded of expandToken(match[0])) {
        tokens.add(expanded);
      }
    }
    byFile.set(file, tokens);
  }
  return byFile;
}

/** Base paths the docs cover with a wildcard (`os.endorsements.*`). */
function collectWildcards(): Set<string> {
  const wildcards = new Set<string>();
  for (const file of DOCS_FILES) {
    const text = readFileSync(path.resolve(process.cwd(), file), 'utf8');
    for (const match of text.matchAll(WILDCARD_RE)) {
      wildcards.add(match[0].slice(0, -2));
    }
  }
  return wildcards;
}

/** Public method names of a module instance (prototype methods + getters). */
function publicMembersOf(instance: object): string[] {
  const names = new Set<string>();
  for (const key of Object.keys(instance)) {
    const value = (instance as Record<string, unknown>)[key];
    if (typeof value === 'function' && !key.startsWith('_')) names.add(key);
  }
  let proto = Object.getPrototypeOf(instance);
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || name.startsWith('_')) continue;
      names.add(name);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...names];
}

/**
 * Enumerate every public `os.*` method path on the real client:
 * top-level modules, their methods, and the nested sub-APIs listed in
 * NESTED_SUB_APIS (plus every `os.query.*` namespace).
 */
function collectPublicMethodPaths(os: OnSocial): Set<string> {
  const paths = new Set<string>();
  const root = os as unknown as Record<string, unknown>;

  for (const name of publicMembersOf(os)) {
    const value = root[name];
    if (typeof value === 'function' || value == null) {
      paths.add(`os.${name}`);
    }
  }

  for (const [key, value] of Object.entries(root)) {
    if (key.startsWith('_') || SKIP_TOP_LEVEL.has(key)) continue;
    if (value === null || typeof value !== 'object') continue;

    for (const method of publicMembersOf(value)) {
      paths.add(`os.${key}.${method}`);
    }

    const nestedKeys =
      key === 'query'
        ? Object.keys(value).filter(
            (sub) =>
              sub !== 'http' &&
              !sub.startsWith('_') &&
              typeof (value as Record<string, unknown>)[sub] === 'object'
          )
        : (NESTED_SUB_APIS[key] ?? []);
    for (const sub of nestedKeys) {
      const subValue = (value as Record<string, unknown>)[sub];
      if (subValue === null || typeof subValue !== 'object') continue;
      for (const method of publicMembersOf(subValue)) {
        paths.add(`os.${key}.${sub}.${method}`);
      }
    }
  }
  return paths;
}

function isDocumented(
  methodPath: string,
  documented: Set<string>,
  wildcards: Set<string>
): boolean {
  if (documented.has(methodPath)) return true;
  for (const base of wildcards) {
    if (methodPath.startsWith(`${base}.`)) return true;
  }
  return false;
}

describe('SDK docs drift guard', () => {
  const os = new OnSocial();
  const byFile = collectTokens();

  it('every documented os.* path resolves on the SDK client', () => {
    const missing: string[] = [];
    for (const [file, tokens] of byFile) {
      for (const token of tokens) {
        if (KNOWN_ABSENT.has(token)) continue;
        if (!resolvePath(os, token.slice('os.'.length))) {
          missing.push(`${token} (${file})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('paths documented as absent stay absent', () => {
    for (const token of KNOWN_ABSENT) {
      expect(
        resolvePath(os, token.slice('os.'.length)),
        `${token} now exists - update the docs note that claims it does not`
      ).toBe(false);
    }
  });

  it('every public client method is documented or consciously excluded', () => {
    const documented = new Set<string>();
    for (const tokens of byFile.values()) {
      for (const token of tokens) documented.add(token);
    }
    const wildcards = collectWildcards();
    const uncovered: string[] = [];
    for (const methodPath of collectPublicMethodPaths(os)) {
      if (INTENTIONALLY_UNDOCUMENTED.has(methodPath)) continue;
      if (!isDocumented(methodPath, documented, wildcards)) {
        uncovered.push(methodPath);
      }
    }
    expect(
      uncovered,
      'New SDK surface must be documented in src/data/sdk-*.ts (exact ' +
        'path or a wildcard like os.<module>.*) or added to ' +
        'INTENTIONALLY_UNDOCUMENTED with a reason:\n' +
        uncovered.join('\n')
    ).toEqual([]);
  });

  it('intentionally undocumented paths still exist on the client', () => {
    for (const token of INTENTIONALLY_UNDOCUMENTED.keys()) {
      expect(
        pathExists(os, token.slice('os.'.length)),
        `${token} no longer exists - remove it from INTENTIONALLY_UNDOCUMENTED`
      ).toBe(true);
    }
  });

  it('docs reference a meaningful number of SDK paths', () => {
    const total = [...byFile.values()].reduce((n, set) => n + set.size, 0);
    expect(total).toBeGreaterThan(50);
  });
});
