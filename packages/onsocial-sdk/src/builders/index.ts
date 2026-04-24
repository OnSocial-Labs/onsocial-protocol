// ---------------------------------------------------------------------------
// builders — pure NEAR Social `Set` payload builders
//
// These functions take typed input (PostData, ReactionData, …) and return
// `SocialSetData` (a flat path → value map) ready to be wrapped in a
// `compose/set` call or a typed `Action`. They have no I/O and no
// dependency on `SocialModule` / `HttpClient`.
//
// Used by every per-noun module (`os.posts`, `os.reactions`, `os.saves`,
// `os.endorsements`, `os.attestations`, `os.standings`, `os.groups`) and
// re-exported from `@onsocial/sdk/advanced` for power users.
// ---------------------------------------------------------------------------

export type { SocialSetData } from './_shared.js';
export { applyFeedMeta } from './_shared.js';

export { buildProfileSetData } from './profile.js';

export {
  buildPostSetData,
  buildReplySetData,
  buildQuoteSetData,
  resolvePostMedia,
  isFileLike,
} from './post.js';

export {
  buildGroupPostSetData,
  buildGroupPostPath,
  buildGroupReplySetData,
  buildGroupQuoteSetData,
} from './group-post.js';

export {
  buildStandingSetData,
  buildStandingRemoveData,
} from './standing.js';

export {
  buildReactionSetData,
  buildReactionRemoveData,
} from './reaction.js';

export {
  buildSaveSetData,
  buildSaveRemoveData,
} from './save.js';
export type { SaveBuildInput } from './save.js';

export {
  buildEndorsementSetData,
  buildEndorsementRemoveData,
} from './endorsement.js';
export type {
  EndorsementBuildInput,
  EndorsementWeightInput,
} from './endorsement.js';

export {
  buildAttestationSetData,
  buildAttestationRemoveData,
} from './attestation.js';
export type {
  AttestationBuildInput,
  AttestationSignatureInput,
} from './attestation.js';
