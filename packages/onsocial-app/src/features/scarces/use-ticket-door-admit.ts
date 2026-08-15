'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import {
  verifyTicketPassLiveCrypto,
  verifyTicketPassLiveOwnerKey,
} from '@/features/scarces/ticket-pass-live';
import {
  parseTicketPassPayload,
  ticketPassRemaining,
  type PassStaffVoice,
} from '@/features/scarces/ticket-pass-payload';
import {
  fetchTicketTokenStatus,
  type TicketTokenStatus,
} from '@/features/scarces/ticket-token-status';
import { accountIdsEqual } from '@/lib/account-match';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
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

export type TicketDoorAdmitOptions = {
  collectionId: string;
  /** When true, camera starts as soon as `active` is true. */
  active: boolean;
  /** After a successful admit — page stays open for the next guest. */
  onAdmitted?: (tokenId: string) => void;
  /** Sheet mode closes after admit; page mode resets for the next scan. */
  afterAdmit?: 'close' | 'ready-next';
  onRequestClose?: () => void;
  /** Coupon staff surface uses redeem toast + ready-next copy. */
  voice?: PassStaffVoice;
};

/**
 * Browser camera + QR lookup + on-chain admit for Door staff.
 * Shared by the drop sheet and the fullscreen Admit page.
 */
export function useTicketDoorAdmit({
  collectionId,
  active,
  onAdmitted,
  afterAdmit = 'ready-next',
  onRequestClose,
  voice = 'admit',
}: TicketDoorAdmitOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [lookupPending, setLookupPending] = useState(false);
  const [admitPending, setAdmitPending] = useState(false);
  const [status, setStatus] = useState<TicketTokenStatus | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lastAdmittedTokenId, setLastAdmittedTokenId] = useState<string | null>(
    null
  );
  /** Staff must confirm the holder before the wallet Admit / Redeem step. */
  const [admitConfirmed, setAdmitConfirmed] = useState(false);

  const { isConnected, getSigningWallet } = useAppWallet();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();

  const resetSession = useCallback(() => {
    setManualInput('');
    setScanHint(null);
    setCameraError(null);
    setStatus(null);
    setLookupError(null);
    setAdmitPending(false);
    setLookupPending(false);
    setAdmitConfirmed(false);
  }, []);

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

  const applyLookup = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed.startsWith('os2|')) {
        setStatus(null);
        setAdmitConfirmed(false);
        setLookupError('Ask the guest to open Show pass for a live door code.');
        return;
      }

      setLookupPending(true);
      setLookupError(null);
      try {
        const live = await verifyTicketPassLiveCrypto(trimmed, collectionId);
        if (!live.ok) {
          setStatus(null);
          setAdmitConfirmed(false);
          setLookupError(live.error);
          return;
        }

        const parsed = parseTicketPassPayload(trimmed, collectionId);
        if (!parsed) {
          setStatus(null);
          setAdmitConfirmed(false);
          setLookupError('That code is not for this drop.');
          return;
        }

        const next = await fetchTicketTokenStatus(parsed.tokenId);
        if (!next) {
          setStatus(null);
          setAdmitConfirmed(false);
          setLookupError('Pass not found.');
          return;
        }
        if (
          next.collectionId &&
          next.collectionId.trim() !== collectionId.trim()
        ) {
          setStatus(null);
          setAdmitConfirmed(false);
          setLookupError('That pass belongs to another drop.');
          return;
        }

        const keyOk = await verifyTicketPassLiveOwnerKey(
          next.ownerId,
          live.payload.publicKeyB64u
        );
        if (!keyOk) {
          setStatus(null);
          setAdmitConfirmed(false);
          setLookupError(
            'Pass signature does not match the ticket owner. Ask them to reopen Show pass.'
          );
          return;
        }

        setStatus(next);
        setAdmitConfirmed(false);
        setManualInput(trimmed);
        setScanHint(null);
        setLastAdmittedTokenId(null);
        stopCamera();
      } catch {
        setStatus(null);
        setAdmitConfirmed(false);
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
      setCameraError('Camera scan unavailable on this browser.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera unavailable on this device.');
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
      setCameraError('Camera blocked in this browser.');
    }
  }, [applyLookup, stopCamera]);

  useEffect(() => {
    if (!active) {
      stopCamera();
      return;
    }
    resetSession();
    void startCamera();
    return () => stopCamera();
  }, [active, resetSession, startCamera, stopCamera]);

  const canAdmit =
    status != null &&
    status.isValid &&
    !status.isFullyRedeemed &&
    !status.isRefunded &&
    !admitPending &&
    !lookupPending;

  const confirmAdmit = useCallback(() => {
    if (!canAdmit) return;
    setAdmitConfirmed(true);
  }, [canAdmit]);

  const clearAdmitConfirm = useCallback(() => {
    setAdmitConfirmed(false);
  }, []);

  const handleAdmit = useCallback(async () => {
    if (!status || !canAdmit || !admitConfirmed) return;
    const redeemVoice = voice === 'redeem';
    if (!isConnected) {
      setTxResult({
        type: 'error',
        msg: redeemVoice
          ? 'Connect your wallet to redeem.'
          : 'Connect your wallet to admit.',
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
        submittedMessage: redeemVoice
          ? txToastConfirming.redeemingCoupon
          : txToastConfirming.redeemingTicket,
        successMessage: redeemVoice
          ? txToastSuccess.couponRedeemed
          : txToastSuccess.ticketAdmitted,
        failureMessage: redeemVoice
          ? txToastError.redeemCouponFailed
          : txToastError.redeemTicketFailed,
      });
      if (confirmed) {
        onAdmitted?.(status.tokenId);
        setLastAdmittedTokenId(status.tokenId);
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
        setAdmitConfirmed(false);
        if (afterAdmit === 'close') {
          onRequestClose?.();
        } else {
          setScanHint(
            redeemVoice
              ? 'Redeemed. Ready for the next pass.'
              : 'Admitted. Ready for the next pass.'
          );
          setManualInput('');
          setStatus(null);
          void startCamera();
        }
      }
    } catch (error) {
      if (isWalletUserCancellation(error)) return;
      setTxResult({
        type: 'error',
        msg:
          error instanceof Error
            ? error.message
            : redeemVoice
              ? txToastError.redeemCouponFailed
              : txToastError.redeemTicketFailed,
      });
    } finally {
      setAdmitPending(false);
    }
  }, [
    admitConfirmed,
    afterAdmit,
    canAdmit,
    collectionId,
    getSigningWallet,
    isConnected,
    onAdmitted,
    onRequestClose,
    setTxResult,
    startCamera,
    status,
    trackTransaction,
    voice,
  ]);

  return {
    videoRef,
    manualInput,
    setManualInput,
    scanHint,
    cameraError,
    cameraActive,
    lookupPending,
    admitPending,
    status,
    lookupError,
    setLookupError,
    lastAdmittedTokenId,
    canAdmit,
    admitConfirmed,
    confirmAdmit,
    clearAdmitConfirm,
    applyLookup,
    startCamera,
    stopCamera,
    handleAdmit,
    resetSession,
    /** True when current owner differs from original minter. */
    passWasReceived:
      status != null && !accountIdsEqual(status.ownerId, status.minterId),
  };
}
