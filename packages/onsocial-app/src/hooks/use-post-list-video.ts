'use client';

import { useEffect, useRef, useState } from 'react';

export type PostVideoPlaybackMode =
  | 'list'
  | 'poster'
  | 'detail-muted'
  | 'detail-unmuted'
  | null;

export type PostVideoDetailOptions = {
  initialTime?: number;
  resume?: boolean;
};

let activePostVideo: HTMLVideoElement | null = null;

function claimActiveVideo(video: HTMLVideoElement) {
  if (
    activePostVideo &&
    activePostVideo !== video &&
    !activePostVideo.paused
  ) {
    activePostVideo.pause();
  }
  activePostVideo = video;
}

function releaseActiveVideo(video: HTMLVideoElement) {
  if (activePostVideo === video) {
    activePostVideo = null;
  }
}

function tryPlayMuted(video: HTMLVideoElement) {
  video.muted = true;
  claimActiveVideo(video);
  void video.play().catch(() => {});
}

function applyInitialTime(video: HTMLVideoElement, initialTime: number) {
  if (initialTime <= 0) return;
  try {
    video.currentTime = initialTime;
  } catch {
    /* ignore seek errors while loading */
  }
}

function startDetailPlayback(
  video: HTMLVideoElement,
  muted: boolean,
  initialTime: number
) {
  applyInitialTime(video, initialTime);
  video.muted = muted;
  video.loop = true;
  claimActiveVideo(video);
  void video.play().catch(() => {});
}

/** Unmuted play — prefer `mediaIndex` tile; call from a user gesture when possible. */
export function playPostFocusVideo(mediaIndex = 0) {
  const indexed = document.querySelector(
    `[data-post-focus-video="${mediaIndex}"]`
  ) as HTMLVideoElement | null;
  const video =
    indexed ??
    (document.querySelector('[data-post-focus-video]') as HTMLVideoElement | null);
  if (!video) return;
  video.muted = false;
  video.loop = true;
  claimActiveVideo(video);
  void video.play().catch(() => {});
}

/**
 * List: muted autoplay one-at-a-time. Poster: static first frame, same
 * near/far gates as list but no playback management. Detail: muted or
 * unmuted, mute only.
 */
export function usePostVideoPlayback(
  mode: PostVideoPlaybackMode,
  detailOptions: PostVideoDetailOptions = {}
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const enabled = mode !== null && mode !== 'poster';
  // Poster videos never play — they only take the mount/preload gates.
  const gated = mode === 'list' || mode === 'poster';
  const initialTime = detailOptions.initialTime ?? 0;
  const resume = detailOptions.resume ?? false;
  const [nearViewport, setNearViewport] = useState(false);
  const [nearMount, setNearMount] = useState(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  // The element identity swaps on every far-off unmount/remount, so effects
  // bind to state, not a ref — ref reads stay valid between renders.
  const bindVideoEl = (node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoEl(node);
  };

  // List/poster videos fetch metadata only within two viewport heights of
  // the fold — an unbounded feed otherwise holds a decoder/fetch per video
  // ever loaded. The 200% margin settles collage ratios before they paint.
  useEffect(() => {
    if (mode !== 'list' && mode !== 'poster') return;
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(Boolean(entry?.isIntersecting)),
      { rootMargin: '200% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode]);

  // Further out the element itself unmounts, releasing the decoder and any
  // buffered data. The 300% margin leaves a full viewport between mounting
  // and the 200% preload gate, so scroll-back remounts are warm before
  // they could paint.
  useEffect(() => {
    if (mode !== 'list' && mode !== 'poster') return;
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNearMount(Boolean(entry?.isIntersecting)),
      { rootMargin: '300% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (!enabled || !videoEl) return;
    const video = videoEl;

    const onPlay = () => claimActiveVideo(video);
    const onPause = () => {
      if (video.paused) releaseActiveVideo(video);
    };
    const onEnded = () => releaseActiveVideo(video);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.pause();
      releaseActiveVideo(video);
    };
  }, [enabled, mode, videoEl]);

  useEffect(() => {
    if (mode !== 'list') return;
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (!video) return;
        if (video.closest('[data-feed-session="covered"]')) {
          video.pause();
          return;
        }
        const visibleEnough =
          Boolean(entry?.isIntersecting) && entry.intersectionRatio >= 0.5;
        if (visibleEnough) {
          tryPlayMuted(video);
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (mode !== 'detail-muted' && mode !== 'detail-unmuted') return;
    const video = videoRef.current;
    if (!video) return;

    const muted = mode === 'detail-muted';
    const begin = () => {
      if (video.closest('[data-feed-session="covered"]')) {
        video.pause();
        return;
      }
      startDetailPlayback(video, muted, initialTime);
    };

    if (video.readyState >= 1) {
      begin();
      return;
    }

    video.addEventListener('loadedmetadata', begin, { once: true });
    return () => video.removeEventListener('loadedmetadata', begin);
  }, [mode, initialTime, resume]);

  // Detail modes are on screen; compose previews need their first frame —
  // only list/poster videos defer.
  const videoPreload: 'metadata' | 'none' =
    gated && !nearViewport ? 'none' : 'metadata';

  // Far-off list/poster videos drop the element entirely; everything else
  // stays mounted. The ratio box is remembered, so the row height never
  // moves.
  const videoMounted = !gated || nearMount;

  return { containerRef, bindVideoEl, videoPreload, videoMounted };
}
