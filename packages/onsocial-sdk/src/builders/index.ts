// ---------------------------------------------------------------------------
// builders — pure OnSocial `Set` payload builders
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
export { profileMetaFromBio, type ProfileBioMeta } from './profile-meta.js';
export {
  PROFILE_LEAD_MAX,
  normalizeProfileLeadInput,
  profileLeadFromMaterialised,
  sanitizeProfileLeadDraft,
} from './profile-lead.js';
export {
  PROFILE_ABOUT_ALIGN_DEFAULT,
  PROFILE_ABOUT_ALIGN_OPTIONS,
  normalizeProfileAboutAlign,
  profileAboutAlignFromMaterialised,
  type ProfileAboutAlign,
} from './profile-about-align.js';
export {
  PROFILE_LOCATION_MAX,
  normalizeProfileLocationInput,
  profileLocationFromMaterialised,
  sanitizeProfileLocationDraft,
} from './profile-location.js';
export {
  PROFILE_INDUSTRY_MAX,
  PROFILE_INDUSTRY_OPTIONS,
  PROFILE_INDUSTRY_WRITE_IN,
  isProfileIndustryWriteIn,
  isProfileIndustryWriteInMode,
  matchProfileIndustryOption,
  normalizeProfileIndustryInput,
  discoverIndustryChoiceOptions,
  profileIndustryChoiceOptions,
  profileIndustryDrawerValue,
  profileIndustryFromMaterialised,
  profileOrgLineLabel,
  sanitizeProfileIndustryDraft,
} from './profile-industry.js';
export type {
  ProfileIndustryChoice,
  ProfileIndustryOption,
  ProfileIndustrySection,
} from './profile-industry.js';
export {
  PROFILE_KINDS,
  PROFILE_FACE_KIND_OPTIONS,
  PROFILE_KIND_OPTIONS,
  editorFaceKind,
  normalizeProfileKindInput,
  parseProfileKind,
  profileAvatarShapeForFace,
  profileAvatarShapeFromKind,
  profileKindFaceLabel,
  profileKindFromMaterialised,
  resolveDisplayProfileKind,
} from './profile-kind.js';
export type { ProfileAvatarShape, ProfileKind } from './profile-kind.js';
export {
  autolinkDisplayHost,
  isAutolinkableHostname,
  normalizeAutolinkUrl,
  splitRichText,
  type RichTextSegment,
} from './rich-text.js';
export {
  OS_RICH_CHIP_ATTR,
  decorateRichTextChips,
  getRichTextCaretOffset,
  getRichTextSelectionOffsets,
  richTextSegmentsToChipHtml,
  setRichTextCaretOffset,
  setRichTextSelectionOffsets,
  unwrapRichTextChips,
} from './rich-text-chips.js';

export {
  PROFILE_BIO_LIST_PREFIX,
  continueProfileBioListOnEnter,
  isProfileBioHashtagLine,
  isProfileBioHeadingLine,
  isProfileBioListLine,
  isProfileBioRangeBold,
  isProfileBioRangeHeading,
  isProfileBioRangeItalic,
  isProfileBioRangeList,
  profileAboutBlocks,
  profileBioBoldRanges,
  profileBioHtmlToMarkdown,
  profileBioItalicRanges,
  profileBioLineSpansTouching,
  profileBioMarkdownToHtml,
  profileBioMarkRanges,
  profileBioPlainPreview,
  profileBioWordBounds,
  splitProfileBioBoldDisplayRuns,
  splitProfileBioBoldEditorRuns,
  splitProfileBioInlineDisplayRuns,
  splitProfileBioItalicDisplayRuns,
  splitProfileBioItalicEditorRuns,
  stripProfileBioListPrefix,
  toggleProfileBioBold,
  toggleProfileBioHeading,
  toggleProfileBioItalic,
  toggleProfileBioList,
} from './profile-bio-rich.js';
export type {
  ProfileAboutBlock,
  ProfileBioBoldRange,
  ProfileBioBoldRun,
  ProfileBioInlineRun,
  ProfileBioItalicRange,
  ProfileBioItalicRun,
  ProfileBioMarkRange,
  ProfileBioMarkRun,
} from './profile-bio-rich.js';

export {
  buildPostSetData,
  buildReplySetData,
  buildQuoteSetData,
  buildRepostSetData,
  resolvePostMedia,
  isFileLike,
} from './post.js';

export {
  buildGroupPostSetData,
  buildGroupPostPath,
  buildGroupReplySetData,
  buildGroupQuoteSetData,
  buildGroupRepostSetData,
} from './group-post.js';

export { buildStandingSetData, buildStandingRemoveData } from './standing.js';
export { buildBlockSetData, buildBlockRemoveData } from './block.js';

export { buildReactionSetData, buildReactionRemoveData } from './reaction.js';

export { buildSaveSetData, buildSaveRemoveData } from './save.js';
export type { SaveBuildInput } from './save.js';

export {
  JOB_DESCRIPTION_MAX,
  JOB_TITLE_MAX,
  JOB_URL_MAX,
  buildJobRemoveData,
  buildJobSetData,
  createJobId,
  formatJobEndsLabel,
  formatJobClosesLabel,
  formatJobListingMetaLabel,
  hiringLineAriaLabel,
  hiringLineLabel,
  isJobOpen,
  jobDateInputFromEnds,
  jobEndsFromDateInput,
  jobPath,
  normalizeJobDescription,
  normalizeJobTitle,
  normalizeJobUrl,
  sortAccountJobs,
  todayDateInput,
} from './jobs.js';
export type { JobBuildInput } from './jobs.js';
export {
  buildEndorsementSetData,
  buildEndorsementRemoveData,
  normalizeEndorsementTopic,
} from './endorsement.js';
export type { EndorsementBuildInput } from './endorsement.js';
export {
  createEndorsementId,
  resolveEndorsementBuildInput,
  isMediaRef,
  ENDORSEMENT_ID_PATTERN,
} from './endorsement-media.js';

export {
  buildAttestationSetData,
  buildAttestationRemoveData,
} from './attestation.js';
export type {
  AttestationBuildInput,
  AttestationSignatureInput,
} from './attestation.js';
