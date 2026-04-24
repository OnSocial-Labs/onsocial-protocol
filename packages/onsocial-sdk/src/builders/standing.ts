// ---------------------------------------------------------------------------
// builders/standing — "stand with" graph payloads
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { SocialSetData } from './_shared.js';

export function buildStandingSetData(
  targetAccount: string,
  now = Date.now()
): SocialSetData {
  return {
    [`standing/${targetAccount}`]: { v: SCHEMA_VERSION, since: now },
  };
}

export function buildStandingRemoveData(
  targetAccount: string
): SocialSetData {
  return {
    [`standing/${targetAccount}`]: null,
  };
}
