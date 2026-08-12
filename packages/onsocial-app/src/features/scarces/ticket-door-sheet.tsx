'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Divider, GlassSheet } from '@onsocial/ui';
import { GestureSheetHeader } from '@/components/panels/gesture-sheet-header';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import {
  parseTicketPassPayload,
  ticketPassRemaining,
  ticketPassStatusLabel,
} from '@/features/scarces/ticket-pass-payload';
import {
  fetchTicketTokenStatus,
  type TicketTokenStatus,
} from '@/features/scarces/ticket-token-status';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type BarcodeDetectorLike = {
  detect: (
    source: ImageBitmapSource
  ) => Promise<Array<{ rawValue?: string }>>;
};

function getBarcodeDetector():
  | (new (opts?: { formats?: string[] }) => BarcodeDetectorLike)
  | null {
  if (typeof window === 'undefined') return null;
  const ctor = (
    window as Window & {
      BarcodeDetector?: new (opts?: {
        formats?: string[];
      }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  return ctor ?? null;
}

/**
 * Door sheet — scan Show-pass QR or paste token id, then Admit.
 * Redeem is creator or door-staff redeemer on-chain (`tokens.redeem`).
 */
export function TicketDoorSheet({
  open,
  onOpenChange,
  collectionId,
  title,
  onAdmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string;
  title: string;
  onAdmitted?: (tokenId: string) => void;
}) {
  const titleId = useId();
  const formId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [manualInput, setManualInput] = useState('');
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [lookupPending, setLookupPending] = useState(false);
  const [admitPending, setAdmitPending] = useState(false);
  const [status, setStatus] = useState<TicketTokenStatus | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const { isConnected, getSigningWallet } = useAppWallet();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setManualInput('');
      setScanHint(null);
      setCameraError(null);
      setStatus(null);
      setLookupError(null);
      setAdmitPending(false);
      setLookupPending(false);
    }
  }

  const sheetOpen = open && !closing;
  const { panelStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);
  useScrollLock(sheetOpen);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current != null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const requestClose = useCallback(() => {
    stopCamera();
    setClosing(true);
  }, [stopCamera]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const applyLookup = useCallback(
    async (raw: string) => {
      const parsed = parseTicketPassPayload(raw, collectionId);
      if (!parsed) {
        setStatus(null);
        setLookupError('That code is not for this drop.');
        return;
      }
      setLookupPending(true);
      setLookupError(null);
      try {
        const next = await fetchTicketTokenStatus(parsed.tokenId);
        if (!next) {
          setStatus(null);
          setLookupError('Pass not found.');
          return;
        }
        if (
          next.collectionId &&
          next.collectionId.trim() !== collectionId.trim()
        ) {
          setStatus(null);
          setLookupError('That pass belongs to another drop.');
          return;
        }
        setStatus(next);
        setManualInput(next.tokenId);
        setScanHint('Pass loaded.');
        stopCamera();
      } catch {
        setStatus(null);
        setLookupError('Could not load this pass.');
      } finally {
        setLookupPending(false);
      }
    },
    [collectionId, stopCamera]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setScanHint(null);
    const Detector = getBarcodeDetector();
    if (!Detector) {
      setCameraError('This browser cannot scan. Paste the pass code instead.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is unavailable. Paste the pass code instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setCameraActive(true);
      const detector = new Detector({ formats: ['qr_code'] });
      scanTimerRef.current = window.setInterval(() => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        void detector
          .detect(videoRef.current)
          .then((codes) => {
            const raw = codes[0]?.rawValue?.trim();
            if (!raw) return;
            void applyLookup(raw);
          })
          .catch(() => {
            /* keep scanning */
          });
      }, 450);
    } catch {
      stopCamera();
      setCameraError('Camera permission denied. Paste the pass code instead.');
    }
  }, [applyLookup, stopCamera]);

  useEffect(() => {
    if (!sheetOpen) {
      stopCamera();
      return;
    }
    void startCamera();
    return () => stopCamera();
  }, [sheetOpen, startCamera, stopCamera]);

  const canAdmit =
    status != null &&
    status.isValid &&
    !status.isFullyRedeemed &&
    !admitPending &&
    !lookupPending;

  const handleAdmit = useCallback(async () => {
    if (!status || !canAdmit) return;
    if (!isConnected) {
      setTxResult({
        type: 'error',
        msg: 'Connect your wallet to admit.',
      });
      return;
    }
    setAdmitPending(true);
    try {
      const { accountId: signerId, wallet } = await getSigningWallet();
      const os = createAppScarcesWalletClient(signerId, wallet);
      const response = await os.scarces.tokens.redeem(
        status.tokenId,
        collectionId
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.redeemingTicket,
        successMessage: txToastSuccess.ticketAdmitted,
        failureMessage: txToastError.redeemTicketFailed,
      });
      if (confirmed) {
        onAdmitted?.(status.tokenId);
        const remaining = ticketPassRemaining({
          redeemCount: status.redeemCount + 1,
          maxRedeems: status.maxRedeems,
        });
        setStatus({
          ...status,
          redeemCount: status.redeemCount + 1,
          isFullyRedeemed: remaining === 0,
          isValid: remaining == null ? status.isValid : remaining > 0,
        });
        requestClose();
      }
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : txToastError.redeemTicketFailed,
      });
    } finally {
      setAdmitPending(false);
    }
  }, [
    canAdmit,
    collectionId,
    getSigningWallet,
    isConnected,
    onAdmitted,
    requestClose,
    setTxResult,
    status,
    trackTransaction,
  ]);

  const footerState = useMemo((): CommerceSheetFooterState => {
    return {
      visible: true,
      primaryLabel: admitPending ? 'Admitting…' : 'Admit',
      primaryPendingLabel: 'Admitting…',
      canSubmit: canAdmit,
      pending: admitPending,
      primaryType: 'button',
      onPrimaryClick: () => {
        void handleAdmit();
      },
      secondary: {
        label: cameraActive ? 'Stop camera' : 'Scan again',
        pending: false,
        disabled: admitPending || lookupPending,
        onClick: () => {
          if (cameraActive) stopCamera();
          else void startCamera();
        },
      },
    };
  }, [
    admitPending,
    cameraActive,
    canAdmit,
    handleAdmit,
    lookupPending,
    startCamera,
    stopCamera,
  ]);

  const eventName = title.trim() || 'Drop';
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
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      initialDetent="full"
      peekRatio={1}
      zIndex={90}
      ariaLabelledBy={titleId}
      backdropLabel="Close door"
      panelStyle={panelStyle}
      panelClassName="scarce-commerce-sheet-panel ticket-door-sheet-panel"
      bodyClassName="scarce-commerce-sheet-body ticket-door-sheet-body"
      header={
        <>
          <GestureSheetHeader
            titleId={titleId}
            verb="Door"
            personName={eventName}
            signal="reputation"
            onClose={requestClose}
            closeAriaLabel="Close door"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
      footer={
        <CommerceSheetFooter
          formId={formId}
          keyboardOpen={keyboardOpen}
          state={footerState}
        />
      }
    >
      <div className="ticket-door">
        <p className="ticket-door-lead">
          Scan a Show pass QR, or paste the pass code, then admit.
        </p>

        <div
          className={`ticket-door-camera${cameraActive ? ' is-live' : ''}`}
        >
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
    </GlassSheet>
  );
}
