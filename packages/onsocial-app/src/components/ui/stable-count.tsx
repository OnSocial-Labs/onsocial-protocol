/**
 * One cell per glyph, each `1ch` wide (the width of “0”).
 * DM Sans has no working tabular figures, so “1” is narrower than “2”
 * and a proportional count shoves the rest of the row.
 * A new character (9 → 10, or 1.4k) still grows the row by one cell.
 */
export function StableCount({
  value,
  className,
}: {
  value: number | string;
  className?: string;
}) {
  const text = String(value);
  return (
    <span
      className={className ? `os-stable-count ${className}` : 'os-stable-count'}
    >
      {Array.from(text).map((glyph, index) => (
        <span className="os-stable-count-glyph" key={index}>
          {glyph}
        </span>
      ))}
    </span>
  );
}
