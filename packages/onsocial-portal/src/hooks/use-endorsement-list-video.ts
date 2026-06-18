'use client';

import { useEffect, useRef } from 'react';

export type EndorsementVideoPlaybackMode =
  | 'list'
  | 'detail-muted'
  | 'detail-unmuted'
  | null;

export type EndorsementVideoDetailOptions = {
  initialTime?: number;
  resume?: boolean;
};

let activeEndorsementVideo: HTMLVideoElement | null = null;

function claimActiveVideo(video: HTMLVideoElement) {
  if (
    activeEndorsementVideo &&
    activeEndorsementVideo !== video &&
    !activeEndorsementVideo.paused
  ) {
    activeEndorsementVideo.pause();
  }
  activeEndorsementVideo = video;
}

function releaseActiveVideo(video: HTMLVideoElement) {
  if (activeEndorsementVideo === video) {
    activeEndorsementVideo = null;
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
  initialTime: number,
  resume: boolean
) {
  applyInitialTime(video, initialTime);
  video.muted = muted;
  video.loop = false;
  if (!resume) return;
  claimActiveVideo(video);
  void video.play().catch(() => {});
}

/** Unmuted play — call synchronously from a video click gesture. */
export function playEndorsementFocusVideo() {
  const video = document.querySelector(
    '[data-endorsement-focus-video]'
  ) as HTMLVideoElement | null;
  if (!video) return;
  video.muted = false;
  video.loop = false;
  claimActiveVideo(video);
  void video.play().catch(() => {});
}

/** List: muted autoplay one-at-a-time. Detail: muted or unmuted with controls. */
export function useEndorsementVideoPlayback(
  mode: EndorsementVideoPlaybackMode,
  detailOptions: EndorsementVideoDetailOptions = {}
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const enabled = mode !== null;
  const initialTime = detailOptions.initialTime ?? 0;
  const resume = detailOptions.resume ?? false;

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;

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
  }, [enabled, mode]);

  useEffect(() => {
    if (mode !== 'list') return;
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current;
        if (!video) return;
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
    const begin = () =>
      startDetailPlayback(video, muted, initialTime, resume || !muted);

    if (video.readyState >= 1) {
      begin();
      return;
    }

    video.addEventListener('loadedmetadata', begin, { once: true });
    return () => video.removeEventListener('loadedmetadata', begin);
  }, [mode, initialTime, resume]);

  return { containerRef, videoRef };
}

/** @deprecated Use useEndorsementVideoPlayback */
export function useEndorsementListVideo(enabled: boolean) {
  return useEndorsementVideoPlayback(enabled ? 'list' : null);
}
