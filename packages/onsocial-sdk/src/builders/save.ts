// ---------------------------------------------------------------------------
// builders/save — private bookmark payloads
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { SocialSetData } from './_shared.js';

export interface SaveBuildInput {
  folder?: string;
  note?: string;
  /** Override timestamp (defaults to Date.now()). */
  now?: number;
}

/**
 * Build a private save (bookmark). Path: `saved/<contentPath>`.
 * Personal/utility — never aggregated by indexers.
 */
export function buildSaveSetData(
  contentPath: string,
  input: SaveBuildInput = {}
): SocialSetData {
  const value: Record<string, unknown> = {
    v: SCHEMA_VERSION,
    timestamp: input.now ?? Date.now(),
  };
  if (input.folder !== undefined) value.folder = input.folder;
  if (input.note !== undefined) value.note = input.note;
  return { [`saved/${contentPath}`]: value };
}

export function buildSaveRemoveData(contentPath: string): SocialSetData {
  return { [`saved/${contentPath}`]: null };
}
