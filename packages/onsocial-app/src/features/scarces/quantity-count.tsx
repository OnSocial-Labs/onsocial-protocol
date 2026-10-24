import {
  activityKindText,
  quantityCountPhrase,
  quantityMark,
  quantityVerbFromLabel,
} from '@/features/scarces/quantity-count-format';

/**
 * The count, and nothing when it is one.
 * No verb → `×2` (a holding). A verb → `2 minted` (a price or an activity row).
 */
export function QuantityCount({
  quantity,
  verb,
  className,
}: {
  quantity?: number | null;
  verb?: string;
  className?: string;
}) {
  const text = verb
    ? quantityCountPhrase(quantity, verb)
    : quantityMark(quantity);
  if (!text) return null;
  const classNames = className
    ? `os-quantity-count ${className}`
    : 'os-quantity-count';
  return <span className={classNames}>{text}</span>;
}

/** Activity / history kind. The bare verb stays when the count is one. */
export function ActivityQuantityLabel({
  label,
  quantity,
}: {
  label: string;
  quantity?: number | null;
}) {
  const text = activityKindText(label, quantity);
  const verb = quantityVerbFromLabel(label);
  if (!verb || text === label) return <>{label}</>;
  return <QuantityCount quantity={quantity} verb={verb} />;
}
