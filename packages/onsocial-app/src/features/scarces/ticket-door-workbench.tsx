'use client';

import { Divider, osFieldBorderedClassName } from '@onsocial/ui';
import { ticketPassStatusLabel, type PassStaffVoice } from '@/features/scarces/ticket-pass-payload';
import type { TicketTokenStatus } from '@/features/scarces/ticket-token-status';
import type { RefObject } from 'react';

/** Shared camera + paste + preview body for Door Admit and coupon Redeem. */
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
  voice = 'admit',
  attendanceLine,
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
  voice?: PassStaffVoice;
  /** Live collection attendance, e.g. Checked in 47 of 200. */
  attendanceLine?: string | null;
}) {
  const previewLine = status
    ? ticketPassStatusLabel({
        isValid: status.isValid,
        isFullyRedeemed: status.isFullyRedeemed,
        isRevoked: status.isRevoked,
        isExpired: status.isExpired,
        redeemCount: status.redeemCount,
        maxRedeems: status.maxRedeems,
        voice,
      })
    : null;

  const lastLine =
    voice === 'redeem' ? 'Last redeemed' : 'Last admitted';
  const redeemVoice = voice === 'redeem';
  const emptyMinted =
    attendanceLine === 'No passes minted yet' ||
    attendanceLine === 'No coupons minted yet';
  const leadText =
    lead !== undefined
      ? lead
      : emptyMinted
        ? null
        : cameraError
          ? 'Paste into the Pass code field, then Look up.'
          : cameraActive
            ? redeemVoice
              ? 'Point at a coupon QR.'
              : 'Point at a Show pass QR.'
            : redeemVoice
              ? 'Start the camera or paste a coupon code.'
              : 'Start the camera or paste a pass code.';

  return (
    <div className="ticket-door">
      {attendanceLine ? (
        <p className="ticket-door-attendance" aria-live="polite">
          {attendanceLine}
        </p>
      ) : null}

      {leadText ? <p className="ticket-door-lead">{leadText}</p> : null}

      {cameraError && !cameraActive ? (
        <p className="ticket-door-hint">{cameraError}</p>
      ) : null}

      <label className="ticket-door-field">
        <span className="ticket-door-field-label">Pass code</span>
        <input
          className={`${osFieldBorderedClassName} ticket-door-input`}
          value={manualInput}
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Paste pass code"
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

      {/* Video stays mounted for getUserMedia; square only shows when live. */}
      <div
        className={
          cameraActive
            ? 'ticket-door-camera is-live'
            : 'ticket-door-camera-host'
        }
        aria-hidden={!cameraActive}
      >
        <video
          ref={videoRef}
          className="ticket-door-video"
          playsInline
          muted
          aria-label={redeemVoice ? 'Redeem camera' : 'Door camera'}
        />
      </div>

      {scanHint ? <p className="ticket-door-hint">{scanHint}</p> : null}
      {lastAdmittedTokenId ? (
        <p className="ticket-door-hint is-success">
          {lastLine} · {lastAdmittedTokenId}
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
