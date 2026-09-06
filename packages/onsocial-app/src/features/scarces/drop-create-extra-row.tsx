'use client';

export function DropCreateExtraRow({
  label,
  value,
  disabled,
  onClick,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="drop-create-extra-row"
      disabled={disabled}
      aria-label={`${label}: ${value}`}
      onClick={onClick}
    >
      <span className="drop-create-extra-row-label">{label}</span>
      <span className="drop-create-extra-row-value">{value}</span>
    </button>
  );
}
