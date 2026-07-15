'use client';

import { useEffect, useRef } from 'react';

export type PostVideoPlaybackMode =
  | 'list'
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
  video.loop = false;
  claimActiveVideo(video);
  void video.play().catch(() => {});
}

/** List: muted autoplay one-at-a-time. Detail: muted or unmuted with controls. */
export function usePostVideoPlayback(
  mode: PostVideoPlaybackMode,
  detailOptions: PostVideoDetailOptions = {}
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
