/**
 * DAO portfolio branding — cover + crest like user profiles.
 *
 * Read order:
 * 1. OnSocial `{dao}/profile/*` when present (true social profile)
 * 2. Sputnik `get_config.metadata` OnSocial JSON (`onsocial` blob)
 * 3. Sputnik name / purpose only
 *
 * Write path: ChangeConfig / factory create with `metadata` as Sputnik
 * `Base64VecU8` (base64 of UTF-8 JSON). Empty string = no metadata.
 * After approval, branding is public for every surface.
 */

import type { ResolvedPageHero } from '@/lib/page-data';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import type { AppProfileShell } from '@/lib/profile-shell';
import {
  resolveKnownBoardForDaoAccount,
  resolveProtocolDaoBoard,
} from '@/features/protocol/dao-accounts';
import type { ProtocolDaoBoard } from '@/lib/app-routes';

export const DAO_BRANDING_METADATA_KEY = 'onsocial';
export const DAO_BRANDING_VERSION = 1;

export type DaoEntityKind = ProtocolDaoBoard;

export interface DaoBranding {
  daoAccountId: string;
  kind: DaoEntityKind;
  name: string;
  description: string | null;
  /** Raw ipfs / https ref for round-trip. */
  avatar: string | null;
  banner: string | null;
  /** Normalized profile links from metadata (when present). */
  links: Record<string, string> | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bannerMedia: ResolvedPageHero | null;
  source: 'profile' | 'metadata' | 'config';
}

export interface DaoBrandingPayload {
  v: number;
  name?: string;
  description?: string | null;
  avatar?: string | null;
  banner?: string | null;
  links?: Record<string, string> | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function utf8ToBase64(text: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUtf8(b64: string): string | null {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(b64, 'base64').toString('utf8');
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Decode Sputnik `Config.metadata` (`Base64VecU8`) to UTF-8 JSON text.
 * Also accepts plain JSON (tests / mistaken legacy writes).
 */
export function decodeDaoConfigMetadata(
  wire: string | null | undefined
): string {
  const raw = wire?.trim() ?? '';
  if (!raw) return '';
  if (raw.startsWith('{') || raw.startsWith('[')) return raw;
  const decoded = base64ToUtf8(raw);
  if (decoded == null) return '';
  return decoded.trim();
}

/**
 * Encode UTF-8 JSON for Sputnik `Config.metadata` (`Base64VecU8`).
 * Empty → `""` (empty vec). Idempotent for already-encoded wire values.
 */
export function encodeDaoConfigMetadata(
  utf8JsonOrWire: string | null | undefined
): string {
  const text = decodeDaoConfigMetadata(utf8JsonOrWire);
  if (!text) return '';
  return utf8ToBase64(text);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readLinks(
  record: Record<string, unknown>
): Record<string, string> | null {
  const value = record.links;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const next: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry.trim()) {
      next[key] = entry.trim();
    }
  }
  return Object.keys(next).length > 0 ? next : null;
}

/** Parse OnSocial branding from Sputnik `metadata` (wire or plain JSON). */
export function parseDaoBrandingMetadata(
  metadata: string | null | undefined
): DaoBrandingPayload | null {
  const raw = decodeDaoConfigMetadata(metadata);
  if (!raw) return null;
  const root = asRecord(safeJsonParse(raw));
  if (!root) return null;
  const onsocial = asRecord(root[DAO_BRANDING_METADATA_KEY]) ?? root;
  if (!onsocial) return null;
  const version =
    typeof onsocial.v === 'number' ? onsocial.v : DAO_BRANDING_VERSION;
  if (version < 1) return null;
  return {
    v: version,
    name: readString(onsocial, 'name') ?? undefined,
    description: readString(onsocial, 'description'),
    avatar: readString(onsocial, 'avatar'),
    banner: readString(onsocial, 'banner'),
    links: readLinks(onsocial),
  };
}

/**
 * Merge branding into Sputnik metadata without wiping unknown keys.
 * Returns wire-format `Base64VecU8` (base64 of UTF-8 JSON).
 */
export function buildDaoBrandingMetadata(
  existingMetadata: string | null | undefined,
  branding: {
    name?: string;
    description?: string | null;
    avatar?: string | null;
    banner?: string | null;
    links?: Record<string, string> | null;
  }
): string {
  const raw = decodeDaoConfigMetadata(existingMetadata);
  const root = (raw ? asRecord(safeJsonParse(raw)) : null) ?? {};
  const prev = asRecord(root[DAO_BRANDING_METADATA_KEY]) ?? {};
  const next: Record<string, unknown> = {
    ...prev,
    v: DAO_BRANDING_VERSION,
  };
  if (branding.name !== undefined) {
    const name = branding.name.trim();
    if (name) next.name = name;
    else delete next.name;
  }
  if (branding.description !== undefined) {
    const description = branding.description?.trim() ?? '';
    if (description) next.description = description;
    else delete next.description;
  }
  if (branding.avatar !== undefined) {
    if (branding.avatar) next.avatar = branding.avatar;
    else delete next.avatar;
  }
  if (branding.banner !== undefined) {
    if (branding.banner) next.banner = branding.banner;
    else delete next.banner;
  }
  if (branding.links !== undefined) {
    if (branding.links && Object.keys(branding.links).length > 0) {
      next.links = branding.links;
    } else {
      delete next.links;
    }
  }
  return encodeDaoConfigMetadata(
    JSON.stringify({
      ...root,
      [DAO_BRANDING_METADATA_KEY]: next,
    })
  );
}

export function resolveDaoEntityKind(daoAccountId: string): DaoEntityKind {
  return (
    resolveKnownBoardForDaoAccount(daoAccountId) ??
    resolveProtocolDaoBoard(daoAccountId)
  );
}

export function daoEntityKindLabel(kind: DaoEntityKind): string {
  if (kind === 'governance') return 'Governance DAO';
  if (kind === 'treasury') return 'Treasury DAO';
  return 'Community DAO';
}

function mediaFromUrl(url: string | null): ResolvedPageHero | null {
  return url ? { kind: 'image', url } : null;
}

/** Compose public DAO branding from profile shell + Sputnik config. */
export function composeDaoBranding(opts: {
  daoAccountId: string;
  profile: AppProfileShell | null;
  config: { name: string; purpose: string; metadata: string } | null;
}): DaoBranding {
  const daoAccountId = opts.daoAccountId.trim();
  const kind = resolveDaoEntityKind(daoAccountId);
  const meta = parseDaoBrandingMetadata(opts.config?.metadata);
  const profile = opts.profile;

  const metaAvatar = meta?.avatar ?? null;
  const metaBanner = meta?.banner ?? null;
  const metaAvatarUrl = resolveProfileMediaUrl(metaAvatar);
  const metaBannerUrl = resolveProfileMediaUrl(metaBanner);

  const hasProfileMedia = Boolean(profile?.avatarUrl || profile?.bannerUrl);
  const hasMetaMedia = Boolean(metaAvatarUrl || metaBannerUrl);
  const hasProfileCopy = Boolean(profile?.name || profile?.bio);
  const hasMetaCopy = Boolean(meta?.name || meta?.description);

  let source: DaoBranding['source'] = 'config';
  if (hasProfileMedia || (hasProfileCopy && !hasMetaMedia && !hasMetaCopy)) {
    source = 'profile';
  } else if (hasMetaMedia || hasMetaCopy) {
    source = 'metadata';
  }

  const name =
    (source === 'profile' ? profile?.name : null) ||
    meta?.name ||
    profile?.name ||
    opts.config?.name?.trim() ||
    daoAccountId;

  const description =
    (source === 'profile' ? profile?.bio : null) ||
    meta?.description ||
    profile?.bio ||
    opts.config?.purpose?.trim() ||
    null;

  // Keep metadata IPFS refs for ChangeConfig round-trip even when display
  // prefers a profile shell URL.
  const avatar = metaAvatar;
  const banner = metaBanner;

  const avatarUrl =
    (source === 'metadata' ? metaAvatarUrl : null) ||
    profile?.avatarUrl ||
    metaAvatarUrl;
  const bannerUrl =
    (source === 'metadata' ? metaBannerUrl : null) ||
    profile?.bannerUrl ||
    metaBannerUrl;

  const bannerMedia =
    (source === 'metadata' ? mediaFromUrl(metaBannerUrl) : null) ||
    profile?.bannerMedia ||
    mediaFromUrl(bannerUrl);

  return {
    daoAccountId,
    kind,
    name,
    description,
    avatar,
    banner,
    links:
      meta?.links ??
      (profile?.links && Object.keys(profile.links).length > 0
        ? profile.links
        : null),

    avatarUrl,
    bannerUrl,
    bannerMedia,
    source,
  };
}
