/** Billing countries for OnAPI checkout (ISO 3166-1 alpha-2). */

export const BILLING_COUNTRY_OPTIONS: ReadonlyArray<{
  code: string;
  label: string;
}> = [
  // UK first (seller jurisdiction / default)
  { code: 'GB', label: 'United Kingdom' },
  // EU (reverse-charge eligible with VIES)
  { code: 'AT', label: 'Austria' },
  { code: 'BE', label: 'Belgium' },
  { code: 'BG', label: 'Bulgaria' },
  { code: 'HR', label: 'Croatia' },
  { code: 'CY', label: 'Cyprus' },
  { code: 'CZ', label: 'Czechia' },
  { code: 'DK', label: 'Denmark' },
  { code: 'EE', label: 'Estonia' },
  { code: 'FI', label: 'Finland' },
  { code: 'FR', label: 'France' },
  { code: 'DE', label: 'Germany' },
  { code: 'GR', label: 'Greece' },
  { code: 'HU', label: 'Hungary' },
  { code: 'IE', label: 'Ireland' },
  { code: 'IT', label: 'Italy' },
  { code: 'LV', label: 'Latvia' },
  { code: 'LT', label: 'Lithuania' },
  { code: 'LU', label: 'Luxembourg' },
  { code: 'MT', label: 'Malta' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'PL', label: 'Poland' },
  { code: 'PT', label: 'Portugal' },
  { code: 'RO', label: 'Romania' },
  { code: 'SK', label: 'Slovakia' },
  { code: 'SI', label: 'Slovenia' },
  { code: 'ES', label: 'Spain' },
  { code: 'SE', label: 'Sweden' },
  // Common rest-of-world
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'NO', label: 'Norway' },
  { code: 'IS', label: 'Iceland' },
  { code: 'LI', label: 'Liechtenstein' },
  { code: 'SG', label: 'Singapore' },
  { code: 'HK', label: 'Hong Kong' },
  { code: 'JP', label: 'Japan' },
  { code: 'KR', label: 'South Korea' },
  { code: 'IN', label: 'India' },
  { code: 'BR', label: 'Brazil' },
  { code: 'MX', label: 'Mexico' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'IL', label: 'Israel' },
  { code: 'ZA', label: 'South Africa' },
];

/** Options shaped for `PortalFieldSelect`. */
export const BILLING_COUNTRY_SELECT_OPTIONS = BILLING_COUNTRY_OPTIONS.map(
  (opt) => ({
    value: opt.code,
    label: opt.label,
    hint: opt.code,
  })
);
