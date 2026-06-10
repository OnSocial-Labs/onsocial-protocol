interface StandingPanelProps {
  accountId: string;
  standingCount?: number;
}

export function StandingPanel({
  accountId,
  standingCount = 0,
}: StandingPanelProps) {
  return (
    <div className="panel-body">
      <p className="panel-lead">
        Who <strong>@{accountId}</strong> stands with and who stands with them.
      </p>
      <div className="panel-placeholder">
        <span className="panel-placeholder-label">
          {standingCount > 0 ? `${standingCount} standing links` : 'No standing yet'}
        </span>
        <p>Incoming and outgoing standing will be browsable from this panel.</p>
      </div>
    </div>
  );
}
