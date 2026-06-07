import Link from 'next/link';

/** Let nested controls receive clicks; everything else falls through to the card link. */
export const GOVERNANCE_CARD_INTERACTIVE_LAYER_CLASS =
  'relative z-[1] pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_[role=button]]:pointer-events-auto [&_input]:pointer-events-auto [&_textarea]:pointer-events-auto [&_select]:pointer-events-auto [&_pre]:pointer-events-auto [&_code]:pointer-events-auto [&_label]:pointer-events-auto';

export function GovernanceCardNavigationLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="absolute inset-0 z-0 rounded-[inherit]"
      aria-label={label}
      tabIndex={-1}
    />
  );
}
