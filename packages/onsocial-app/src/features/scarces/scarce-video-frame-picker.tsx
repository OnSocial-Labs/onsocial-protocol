'use client';

import { useEffect, useRef, useState } from 'react';
import {
  captureVideoElementFrame,
  defaultPosterSeekSeconds,
  formatMediaDuration,
  PosterFrameError,
} from '@/lib/post-media';

interface ScarceVideoFramePickerProps {
  videoUrl: string;
  fileName: string;
  disabled?: boolean;
  onFrame: (file: File) => void;
  onError: (message: string) => void;
  onPendingChange?: (pending: boolean) => void;
}

/**
 * Frame cover picker that *is* the scarce preview. One on-screen `<video>`
 * both previews and supplies the JPEG — no second network load. Scrubber
 * stays visible under the cover; commit runs on pointer/touch release.
 */
export function ScarceVideoFramePicker({
  videoUrl,
  fileName,
  disabled = false,
  onFrame,
  onError,
  onPendingChange,
}: ScarceVideoFramePickerProps) {
  const [duration, setDuration] = useState(0);
  const [seek, setSeek] = useState(0);
  const [ready, setReady] = useState(false);
  const requestRef = useRef(0);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const onFrameRef = useRef(onFrame);
  const onErrorRef = useRef(onError);
  const onPendingChangeRef = useRef(onPendingChange);
  onFrameRef.current = onFrame;
  onErrorRef.current = onError;
  onPendingChangeRef.current = onPendingChange;

  useEffect(() => {
    const video = previewRef.current;
    if (!video) return;
    let cancelled = false;
    setReady(false);
    setDuration(0);
    setSeek(0);
    requestRef.current += 1;

    const onMeta = () => {
      if (cancelled) return;
      const seconds = Number.isFinite(video.duration) ? video.duration : 0;
      const initial = defaultPosterSeekSeconds(seconds);
      setDuration(Math.max(0, seconds));
      setSeek(initial);
      setReady(true);
    };
    const onFail = () => {
      if (cancelled) return;
      onErrorRef.current('Could not read that video — upload a photo instead.');
    };

    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onFail);
    video.src = videoUrl;
    video.load();

    return () => {
      cancelled = true;
      requestRef.current += 1;
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onFail);
      video.removeAttribute('src');
      video.load();
    };
  }, [videoUrl]);

  function seekVideo(nextSeek: number): Promise<void> {
    const video = previewRef.current;
    if (!video) return Promise.reject(new PosterFrameError());
    const max = Math.max(
      0,
      (Number.isFinite(video.duration) ? video.duration : 0) - 0.05
    );
    const target = Math.min(Math.max(0, nextSeek), max);
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

  function captureAt(nextSeek: number) {
    const video = previewRef.current;
    if (!video) return;
    const request = ++requestRef.current;
    onPendingChangeRef.current?.(true);
    void (async () => {
      try {
        await seekVideo(nextSeek);
        if (request !== requestRef.current) return;
        const frame = await captureVideoElementFrame(video, fileName);
        if (request !== requestRef.current) return;
        onFrameRef.current(frame);
      } catch {
        if (request !== requestRef.current) return;
        onErrorRef.current(
          'Could not read a frame here — upload a photo instead.'
        );
      } finally {
        if (request === requestRef.current) {
          onPendingChangeRef.current?.(false);
        }
      }
    })();
  }

  // First still once metadata is ready.
  useEffect(() => {
    if (!ready) return;
    captureAt(seek);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first ready only
  }, [ready, videoUrl, fileName]);

  function commitFromControl(target: EventTarget | null) {
    if (!(target instanceof HTMLInputElement)) return;
    const next = Number(target.value);
    setSeek(next);
    captureAt(next);
  }

  const max = Math.max(duration, 0.1);
  const progress = duration > 0 ? Math.min(1, seek / duration) : 0;

  return (
    <div className="scarce-frame-picker">
      <div className="scarce-post-preview scarce-post-preview--cover scarce-frame-picker-stage">
        <video
          ref={previewRef}
          className="scarce-post-preview-asset"
          muted
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          aria-label="Cover frame preview"
        />
        {!ready ? (
          <div className="scarce-frame-picker-loading" aria-live="polite">
            Loading clip…
          </div>
        ) : null}
      </div>
      {ready ? (
        <label className="scarce-frame-picker-scrub">
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
              disabled={disabled || !ready}
              aria-label="Cover frame"
              onChange={(event) => {
                const next = Number(event.target.value);
                setSeek(next);
                const video = previewRef.current;
                if (video) {
                  try {
                    video.currentTime = next;
                  } catch {
                    // Live scrub is best-effort; capture still waits for seeked.
                  }
                }
              }}
              onPointerUp={(event) => commitFromControl(event.currentTarget)}
              onTouchEnd={(event) => commitFromControl(event.currentTarget)}
              onKeyUp={(event) => {
                if (
                  event.key === 'ArrowLeft' ||
                  event.key === 'ArrowRight' ||
                  event.key === 'Home' ||
                  event.key === 'End'
                ) {
                  commitFromControl(event.currentTarget);
                }
              }}
            />
          </span>
        </label>
      ) : null}
    </div>
  );
}
