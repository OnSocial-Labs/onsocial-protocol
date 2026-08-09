// ---------------------------------------------------------------------------
// builders/block — account block graph payloads
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { SocialSetData } from './_shared.js';

export function buildBlockSetData(
  targetAccount: string,
  now = Date.now()
): SocialSetData {
  return {
    [`block/${targetAccount}`]: { v: SCHEMA_VERSION, since: now },
  };
}

export function buildBlockRemoveData(targetAccount: string): SocialSetData {
  return {
    [`block/${targetAccount}`]: null,
  };
}
