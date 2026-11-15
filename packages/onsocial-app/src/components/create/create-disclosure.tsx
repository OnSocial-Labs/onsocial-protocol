'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  type ReactNode,
  type RefObject,
} from 'react';
import { ChevronDownIcon, useOsReveal } from '@onsocial/ui';
import './create-disclosure.css';

/** Closed is 0. Open height is the measured section — shared create fold. */
export function useCreateReveal(open: boolean) {
  const { hostRef, clipRef, innerRef, measure } = useOsReveal<HTMLDivElement>();
  const measureClosed = useCallback(() => {
    measure({ closedPx: 0 });
  }, [measure]);

  useLayoutEffect(() => {
    measureClosed();
  }, [measureClosed, open]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureClosed());
    observer.observe(inner);
    return () => observer.disconnect();
  }, [innerRef, measureClosed]);

  return {
    hostRef,
    clipRef: clipRef as RefObject<HTMLDivElement | null>,
    innerRef: innerRef as RefObject<HTMLDivElement | null>,
  };
}

export type CreateRevealRefs = ReturnType<typeof useCreateReveal>;

/** Chevron disclosure — same motion language as New drop Description / More. */
export function CreateDisclosure({
  open,
  label,
  controlsId,
  disabled,
  className,
  onClick,
}: {
  open: boolean;
  label: string;
  controlsId: string;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`create-disclosure${open ? ' is-open' : ''}${
        className ? ` ${className}` : ''
      }`}
      disabled={disabled}
      aria-expanded={open}
      aria-controls={controlsId}
      onClick={onClick}
    >
      <span>{label}</span>
      <ChevronDownIcon className="create-disclosure-chevron" aria-hidden />
    </button>
  );
}

/** Measured fold body for a create disclosure. */
export function CreateRevealPanel({
  open,
  reveal,
  id,
  children,
  className,
}: {
  open: boolean;
  reveal: CreateRevealRefs;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      ref={reveal.hostRef}
      className={`create-reveal os-reveal${open ? ' is-open' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <div ref={reveal.clipRef} id={id} className="os-reveal-clip">
        <div
          ref={reveal.innerRef}
          className="os-reveal-inner create-reveal-body"
          inert={open ? undefined : true}
          aria-hidden={open ? undefined : true}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
