'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { DropArtOverlay } from '@/features/scarces/drop-artwork-preview';
import {
  captureVideoElementFrame,
  defaultPosterSeekSeconds,
  formatMediaDuration,
  PosterFrameError,
} from '@/lib/post-media';

interface ScarceVideoFramePickerProps {
  videoUrl: string;
  fileName: string;
  /** Last scrub position when remounting after Cover mode switches. */
  initialSeek?: number | null;
  disabled?: boolean;
  onFrame: (file: File) => void;
  /** Fired when the user commits a scrub (and on the first auto-capture). */
  onSeekCommit?: (seek: number) => void;
  onError: (message: string) => void;
  onPendingChange?: (pending: boolean) => void;
}

interface FrameScrubberProps {
  seek: number;
  duration: number;
  max: number;
  progress: number;
  disabled: boolean;
  onScrub: (next: number) => void;
  onCommit: (target: EventTarget | null) => void;
}

function FrameScrubber({
  seek,
  duration,
  max,
  progress,
  disabled,
  onScrub,
  onCommit,
}: FrameScrubberProps) {
  return (
    <label
      className="scarce-frame-picker-scrub"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="scarce-frame-picker-time">
        {formatMediaDuration(seek)}
        {duration > 0 ? ` / ${formatMediaDuration(duration)}` : ''}
      </span>
      <span
        className="scarce-frame-picker-track"
        style={{ ['--scarce-frame-progress' as string]: String(progress) }}
      >
        <input
          type="range"
          min={0}
          max={max}
          step={0.05}
          value={Math.min(seek, max)}
          disabled={disabled}
          aria-label="Cover frame"
          onChange={(event) => onScrub(Number(event.target.value))}
          onPointerUp={(event) => onCommit(event.currentTarget)}
          onTouchEnd={(event) => onCommit(event.currentTarget)}
          onKeyUp={(event) => {
            if (
              event.key === 'ArrowLeft' ||
              event.key === 'ArrowRight' ||
              event.key === 'Home' ||
              event.key === 'End'
            ) {
              onCommit(event.currentTarget);
            }
          }}
        />
      </span>
    </label>
  );
}

function seekMedia(video: HTMLVideoElement, nextSeek: number): Promise<void> {
  const maxSeek = Math.max(
    0,
    (Number.isFinite(video.duration) ? video.duration : 0) - 0.05
  );
  const target = Math.min(Math.max(0, nextSeek), maxSeek);
  if (Math.abs(video.currentTime - target) < 0.01) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      reject(new PosterFrameError());
    }, 8_000);
    const onSeeked = () => {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    try {
      video.currentTime = target;
    } catch {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      reject(new PosterFrameError());
    }
  });
}

function absoluteMediaUrl(videoUrl: string): string {
  try {
    return new URL(videoUrl, window.location.href).href;
  } catch {
    return videoUrl;
  }
}

/** Flip the media host after OsPageSheet actually mounts children. */
function OverlayHostProbe({
  onActiveChange,
}: {
  onActiveChange: (active: boolean) => void;
}) {
  useLayoutEffect(() => {
    onActiveChange(true);
    return () => onActiveChange(false);
  }, [onActiveChange]);
  return null;
}

/**
 * Frame cover picker — one `<video>`, sheet + OsPageSheet overlay.
 * Tap to enlarge for precise scrubbing; compact scrub stays on the sheet
 * for quick nudges. Overlay remounts the same media element and re-seeks.
 */
export function ScarceVideoFramePicker({
  videoUrl,
  fileName,
  initialSeek = null,
  disabled = false,
  onFrame,
  onSeekCommit,
  onError,
  onPendingChange,
}: ScarceVideoFramePickerProps) {
  const [duration, setDuration] = useState(0);
  const [seek, setSeek] = useState(0);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(false);
  const requestRef = useRef(0);
  const metaBoundRef = useRef(false);
  const boundUrlRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seekRef = useRef(0);
  const initialSeekRef = useRef(initialSeek);
  const onFrameRef = useRef(onFrame);
  const onSeekCommitRef = useRef(onSeekCommit);
  const onErrorRef = useRef(onError);
  const onPendingChangeRef = useRef(onPendingChange);
  onFrameRef.current = onFrame;
  onSeekCommitRef.current = onSeekCommit;
  onErrorRef.current = onError;
  onPendingChangeRef.current = onPendingChange;
  initialSeekRef.current = initialSeek;
  seekRef.current = seek;

  const videoHost = overlayMounted ? 'overlay' : 'sheet';
  const handleOverlayActive = useCallback((active: boolean) => {
    setOverlayMounted(active);
  }, []);

  // Sync the single media element when the URL changes or the host remounts.
  useLayoutEffect(() => {
    const node = videoRef.current;
    if (!node || !videoUrl) return;

    const urlChanged = boundUrlRef.current !== videoUrl;
    if (urlChanged) {
      boundUrlRef.current = videoUrl;
      metaBoundRef.current = false;
      setReady(false);
      setDuration(0);
      setSeek(0);
      seekRef.current = 0;
      requestRef.current += 1;
    }

    const onMeta = () => {
      if (metaBoundRef.current) {
        void seekMedia(node, seekRef.current).catch(() => undefined);
        return;
      }
      metaBoundRef.current = true;
      const seconds = Number.isFinite(node.duration) ? node.duration : 0;
      const maxSeek = Math.max(0, seconds - 0.05);
      const preferred = initialSeekRef.current;
      const initial =
        preferred != null && Number.isFinite(preferred)
          ? Math.min(Math.max(0, preferred), maxSeek)
          : defaultPosterSeekSeconds(seconds);
      setDuration(Math.max(0, seconds));
      setSeek(initial);
      seekRef.current = initial;
      setReady(true);
    };
    const onFail = () => {
      onErrorRef.current('Could not read that video — upload a photo instead.');
    };

    node.addEventListener('loadedmetadata', onMeta);
    node.addEventListener('error', onFail);

    const abs = absoluteMediaUrl(videoUrl);
    if (node.currentSrc !== abs && node.src !== abs) {
      node.src = videoUrl;
      node.load();
    } else if (node.readyState >= 1) {
      onMeta();
    }

    return () => {
      node.removeEventListener('loadedmetadata', onMeta);
      node.removeEventListener('error', onFail);
    };
  }, [videoUrl, videoHost]);

  function captureAt(nextSeek: number) {
    const video = videoRef.current;
    if (!video) return;
    const request = ++requestRef.current;
    setCapturing(true);
    onPendingChangeRef.current?.(true);
    void (async () => {
      try {
        await seekMedia(video, nextSeek);
        if (request !== requestRef.current) return;
        const frame = await captureVideoElementFrame(video, fileName);
        if (request !== requestRef.current) return;
        onSeekCommitRef.current?.(nextSeek);
        onFrameRef.current(frame);
      } catch {
        if (request !== requestRef.current) return;
        onErrorRef.current(
          'Could not read a frame here — upload a photo instead.'
        );
      } finally {
        if (request === requestRef.current) {
          setCapturing(false);
          onPendingChangeRef.current?.(false);
        }
      }
    })();
  }

  // First still once metadata is ready.
  useEffect(() => {
    if (!ready) return;
    captureAt(seekRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first ready only
  }, [ready, videoUrl, fileName]);

  function scrubLive(next: number) {
    setSeek(next);
    seekRef.current = next;
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = next;
    } catch {
      // Live scrub is best-effort; capture still waits for seeked.
    }
  }

  function commitFromControl(target: EventTarget | null) {
    if (!(target instanceof HTMLInputElement)) return;
    const next = Number(target.value);
    setSeek(next);
    seekRef.current = next;
    captureAt(next);
  }

  const max = Math.max(duration, 0.1);
  const progress = duration > 0 ? Math.min(1, seek / duration) : 0;
  const scrubDisabled = disabled || !ready || capturing;

  const videoEl = (
    <video
      ref={videoRef}
      className={
        videoHost === 'overlay'
          ? 'drop-art-overlay-asset scarce-frame-overlay-video'
          : 'scarce-post-preview-asset'
      }
      muted
      playsInline
      preload="metadata"
      crossOrigin="anonymous"
      aria-label="Cover frame"
    />
  );

  return (
    <div className="scarce-frame-picker">
      <button
        type="button"
        className="scarce-post-preview scarce-post-preview--cover scarce-frame-picker-stage"
        aria-label="Adjust cover frame"
        aria-haspopup="dialog"
        aria-expanded={zoomOpen}
        disabled={disabled || !ready}
        onClick={() => {
          if (disabled || !ready) return;
          setZoomOpen(true);
        }}
      >
        {videoHost === 'sheet' ? (
          videoEl
        ) : (
          <div className="scarce-frame-picker-stage-fill" aria-hidden />
        )}
        {!ready ? (
          <div className="scarce-frame-picker-loading" aria-live="polite">
            Loading clip…
          </div>
        ) : capturing && videoHost === 'sheet' ? (
          <div className="scarce-frame-picker-loading" aria-live="polite">
            Grabbing frame…
          </div>
        ) : null}
      </button>
      {ready && !zoomOpen && !overlayMounted ? (
        <FrameScrubber
          seek={seek}
          duration={duration}
          max={max}
          progress={progress}
          disabled={scrubDisabled}
          onScrub={scrubLive}
          onCommit={commitFromControl}
        />
      ) : null}

      <DropArtOverlay
        open={zoomOpen}
        label="Adjust cover frame"
        closeAriaLabel="Close frame picker"
        onClose={() => setZoomOpen(false)}
      >
        <OverlayHostProbe onActiveChange={handleOverlayActive} />
        <div className="scarce-frame-overlay-stage">
          {videoHost === 'overlay' ? videoEl : null}
          {capturing ? (
            <div className="scarce-frame-overlay-pending" aria-live="polite">
              Grabbing frame…
            </div>
          ) : null}
        </div>
        <div className="scarce-frame-overlay-dock">
          <FrameScrubber
            seek={seek}
            duration={duration}
            max={max}
            progress={progress}
            disabled={scrubDisabled}
            onScrub={scrubLive}
            onCommit={commitFromControl}
          />
        </div>
      </DropArtOverlay>
    </div>
  );
}
