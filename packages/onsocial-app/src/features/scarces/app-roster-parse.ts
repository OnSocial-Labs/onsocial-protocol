/** Max accounts per AddApprovedCreators call (matches scarces contract). */
export const MAX_CREATOR_BATCH = 20;

/** Split roster input on commas, whitespace, or newlines; unique lowercase. */
export function parseRosterAccountIds(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const id = part.trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
