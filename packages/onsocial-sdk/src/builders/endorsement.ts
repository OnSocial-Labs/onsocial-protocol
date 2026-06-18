// ---------------------------------------------------------------------------
// builders/endorsement — directed contextual vouch payloads
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { MediaRef } from '../schema/v1.js';
import type { SocialSetData } from './_shared.js';
import { isMediaRef } from './endorsement-media.js';

export interface EndorsementBuildInput {
  topic?: string;
  note?: string;
  expiresAt?: number;
  /** Stable endorsement id — preserved across note/media edits. */
  id?: string;
  /** Optional photo or video (uploaded before write). */
  media?: MediaRef | Blob | File | null;
  /** Set on edit after initial publish. */
  editedAt?: number;
  /** Override timestamp (defaults to Date.now()). */
  now?: number;
}

export function normalizeEndorsementTopic(topic?: string): string | undefined {
  const normalized = (topic ?? '')
    .trim()
    .replace(/\s+/gu, '-')
    .replace(/[^A-Za-z0-9_.-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
    .slice(0, 40);

  return normalized || undefined;
}

/**
 * Build an endorsement. Path: `endorsement/<target>` or
 * `endorsement/<target>/<topic>` when `topic` is set.
 */
export function buildEndorsementSetData(
  targetAccount: string,
  input: EndorsementBuildInput = {}
): SocialSetData {
  const topic = normalizeEndorsementTopic(input.topic);
  const value: Record<string, unknown> = {
    v: SCHEMA_VERSION,
    since: input.now ?? Date.now(),
  };
  if (topic !== undefined) value.topic = topic;
  if (input.note !== undefined) value.note = input.note;
  if (input.id !== undefined) value.id = input.id;
  if (isMediaRef(input.media)) {
    value.media = input.media;
  }
  if (input.editedAt !== undefined) value.editedAt = input.editedAt;
  if (input.expiresAt !== undefined) value.expiresAt = input.expiresAt;
  const path = topic
    ? `endorsement/${targetAccount}/${topic}`
    : `endorsement/${targetAccount}`;
  return { [path]: value };
}

export function buildEndorsementRemoveData(
  targetAccount: string,
  topic?: string
): SocialSetData {
  const normalizedTopic = normalizeEndorsementTopic(topic);
  const path = normalizedTopic
    ? `endorsement/${targetAccount}/${normalizedTopic}`
    : `endorsement/${targetAccount}`;
  return { [path]: null };
}
