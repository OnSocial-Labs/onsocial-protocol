interface EndorsementsPanelProps {
  accountId: string;
}

export function EndorsementsPanel({ accountId }: EndorsementsPanelProps) {
  return (
    <div className="panel-body">
      <p className="panel-lead">
        Endorsements received and given for <strong>@{accountId}</strong> will
        live here — routed as a glass overlay from the portfolio and shareable
        at this URL.
      </p>
      <div className="panel-placeholder">
        <span className="panel-placeholder-label">Coming next</span>
        <p>Portal endorsement cards and wallet actions will port into this panel.</p>
      </div>
    </div>
  );
}
