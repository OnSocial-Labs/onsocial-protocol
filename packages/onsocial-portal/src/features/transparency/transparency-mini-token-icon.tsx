export function TransparencyMiniTokenIcon({
  src,
  label,
  className = '',
}: {
  src?: string | null;
  label: string;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        className={`h-4 w-4 rounded-full object-cover ${className}`.trim()}
      />
    );
  }

  return (
    <span
      aria-label={label}
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full border border-border/50 bg-muted/40 portal-type-micro font-bold uppercase text-foreground/80 ${className}`.trim()}
    >
      {label.slice(0, 1)}
    </span>
  );
}
