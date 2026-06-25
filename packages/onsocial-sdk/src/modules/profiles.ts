// ---------------------------------------------------------------------------
// OnSocial SDK — profiles module
//
// The single, blessed entry point for reading and writing profiles. Wraps
// `os.social.setProfile` and `os.query.profiles.get` so app devs have one
// obvious name to reach for:
//
//   await os.profiles.update({ name, bio, avatar, banner, links, tags })
//   const me   = await os.profiles.get('alice.near')        // materialised
//   const many = await os.profiles.getMany(['a.near','b.near'])
//   const url  = os.profiles.avatarUrl(profile)             // gateway URL
//
// Why a separate module:
//   • `os.social.setProfile` is buried with 20 other social methods.
//   • `os.query.profiles.get()` returns a flat merged map — every consumer
//     would otherwise have to fold raw rows into an object themselves,
//     and the JSON-encoded `links` / `tags` columns trip people up.
//   • Banner support: `os.profiles.update({ banner: file })` auto-uploads.
// ---------------------------------------------------------------------------

import type { SocialModule } from './social.js';
import type { QueryModule } from '../query/index.js';
import type { StorageProvider } from '../storage/provider.js';
import type { ProfileData, RelayResponse } from '../types.js';
import {
  resolveProfileMediaField,
  type ResolvedProfileMedia,
} from './profile-media.js';

export type { ResolvedProfileMedia } from './profile-media.js';

/**
 * Materialised profile — one object instead of N rows. Reserved fields are
 * decoded; `links` and `tags` are parsed back from JSON. Unknown fields
 * (including `apps/<ns>/...`) are left as their raw string values under
 * `extra` so callers can still reach them.
 */
export interface MaterialisedProfile {
  accountId: string;
  /** Schema version (`profile/v`), parsed to a number when present. */
  v?: number;
  name?: string;
  bio?: string;
  /** Raw `ipfs://<cid>` or URL string as stored on chain. */
  avatar?: string;
  /** Raw `ipfs://<cid>` or URL string as stored on chain. */
  banner?: string;
  links?: Record<string, string>;
  tags?: string[];
  /** Block height of the most-recently-written field. */
  lastUpdatedHeight?: number;
  /** Block timestamp (ns) of the most-recently-written field. */
  lastUpdatedAt?: number;
  /** Any non-reserved fields (`profile/<key>` → raw value). */
  extra: Record<string, string>;
}

const RESERVED = new Set(['v', 'name', 'bio', 'avatar', 'banner']);
const JSON_FIELDS = new Set(['links', 'tags']);

function tryParseJson<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

interface ProfileRow {
  accountId: string;
  field: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

export function materialiseProfileFromRows(
  accountId: string,
  rows: ProfileRow[]
): MaterialisedProfile | null {
  if (rows.length === 0) return null;
  return rowsToProfile(accountId, rows);
}

function rowsToProfile(
  accountId: string,
  rows: ProfileRow[]
): MaterialisedProfile {
  const out: MaterialisedProfile = { accountId, extra: {} };
  let height = -1;
  let ts = -1;
  for (const row of rows) {
    if (row.operation === 'delete') continue;
    if (row.blockHeight > height) {
      height = row.blockHeight;
      ts = row.blockTimestamp;
    }
    const f = row.field;
    if (f === 'v') {
      const n = Number(row.value);
      if (!Number.isNaN(n)) out.v = n;
    } else if (f === 'name') out.name = row.value;
    else if (f === 'bio') out.bio = row.value;
    else if (f === 'avatar') out.avatar = row.value;
    else if (f === 'banner') out.banner = row.value;
    else if (JSON_FIELDS.has(f)) {
      const parsed = tryParseJson(row.value);
      if (f === 'links' && parsed && typeof parsed === 'object') {
        out.links = parsed as Record<string, string>;
      } else if (f === 'tags' && Array.isArray(parsed)) {
        out.tags = parsed as string[];
      } else {
        out.extra[f] = row.value;
      }
    } else if (!RESERVED.has(f)) {
      out.extra[f] = row.value;
    }
  }
  if (height >= 0) {
    out.lastUpdatedHeight = height;
    out.lastUpdatedAt = ts;
  }
  return out;
}

/**
 * Profile read + update.
 *
 * `update()` auto-uploads `avatar` / `banner` when they are `File`/`Blob`
 * values and a `StorageProvider` is configured on `OnSocial` (otherwise
 * the gateway uploads on the dev's behalf).
 *
 * @throws {SessionRequiredError} On `update()` when no session is attached and broadcast is not `'wallet'`.
 */
export class ProfilesModule {
  constructor(
    private _social: SocialModule,
    private _query: QueryModule,
    private _storage: StorageProvider
  ) {}

  /**
   * Create or update the current user's profile.
   *
   * Any profile field can be a string (URL/CID) or a `File`/`Blob` — the SDK
   * uploads files to IPFS via the configured StorageProvider and stores
   * `ipfs://<cid>` in their place.
   *
   * Custom fields (e.g. `pronouns`, `location`, `galleryCover`) are written
   * under `profile/<key>`, JSON-encoded only if they aren't strings or files.
   *
   * ```ts
   * await os.profiles.update({ name: 'Alice', bio: 'Builder' });
   * await os.profiles.update({ avatar: file, banner: coverFile });
   * await os.profiles.update({
   *   name: 'Alice',
   *   links: { twitter: '@alice', github: 'alice' },
   *   tags: ['near', 'rust'],
   *   pronouns: 'they/them',
   *   galleryCover: file,
   * });
   * ```
   */
  update(
    profile: ProfileData,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return opts
      ? this._social.setProfile(profile, opts)
      : this._social.setProfile(profile);
  }

  /**
   * Fetch a single profile as a materialised object (one row instead of
   * one-row-per-field). Returns `null` if the account has no profile
   * fields.
   *
   * **This is the right method for app code.** For raw indexer rows (one
   * per field, with block height / timestamp / operation metadata) use
   * `os.query.profiles.get(accountId)` instead.
   *
   * ```ts
   * const me = await os.profiles.get('alice.near');
   * // { accountId: 'alice.near', name: 'Alice', avatar: 'ipfs://…',
   * //   links: { twitter: '@alice' }, tags: ['near'], extra: {} }
   * ```
   */
  async get(accountId: string): Promise<MaterialisedProfile | null> {
    const res = await this._query.graphql<{ profilesCurrent: ProfileRow[] }>({
      query: `query Profile($id: String!) {
        profilesCurrent(where: {accountId: {_eq: $id}}) {
          accountId field value blockHeight blockTimestamp operation
        }
      }`,
      variables: { id: accountId },
    });
    const rows = res.data?.profilesCurrent ?? [];
    if (rows.length === 0) return null;
    return rowsToProfile(accountId, rows);
  }

  /**
   * Fetch many profiles in parallel. Missing accounts are simply absent
   * from the returned map.
   */
  async getMany(
    accountIds: string[]
  ): Promise<Record<string, MaterialisedProfile>> {
    const uniqueIds = [...new Set(accountIds.filter(Boolean))];
    if (uniqueIds.length === 0) return {};

    const res = await this._query.graphql<{ profilesCurrent: ProfileRow[] }>({
      query: `query Profiles($ids: [String!]!) {
        profilesCurrent(where: {accountId: {_in: $ids}}) {
          accountId field value blockHeight blockTimestamp operation
        }
      }`,
      variables: { ids: uniqueIds },
    });

    const rows = res.data?.profilesCurrent ?? [];
    const rowsByAccount = new Map<string, ProfileRow[]>();
    for (const row of rows) {
      const bucket = rowsByAccount.get(row.accountId) ?? [];
      bucket.push(row);
      rowsByAccount.set(row.accountId, bucket);
    }

    const map: Record<string, MaterialisedProfile> = {};
    for (const accountId of uniqueIds) {
      const accountRows = rowsByAccount.get(accountId);
      if (!accountRows?.length) continue;
      map[accountId] = rowsToProfile(accountId, accountRows);
    }
    return map;
  }

  /**
   * Resolve a profile's avatar to a hosted CDN URL (e.g.
   * `https://cdn.onsocial.id/ipfs/<cid>`). Returns the raw value
   * unchanged if it isn't an `ipfs://` reference, and `null` if no avatar
   * is set.
   */
  avatarUrl(profile: MaterialisedProfile | null | undefined): string | null {
    return this._mediaUrl(profile?.avatar);
  }

  /** Same as `avatarUrl` but for the banner. */
  bannerUrl(profile: MaterialisedProfile | null | undefined): string | null {
    return this._mediaUrl(profile?.banner);
  }

  /** Resolve avatar media with image/video kind for page renderers. */
  avatarMedia(
    profile: MaterialisedProfile | null | undefined
  ): ResolvedProfileMedia | null {
    return resolveProfileMediaField(profile?.avatar, this._storage);
  }

  /** Resolve banner media with image/video kind for page renderers. */
  bannerMedia(
    profile: MaterialisedProfile | null | undefined
  ): ResolvedProfileMedia | null {
    return resolveProfileMediaField(profile?.banner, this._storage);
  }

  /** Resolve any stored profile media field value. */
  resolveMedia(value: string | undefined): ResolvedProfileMedia | null {
    return resolveProfileMediaField(value, this._storage);
  }

  private _mediaUrl(value: string | undefined): string | null {
    return resolveProfileMediaField(value, this._storage)?.url ?? null;
  }
}
