'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Divider, osFieldBorderedClassName, ProfileAvatar } from '@onsocial/ui';
import {
  fetchCollectionCreatorFace,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import {
  ticketPassOriginLabel,
  ticketPassSeatLabel,
  ticketPassStatusLabel,
  type PassStaffVoice,
} from '@/features/scarces/ticket-pass-payload';
import type { TicketTokenStatus } from '@/features/scarces/ticket-token-status';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fallbackLabel } from '@/lib/profile-display';

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
  admitConfirmed = false,
  canAdmit = false,
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
  /** Staff confirmed holder — ready for wallet Admit / Redeem. */
  admitConfirmed?: boolean;
  canAdmit?: boolean;
}) {
  const [holderFace, setHolderFace] = useState<CollectionCreatorFace | null>(
    null
  );
  const [holderFetchOwnerId, setHolderFetchOwnerId] = useState('');
  const [holderFetchDone, setHolderFetchDone] = useState(false);

  const ownerId = status?.ownerId?.trim() || '';
  const shouldFetchHolder = Boolean(ownerId);
  const holderFaceForOwner =
    shouldFetchHolder && holderFetchOwnerId === ownerId ? holderFace : null;
  const holderReady = shouldFetchHolder
    ? holderFetchOwnerId === ownerId && holderFetchDone
    : true;

  useEffect(() => {
    if (!shouldFetchHolder) return;
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void fetchCollectionCreatorFace(client, ownerId)
      .then((face) => {
        if (cancelled) return;
        setHolderFetchOwnerId(ownerId);
        setHolderFace(face);
        setHolderFetchDone(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHolderFetchOwnerId(ownerId);
        setHolderFace({ avatarUrl: null, displayName: null });
        setHolderFetchDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetchHolder, ownerId]);

  const previewLine = status
    ? ticketPassStatusLabel({
        isValid: status.isValid,
        isFullyRedeemed: status.isFullyRedeemed,
        isRevoked: status.isRevoked,
        isExpired: status.isExpired,
        isRefunded: status.isRefunded,
        redeemCount: status.redeemCount,
        maxRedeems: status.maxRedeems,
        voice,
      })
    : null;

  const lastLine = voice === 'redeem' ? 'Last redeemed' : 'Last admitted';
  const redeemVoice = voice === 'redeem';
  const leadText =
    lead !== undefined
      ? lead
      : status
        ? null
        : cameraError && !cameraActive
          ? 'Camera unavailable — paste a live Show pass code, then Look up.'
          : cameraActive
            ? redeemVoice
              ? 'Point at a live coupon QR.'
              : 'Point at a live Show pass QR.'
            : redeemVoice
              ? 'Start the camera or paste a live coupon code.'
              : 'Start the camera or paste a live Show pass code.';

  const holderHandle = ownerId ? fallbackLabel(ownerId) : '';
  const holderDisplay = holderFaceForOwner?.displayName?.trim() || null;
  const holderAccount = holderHandle ? `@${holderHandle}` : '';
  const previewLabel = status?.title?.trim() || eventName;
  const originLine = status
    ? ticketPassOriginLabel({
        ownerId: status.ownerId,
        minterId: status.minterId,
      })
    : null;
  const confirmCue =
    status && canAdmit
      ? admitConfirmed
        ? voice === 'redeem'
          ? 'Confirmed — ready to redeem'
          : 'Confirmed — ready to admit'
        : voice === 'redeem'
          ? 'Confirm this guest to redeem'
          : 'Confirm this guest to admit'
      : null;

  return (
    <div className="ticket-door">
      {leadText ? <p className="ticket-door-lead">{leadText}</p> : null}

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

      {scanHint && !status ? (
        <p className="ticket-door-hint">{scanHint}</p>
      ) : null}
      {lastAdmittedTokenId ? (
        <p className="ticket-door-hint is-success">
          {lastLine} · {ticketPassSeatLabel(lastAdmittedTokenId)}
        </p>
      ) : null}

      {status ? (
        <>
          <Divider variant="detail" />
          <div
            className="ticket-door-preview"
            aria-label={`Pass for ${previewLabel}`}
          >
            {ownerId ? (
              <div className="ticket-door-preview-holder">
                <ProfileAvatar
                  src={holderFaceForOwner?.avatarUrl ?? null}
                  fallbackInitial={holderDisplay || ownerId}
                  size="md"
                  shellLoading={!holderReady}
                  className="ticket-door-preview-holder-avatar"
                />
                <div className="ticket-door-preview-holder-copy">
                  {holderDisplay ? (
                    <p className="ticket-door-preview-holder-name">
                      {holderDisplay}
                    </p>
                  ) : null}
                  {holderAccount ? (
                    <p className="ticket-door-preview-holder-account">
                      {holderAccount}
                    </p>
                  ) : null}
                  {originLine ? (
                    <p className="ticket-door-preview-origin">{originLine}</p>
                  ) : null}
                  <p
                    className={`ticket-door-preview-status${
                      status.isValid && !status.isRefunded
                        ? ' is-valid'
                        : status.isFullyRedeemed
                          ? ' is-used'
                          : ' is-invalid'
                    }`}
                  >
                    {previewLine}
                  </p>
                  <p className="ticket-door-preview-seat">
                    {ticketPassSeatLabel(status.tokenId)}
                  </p>
                  <p className="ticket-door-preview-token">{status.tokenId}</p>
                  {confirmCue ? (
                    <p
                      className={`ticket-door-preview-confirm${
                        admitConfirmed ? ' is-ready' : ''
                      }`}
                    >
                      {confirmCue}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                {originLine ? (
                  <p className="ticket-door-preview-origin">{originLine}</p>
                ) : null}
                <p
                  className={`ticket-door-preview-status${
                    status.isValid && !status.isRefunded
                      ? ' is-valid'
                      : status.isFullyRedeemed
                        ? ' is-used'
                        : ' is-invalid'
                  }`}
                >
                  {previewLine}
                </p>
                <p className="ticket-door-preview-seat">
                  {ticketPassSeatLabel(status.tokenId)}
                </p>
                <p className="ticket-door-preview-token">{status.tokenId}</p>
                {confirmCue ? (
                  <p
                    className={`ticket-door-preview-confirm${
                      admitConfirmed ? ' is-ready' : ''
                    }`}
                  >
                    {confirmCue}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
