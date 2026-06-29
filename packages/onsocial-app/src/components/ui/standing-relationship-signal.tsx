interface StandingRelationshipSignalProps {
  label: string;
  tone: 'standing' | 'solidarity' | 'endorse';
  title: string;
}

export function StandingRelationshipSignal({
  label,
  tone,
  title,
}: StandingRelationshipSignalProps) {
  return (
    <span
      className={`standing-relationship-signal standing-relationship-signal--${tone}`}
      title={title}
    >
      <span className="standing-relationship-signal-dot" aria-hidden />
      {label}
    </span>
  );
}
