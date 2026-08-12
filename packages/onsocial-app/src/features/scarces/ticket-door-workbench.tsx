'use client';

import { Divider } from '@onsocial/ui';
import { ticketPassStatusLabel } from '@/features/scarces/ticket-pass-payload';
import type { TicketTokenStatus } from '@/features/scarces/ticket-token-status';
import type { RefObject } from 'react';

/** Shared camera + paste + preview body for Door sheet and Admit page. */
export function TicketDoorWorkbench({
  eventName,
  videoRef,
  cameraActive,
  cameraError,
  scanHint,
  manualInput,
  setManualInput,
  lookupPending,
  admitPending,
  lookupError,
  setLookupError,
  status,
  lastAdmittedTokenId,
  applyLookup,
  lead,
}: {
  eventName: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraActive: boolean;
  cameraError: string | null;
  scanHint: string | null;
  manualInput: string;
  setManualInput: (value: string) => void;
  lookupPending: boolean;
  admitPending: boolean;
  lookupError: string | null;
  setLookupError: (value: string | null) => void;
  status: TicketTokenStatus | null;
  lastAdmittedTokenId?: string | null;
  applyLookup: (raw: string) => void | Promise<void>;
  lead?: string;
}) {
  const previewLine = status
    ? ticketPassStatusLabel({
        isValid: status.isValid,
        isFullyRedeemed: status.isFullyRedeemed,
        isRevoked: status.isRevoked,
        isExpired: status.isExpired,
        redeemCount: status.redeemCount,
        maxRedeems: status.maxRedeems,
      })
    : null;

  return (
    <div className="ticket-door">
      <p className="ticket-door-lead">
        {lead ?? 'Scan a Show pass QR, or paste the pass code, then admit.'}
      </p>

      <div className={`ticket-door-camera${cameraActive ? ' is-live' : ''}`}>
        <video
          ref={videoRef}
          className="ticket-door-video"
          playsInline
          muted
          aria-label="Door camera"
        />
        {!cameraActive ? (
          <div className="ticket-door-camera-empty">
            <p>{cameraError ?? 'Camera idle'}</p>
          </div>
        ) : null}
      </div>

      {scanHint ? <p className="ticket-door-hint">{scanHint}</p> : null}
      {lastAdmittedTokenId ? (
        <p className="ticket-door-hint is-success">
          Last admitted · {lastAdmittedTokenId}
        </p>
      ) : null}

      <label className="ticket-door-field">
        <span className="ticket-door-field-label">Pass code</span>
        <input
          className="ticket-door-input"
          value={manualInput}
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Scan or paste os1:… / token id"
          disabled={admitPending}
          onChange={(event) => {
            setManualInput(event.target.value);
            setLookupError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void applyLookup(manualInput);
            }
          }}
        />
      </label>

      <button
        type="button"
        className="ticket-door-lookup"
        disabled={admitPending || lookupPending || !manualInput.trim()}
        onClick={() => {
          void applyLookup(manualInput);
        }}
      >
        {lookupPending ? 'Looking up…' : 'Look up'}
      </button>

      {lookupError ? (
        <p className="ticket-door-error" role="alert">
          {lookupError}
        </p>
      ) : null}

      {status ? (
        <>
          <Divider variant="detail" />
          <div className="ticket-door-preview">
            <p className="ticket-door-preview-title">
              {status.title?.trim() || eventName}
            </p>
            <p className="ticket-door-preview-meta">
              Holder · {status.ownerId}
            </p>
            <p
              className={`ticket-door-preview-status${
                status.isValid
                  ? ' is-valid'
                  : status.isFullyRedeemed
                    ? ' is-used'
                    : ' is-invalid'
              }`}
            >
              {previewLine}
            </p>
            <p className="ticket-door-preview-token">{status.tokenId}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
