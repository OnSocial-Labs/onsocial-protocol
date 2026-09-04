// ---------------------------------------------------------------------------
// builders/profile-industry — org line (curated picker, freeform storage)
// ---------------------------------------------------------------------------

/** Max stored length for `profile/industry`. Face meta — keep short for mobile. */
export const PROFILE_INDUSTRY_MAX = 24;

/** Drawer-only. Never written to `profile/industry`. */
export const PROFILE_INDUSTRY_WRITE_IN = '__write_in__';

export type ProfileIndustrySection = 'Business' | 'Web3 & digital' | 'Civic';

export type ProfileIndustryOption = {
  value: string;
  label: string;
  section: ProfileIndustrySection;
};

export type ProfileIndustryChoice = {
  value: string;
  label: string;
  section?: ProfileIndustrySection;
  description?: string;
};

/**
 * Tight org sectors. No twins (Travel/Tourism, Food/Restaurants),
 * no DAO (workspace face), no stored “Other”.
 */
export const PROFILE_INDUSTRY_OPTIONS: readonly ProfileIndustryOption[] = [
  { value: 'Accounting', label: 'Accounting', section: 'Business' },
  { value: 'Agriculture', label: 'Agriculture', section: 'Business' },
  { value: 'Architecture', label: 'Architecture', section: 'Business' },
  { value: 'Automotive', label: 'Automotive', section: 'Business' },
  { value: 'Beauty', label: 'Beauty', section: 'Business' },
  { value: 'Construction', label: 'Construction', section: 'Business' },
  { value: 'Consulting', label: 'Consulting', section: 'Business' },
  { value: 'Education', label: 'Education', section: 'Business' },
  { value: 'Energy', label: 'Energy', section: 'Business' },
  { value: 'Engineering', label: 'Engineering', section: 'Business' },
  { value: 'Entertainment', label: 'Entertainment', section: 'Business' },
  { value: 'Fashion', label: 'Fashion', section: 'Business' },
  { value: 'Finance', label: 'Finance', section: 'Business' },
  { value: 'Food', label: 'Food', section: 'Business' },
  { value: 'Healthcare', label: 'Healthcare', section: 'Business' },
  { value: 'Hospitality', label: 'Hospitality', section: 'Business' },
  { value: 'Insurance', label: 'Insurance', section: 'Business' },
  { value: 'Legal', label: 'Legal', section: 'Business' },
  { value: 'Logistics', label: 'Logistics', section: 'Business' },
  { value: 'Manufacturing', label: 'Manufacturing', section: 'Business' },
  { value: 'Marketing', label: 'Marketing', section: 'Business' },
  { value: 'Media', label: 'Media', section: 'Business' },
  { value: 'Real Estate', label: 'Real Estate', section: 'Business' },
  { value: 'Retail', label: 'Retail', section: 'Business' },
  { value: 'Sports', label: 'Sports', section: 'Business' },
  { value: 'Technology', label: 'Technology', section: 'Business' },
  { value: 'Trades', label: 'Trades', section: 'Business' },
  { value: 'Wellness', label: 'Wellness', section: 'Business' },
  { value: 'AI', label: 'AI', section: 'Web3 & digital' },
  { value: 'Crypto', label: 'Crypto', section: 'Web3 & digital' },
  { value: 'Fintech', label: 'Fintech', section: 'Web3 & digital' },
  { value: 'Gaming', label: 'Gaming', section: 'Web3 & digital' },
  { value: 'Payments', label: 'Payments', section: 'Web3 & digital' },
  { value: 'Web3', label: 'Web3', section: 'Web3 & digital' },
  { value: 'Community', label: 'Community', section: 'Civic' },
  { value: 'Government', label: 'Government', section: 'Civic' },
  { value: 'Nonprofit', label: 'Nonprofit', section: 'Civic' },
];

/** Trim + collapse whitespace; empty → ''. Strips control chars + caps. */
export function normalizeProfileIndustryInput(raw: string): string {
  const next = raw
    // eslint-disable-next-line no-control-regex -- strip C0 + DEL
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PROFILE_INDUSTRY_MAX);
  return next === PROFILE_INDUSTRY_WRITE_IN ? '' : next;
}

/** Live typing — allow trailing spaces while drafting; still strip + cap. */
export function sanitizeProfileIndustryDraft(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex -- strip C0 + DEL
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, PROFILE_INDUSTRY_MAX)
  );
}

/**
 * Read industry from a materialised profile.
 * Prefers reserved `industry`; falls back to legacy `extra.industry`.
 */
export function profileIndustryFromMaterialised(
  profile:
    | {
        industry?: string | null;
        extra?: Record<string, string> | null;
      }
    | null
    | undefined
): string {
  const direct = profile?.industry?.trim();
  if (direct) return normalizeProfileIndustryInput(direct);
  const legacy = profile?.extra?.industry?.trim();
  if (legacy) return normalizeProfileIndustryInput(legacy);
  return '';
}

/** Org face line: written industry, or “Organization” when empty. */
export function profileOrgLineLabel(industry?: string | null): string {
  return profileIndustryFromMaterialised({ industry }) || 'Organization';
}

export function isProfileIndustryWriteIn(value: string): boolean {
  return value === PROFILE_INDUSTRY_WRITE_IN;
}

export function matchProfileIndustryOption(
  industry: string
): ProfileIndustryOption | undefined {
  const key = normalizeProfileIndustryInput(industry).toLowerCase();
  if (!key) return undefined;
  return PROFILE_INDUSTRY_OPTIONS.find(
    (option) => option.value.toLowerCase() === key
  );
}

/** Drawer selection: curated value, write-in sentinel, or '' for Organization. */
export function profileIndustryDrawerValue(industry: string): string {
  const normalized = normalizeProfileIndustryInput(industry);
  if (!normalized) return '';
  return (
    matchProfileIndustryOption(normalized)?.value ?? PROFILE_INDUSTRY_WRITE_IN
  );
}

export function isProfileIndustryWriteInMode(industry: string): boolean {
  return profileIndustryDrawerValue(industry) === PROFILE_INDUSTRY_WRITE_IN;
}

/** Hug-drawer rows: Organization (empty), curated sectors, write-in. */
export function profileIndustryChoiceOptions(): ProfileIndustryChoice[] {
  return [
    {
      value: '',
      label: 'Organization',
      description: 'No sector',
    },
    ...PROFILE_INDUSTRY_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      section: option.section,
    })),
    {
      value: PROFILE_INDUSTRY_WRITE_IN,
      label: 'Write your own',
    },
  ];
}

/** Discover industry filter — curated sectors only (exact `_eq` match). */
export function discoverIndustryChoiceOptions(): ProfileIndustryChoice[] {
  return [
    {
      value: '',
      label: 'Any industry',
    },
    ...PROFILE_INDUSTRY_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      section: option.section,
    })),
  ];
}
