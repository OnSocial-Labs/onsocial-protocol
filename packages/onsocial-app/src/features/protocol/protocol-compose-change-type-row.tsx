'use client';

export function ProtocolComposeChangeTypeRow({
  hint,
  pending = false,
  onChangeKind,
}: {
  hint: string;
  pending?: boolean;
  onChangeKind?: () => void;
}) {
  if (!onChangeKind) return null;

  return (
    <div
      className={`protocol-propose-kind-current${
        hint.trim() ? '' : ' is-compact'
      }`}
    >
      {hint.trim() ? (
        <p className="protocol-compose-note">{hint}</p>
      ) : null}
      <button
        type="button"
        className="protocol-tool is-ghost"
        onClick={onChangeKind}
        disabled={pending}
      >
        Change type
      </button>
    </div>
  );
}
