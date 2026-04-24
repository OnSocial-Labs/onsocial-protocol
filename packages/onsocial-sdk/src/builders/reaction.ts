// ---------------------------------------------------------------------------
// builders/reaction — reaction set / remove payloads
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { ReactionData } from '../types.js';
import type { SocialSetData } from './_shared.js';

/**
 * Build a reaction write. v1 path layout: `reaction/<owner>/<kind>/<contentPath>`.
 *
 * Including the kind in the path lets a single reactor emit multiple reactions
 * to the same target (e.g. like + bookmark) without one overwriting the other.
 */
export function buildReactionSetData(
  ownerAccount: string,
  contentPath: string,
  reaction: ReactionData
): SocialSetData {
  const kind = String(reaction.type ?? '').trim();
  if (!kind) {
    throw new Error('reaction.type required to derive path');
  }
  return {
    [`reaction/${ownerAccount}/${kind}/${contentPath}`]: {
      v: SCHEMA_VERSION,
      ...reaction,
    },
  };
}

/** Build a reaction tombstone. Must be called with the same `kind` used to set. */
export function buildReactionRemoveData(
  ownerAccount: string,
  kind: string,
  contentPath: string
): SocialSetData {
  return {
    [`reaction/${ownerAccount}/${kind}/${contentPath}`]: null,
  };
}
