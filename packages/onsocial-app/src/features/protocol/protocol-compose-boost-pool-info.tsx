'use client';

import { InfoDrawer, InformationCircleIcon } from '@onsocial/ui';

export const PROTOCOL_COMPOSE_BOOST_POOL_META = '60/40';

export function protocolComposeBoostPoolInfo() {
  return {
    title: 'Boost pool',
    summary: 'This share goes to the boost contract.',
    detail:
      '60% infra · 40% lock rewards. Infra covers boost ops; the DAO can withdraw. Lock rewards go to users who lock SOCIAL in boost.',
  };
}

export function ProtocolComposeBoostPoolLabel({
  onOpenInfo,
  disabled = false,
}: {
  onOpenInfo: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="protocol-compose-field-label">
      <span className="protocol-compose-field-label-copy">
        <span className="protocol-compose-field-label-text">Boost pool</span>
        <span className="protocol-compose-field-label-meta" aria-hidden>
          · {PROTOCOL_COMPOSE_BOOST_POOL_META}
        </span>
      </span>
      <button
        type="button"
        className="protocol-compose-field-info-button"
        aria-label="About Boost pool"
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          onOpenInfo();
        }}
      >
        <InformationCircleIcon
          className="protocol-compose-field-info-icon"
          aria-hidden
        />
      </button>
    </span>
  );
}

export function ProtocolComposeBoostPoolInfoDrawer({
  open,
  onClose,
  zIndex = 100,
}: {
  open: boolean;
  onClose: () => void;
  zIndex?: number;
}) {
  const info = protocolComposeBoostPoolInfo();
  return (
    <InfoDrawer
      open={open}
      onClose={onClose}
      title={info.title}
      summary={info.summary}
      detail={info.detail}
      zIndex={zIndex}
    />
  );
}
