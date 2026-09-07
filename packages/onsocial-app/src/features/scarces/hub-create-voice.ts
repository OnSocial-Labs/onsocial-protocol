/** Same toggle voice as New drop description and Create DAO purpose. */
export function hubCreateAboutToggle(opts: {
  open: boolean;
  hasText: boolean;
}): string {
  if (opts.open) return 'Hide about';
  return opts.hasText ? 'Edit about' : 'Add about';
}
