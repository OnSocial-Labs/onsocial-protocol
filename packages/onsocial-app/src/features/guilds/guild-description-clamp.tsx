'use client';

import { useEffect, useRef, useState } from 'react';

export function GuildDescriptionClamp({ text }: { text: string }) {
  const measureRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    setNeedsClamp(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  if (!text.trim()) return null;

  if (!needsClamp) {
    return (
      <div className="guild-hero-description-wrap">
        <p
          ref={measureRef}
          aria-hidden
          className="guild-hero-description guild-hero-description--measure"
        >
          {text}
        </p>
        <p className="guild-hero-description">{text}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="guild-hero-description-toggle"
      aria-expanded={expanded}
      onClick={() => setExpanded((current) => !current)}
    >
      <p
        ref={measureRef}
        aria-hidden
        className="guild-hero-description guild-hero-description--measure"
      >
        {text}
      </p>
      <p
        className={`guild-hero-description${
          expanded ? '' : ' guild-hero-description--clamped'
        }`}
      >
        {text}
      </p>
      <span className="guild-hero-description-more">
        {expanded ? 'Show less' : 'More'}
      </span>
    </button>
  );
}
