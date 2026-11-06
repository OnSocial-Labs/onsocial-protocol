'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ForwardedRef,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from 'react';
import {
  ipfsImgLoadState,
  nextIpfsImgLoadOnError,
  type IpfsImgLoadState,
} from './ipfs-img-variants.js';

function requestedSrcOf(
  src: ImgHTMLAttributes<HTMLImageElement>['src']
): string | undefined {
  return typeof src === 'string' ? src : undefined;
}

function requestedSrcSetOf(
  srcSet: ImgHTMLAttributes<HTMLImageElement>['srcSet']
): string | undefined {
  return typeof srcSet === 'string' ? srcSet : undefined;
}

function requestKey(
  src: string | undefined,
  srcSet: string | undefined
): string {
  return `${src ?? ''}\0${srcSet ?? ''}`;
}

function assignRef(
  ref: ForwardedRef<HTMLImageElement>,
  node: HTMLImageElement | null
) {
  if (typeof ref === 'function') ref(node);
  else if (ref) ref.current = node;
}

/** Failed loads with an empty src resolve to the document URL — ignore those. */
function failedImageUrl(img: HTMLImageElement): string {
  const current = img.currentSrc || img.src || '';
  if (!current || current === window.location.href) return '';
  return current;
}

/**
 * Image that may point at a CDN variant (`/img/<width>/ipfs/...`).
 *
 * On a variant load error, retries that URL once after a short delay, then
 * falls back to the original `/ipfs/<cid>` URL and drops srcSet. A later
 * error is reported to `onError` and does not start another attempt.
 * Non-variant images pass through and report the first error.
 */
export const IpfsImg = forwardRef<
  HTMLImageElement,
  ImgHTMLAttributes<HTMLImageElement>
>(function IpfsImg({ src, srcSet, onError, ...rest }, ref) {
  const requestedSrc = requestedSrcOf(src);
  const requestedSrcSet = requestedSrcSetOf(srcSet);
  const key = requestKey(requestedSrc, requestedSrcSet);
  const [seenKey, setSeenKey] = useState(key);
  const [state, setState] = useState<IpfsImgLoadState>(() =>
    ipfsImgLoadState(requestedSrc, requestedSrcSet)
  );

  if (key !== seenKey) {
    setSeenKey(key);
    setState(ipfsImgLoadState(requestedSrc, requestedSrcSet));
  }

  const stateRef = useRef(state);
  stateRef.current = state;
  const requestedSrcRef = useRef(requestedSrc);
  requestedSrcRef.current = requestedSrc;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (state.waitMs <= 0) return;
    const timer = window.setTimeout(() => {
      setState((current) =>
        current.waitMs > 0 ? { ...current, waitMs: 0 } : current
      );
    }, state.waitMs);
    return () => window.clearTimeout(timer);
  }, [state.waitMs, state.phase, state.src]);

  const nodeRef = useRef<HTMLImageElement | null>(null);
  const forwardedRef = useRef(ref);
  forwardedRef.current = ref;
  const setNode = useCallback((node: HTMLImageElement | null) => {
    nodeRef.current = node;
    assignRef(forwardedRef.current, node);
  }, []);

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    // A replaced element can still emit the error from the cleared src.
    if (event.currentTarget !== nodeRef.current) return;
    const current = stateRef.current;
    const next = nextIpfsImgLoadOnError(
      current,
      failedImageUrl(event.currentTarget),
      requestedSrcRef.current
    );
    if (next === current) return;
    stateRef.current = next;
    setState(next);
    if (next.phase === 'exhausted') onErrorRef.current?.(event);
  };

  const waiting = state.waitMs > 0;
  return (
    <img
      {...rest}
      key={`${state.phase}:${waiting ? 'wait' : 'go'}:${state.src}:${state.srcSet ?? ''}`}
      ref={setNode}
      src={waiting ? undefined : state.src || undefined}
      srcSet={waiting ? undefined : state.srcSet}
      onError={handleError}
    />
  );
});
