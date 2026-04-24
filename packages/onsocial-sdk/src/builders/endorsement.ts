// ---------------------------------------------------------------------------
// builders/endorsement — weighted directed vouch payloads
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { SocialSetData } from './_shared.js';

export type EndorsementWeightInput = 1 | 2 | 3 | 4 | 5;

export interface EndorsementBuildInput {
  topic?: string;
  weight?: EndorsementWeightInput;
  note?: string;
  expiresAt?: number;
  /** Override timestamp (defaults to Date.now()). */
  now?: number;
}

/**
 * Build an endorsement. Path: `endorsement/<target>` or
 * `endorsement/<target>/<topic>` when `topic` is set.
 */
export function buildEndorsementSetData(
  targetAccount: string,
  input: EndorsementBuildInput = {}
): SocialSetData {
  const value: Record<string, unknown> = {
    v: SCHEMA_VERSION,
    since: input.now ?? Date.now(),
  };
  if (input.topic !== undefined) value.topic = input.topic;
  if (input.weight !== undefined) value.weight = input.weight;
  if (input.note !== undefined) value.note = input.note;
  if (input.expiresAt !== undefined) value.expiresAt = input.expiresAt;
  const path = input.topic
    ? `endorsement/${targetAccount}/${input.topic}`
    : `endorsement/${targetAccount}`;
  return { [path]: value };
}

export function buildEndorsementRemoveData(
  targetAccount: string,
  topic?: string
): SocialSetData {
  const path = topic
    ? `endorsement/${targetAccount}/${topic}`
    : `endorsement/${targetAccount}`;
  return { [path]: null };
}
