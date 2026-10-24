/**
 * Shared count language.
 * One copy stays quiet. More than one says the count in the same place
 * every time: `×2` for a holding, `2 minted` beside a unit price.
 * A batch total never stands in for the price of one.
 */

export function visibleQuantity(
  quantity: number | null | undefined
): number | null {
  if (quantity == null || !Number.isInteger(quantity) || quantity <= 1) {
    return null;
  }
  return quantity;
}

/** `×2` on a grouped holding. Empty when the count is one. */
export function quantityMark(
  quantity: number | null | undefined
): string | null {
  const n = visibleQuantity(quantity);
  return n == null ? null : `×${n}`;
}

/** `2 minted`. Empty when the count is one. */
export function quantityCountPhrase(
  quantity: number | null | undefined,
  verb: string
): string | null {
  const n = visibleQuantity(quantity);
  const word = verb.trim();
  if (n == null || !word) return null;
  return `${n} ${word}`;
}

/** Single-word row labels become the count verb (`Minted` → `minted`). */
export function quantityVerbFromLabel(label: string): string | null {
  const word = label.trim();
  if (!word || /\s/.test(word)) return null;
  return word.toLowerCase();
}

/** Kind line: `2 minted`, or the original label when the count is one. */
export function activityKindText(
  label: string,
  quantity?: number | null
): string {
  const verb = quantityVerbFromLabel(label);
  if (!verb) return label;
  return quantityCountPhrase(quantity, verb) ?? label;
}

/** `1 NEAR each` only when this amount is the unit of a uniform batch. */
export function activityPriceLabel(
  priceNear: string,
  quantity?: number | null,
  uniformBatch = true
): string {
  const each =
    uniformBatch && visibleQuantity(quantity) != null ? ' each' : '';
  return `${priceNear} NEAR${each}`;
}

/** Append `each` when the amount is a unit price for more than one copy. */
export function appendEach(
  amount: string,
  quantity?: number | null
): string {
  const value = amount.trim();
  if (!value) return '';
  return visibleQuantity(quantity) != null ? `${value} each` : value;
}

/** `2 minted · 1 NEAR each`, or just the amount when the count is one. */
export function quantityPriceLine(input: {
  quantity?: number | null;
  verb?: string | null;
  amount?: string | null;
}): string {
  const count = input.verb
    ? quantityCountPhrase(input.quantity, input.verb)
    : null;
  const priced = input.amount ? appendEach(input.amount, input.quantity) : '';
  return [count, priced].filter(Boolean).join(' · ');
}
