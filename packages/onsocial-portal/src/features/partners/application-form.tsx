'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Coins, Shield, X } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { Button } from '@/components/ui/button';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  AUDIENCE_BANDS,
  PARTNER_AUDIENCE_BAND_BUDGETS,
  PARTNER_PER_USER_TERMS,
} from '@/features/partners/constants';
import { portalColors, portalFrameStyle } from '@/lib/portal-colors';
import type { ApplicationFormData } from '@/features/partners/types';

const TELEGRAM_HANDLE_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const MAX_WEBSITE_URL_LEN = 255;
const PROJECT_NAME_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9 &.,'()/-]{0,98}[A-Za-z0-9])?$/;
const DESCRIPTION_ALLOWED_PATTERN = /^[A-Za-z0-9 .,'"!?:;()&/\-\n]+$/;

function normalizeProjectName(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeDescription(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getProjectNameError(value: string) {
  const normalized = normalizeProjectName(value);
  if (!normalized) {
    return '';
  }
  if (!PROJECT_NAME_PATTERN.test(normalized)) {
    return 'Use letters, numbers, spaces, and simple punctuation only';
  }
  return '';
}

function getDescriptionError(value: string) {
  const normalized = normalizeDescription(value);
  if (!normalized) {
    return '';
  }
  if (!DESCRIPTION_ALLOWED_PATTERN.test(normalized)) {
    return 'Use letters, numbers, spaces, and basic punctuation only';
  }
  return '';
}

function hasPublicWebsiteHostname(hostname: string) {
  if (!hostname || hostname.startsWith('.') || hostname.endsWith('.')) {
    return false;
  }

  const labels = hostname.split('.');
  return labels.length >= 2 && labels.every((label) => label.length > 0);
}

function normalizeWebsiteInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const withProtocol = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  if (withProtocol.length > MAX_WEBSITE_URL_LEN) {
    throw new Error(
      `Website must be ${MAX_WEBSITE_URL_LEN} characters or fewer`
    );
  }

  const url = new URL(withProtocol);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Website must be a valid http or https URL');
  }

  if (!hasPublicWebsiteHostname(url.hostname.toLowerCase())) {
    throw new Error('Website must include a domain like example.com');
  }

  if (url.toString().length > MAX_WEBSITE_URL_LEN) {
    throw new Error(
      `Website must be ${MAX_WEBSITE_URL_LEN} characters or fewer`
    );
  }

  return url.toString();
}

function normalizeWebsiteForDisplay(value: string) {
  return normalizeWebsiteInput(value)
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

function stripWebsiteProtocol(value: string) {
  return value.trimStart().replace(/^https?:\/\//i, '');
}

function normalizeHandleInput(value: string, kind: 'telegram' | 'x'): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  let candidate = trimmed;

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('/')) {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const allowedHosts =
      kind === 'telegram' ? ['t.me', 'telegram.me'] : ['x.com', 'twitter.com'];

    if (!allowedHosts.includes(hostname)) {
      throw new Error(
        kind === 'telegram'
          ? 'Telegram must be a handle or t.me link'
          : 'X must be a handle or x.com link'
      );
    }

    const [handle, ...rest] = url.pathname.split('/').filter(Boolean);
    if (!handle || rest.length > 0) {
      throw new Error(
        kind === 'telegram'
          ? 'Telegram must point to a single username'
          : 'X must point to a single username'
      );
    }

    candidate = handle;
  }

  candidate = candidate.replace(/^@/, '');

  const pattern =
    kind === 'telegram' ? TELEGRAM_HANDLE_PATTERN : X_HANDLE_PATTERN;
  if (!pattern.test(candidate)) {
    throw new Error(
      kind === 'telegram'
        ? 'Telegram must be a valid username or t.me link'
        : 'X must be a valid handle or x.com link'
    );
  }

  return `@${candidate}`;
}

function buildPublicHandleUrl(value: string, kind: 'telegram' | 'x'): string {
  const normalizedHandle = normalizeHandleInput(value, kind).replace(/^@/, '');
  return kind === 'telegram'
    ? `https://t.me/${normalizedHandle}`
    : `https://x.com/${normalizedHandle}`;
}

function normalizeHandleForDisplay(
  value: string,
  kind: 'telegram' | 'x'
): string {
  return normalizeHandleInput(value, kind).replace(/^@/, '');
}

function getFieldError(value: string, kind: 'website' | 'telegram' | 'x') {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    if (kind === 'website') {
      normalizeWebsiteInput(trimmed);
    } else {
      normalizeHandleInput(trimmed, kind);
    }
    return '';
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid value';
  }
}

export function ApplicationForm({
  onSubmit,
}: {
  onSubmit: (_data: ApplicationFormData) => Promise<void>;
}) {
  const { accountId, connect } = useWallet();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [audienceBand, setAudienceBand] =
    useState<(typeof AUDIENCE_BANDS)[number]>('1k-10k');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [telegramHandle, setTelegramHandle] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [showLabelFeedback, setShowLabelFeedback] = useState(false);
  const [showDescriptionFeedback, setShowDescriptionFeedback] = useState(false);
  const [showWebsiteFeedback, setShowWebsiteFeedback] = useState(false);
  const [showTelegramFeedback, setShowTelegramFeedback] = useState(false);
  const [showXFeedback, setShowXFeedback] = useState(false);
  const [audienceMenuOpen, setAudienceMenuOpen] = useState(false);
  const [audienceActiveIndex, setAudienceActiveIndex] = useState(
    AUDIENCE_BANDS.indexOf('1k-10k')
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const audienceMenuRef = useRef<HTMLDivElement | null>(null);
  const audienceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const audienceOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const toSlug = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

  const appId = toSlug(label);
  const MAX_LABEL_LEN = 100;
  const MAX_APP_ID_LEN = 64;
  const MIN_DESCRIPTION_LEN = 20;
  const MAX_DESCRIPTION_LEN = 280;
  const DESCRIPTION_WARNING_THRESHOLD = 240;
  const normalizedLabel = normalizeProjectName(label);
  const normalizedDescription = normalizeDescription(description);
  const projectNameError = getProjectNameError(label);
  const descriptionTextError = getDescriptionError(description);
  const descriptionLength = normalizedDescription.length;
  const hasDescription = normalizedDescription.length > 0;
  const descriptionTooShort =
    hasDescription && descriptionLength < MIN_DESCRIPTION_LEN;
  const hasAnyPublicLinkInput = Boolean(
    websiteUrl.trim() || telegramHandle.trim() || xHandle.trim()
  );
  const websiteHasInput = Boolean(websiteUrl.trim());
  const websitePreviewValue = websiteHasInput
    ? `https://${stripWebsiteProtocol(websiteUrl).trim()}`
    : '';
  const websitePublicUrl = websiteUrl.trim()
    ? (() => {
        try {
          return normalizeWebsiteInput(websiteUrl);
        } catch {
          return '';
        }
      })()
    : '';
  const websiteError = getFieldError(websiteUrl, 'website');
  const websiteValid = Boolean(websitePublicUrl) && !websiteError;
  const websiteFeedbackVisible = websiteHasInput && showWebsiteFeedback;
  const hasAnyValidPublicLink = websiteValid;
  const selectedAudienceIndex = AUDIENCE_BANDS.indexOf(audienceBand);
  const telegramHasInput = Boolean(telegramHandle.trim());
  const telegramPreviewValue = telegramHasInput
    ? `https://t.me/${telegramHandle.trim().replace(/^@/, '')}`
    : '';
  const telegramPublicUrl = telegramHandle.trim()
    ? (() => {
        try {
          return buildPublicHandleUrl(telegramHandle, 'telegram');
        } catch {
          return '';
        }
      })()
    : '';
  const telegramError = getFieldError(telegramHandle, 'telegram');
  const telegramValid = Boolean(telegramPublicUrl) && !telegramError;
  const telegramFeedbackVisible = telegramHasInput && showTelegramFeedback;
  const xHasInput = Boolean(xHandle.trim());
  const xPreviewValue = xHasInput
    ? `https://x.com/${xHandle.trim().replace(/^@/, '')}`
    : '';
  const xPublicUrl = xHandle.trim()
    ? (() => {
        try {
          return buildPublicHandleUrl(xHandle, 'x');
        } catch {
          return '';
        }
      })()
    : '';
  const xError = getFieldError(xHandle, 'x');
  const xValid = Boolean(xPublicUrl) && !xError;
  const xFeedbackVisible = xHasInput && showXFeedback;
  const publicLinkRequirementMet =
    hasAnyValidPublicLink || telegramValid || xValid;
  const labelReady =
    Boolean(normalizedLabel) &&
    !projectNameError &&
    appId.length >= 3 &&
    appId.length <= MAX_APP_ID_LEN;
  const showLabelSuccess = showLabelFeedback && labelReady;
  const descriptionReady =
    !descriptionTextError &&
    descriptionLength >= MIN_DESCRIPTION_LEN &&
    descriptionLength <= MAX_DESCRIPTION_LEN;
  const showDescriptionWarning =
    showDescriptionFeedback && hasDescription && descriptionTooShort;
  const showDescriptionSuccess = showDescriptionFeedback && descriptionReady;
  const showMissingPublicLinkHint =
    !publicLinkRequirementMet &&
    (hasAnyPublicLinkInput || (labelReady && descriptionReady));

  const openAudienceMenu = (index = selectedAudienceIndex) => {
    setAudienceActiveIndex(index >= 0 ? index : 0);
    setAudienceMenuOpen(true);
  };

  const closeAudienceMenu = () => {
    setAudienceMenuOpen(false);
    audienceTriggerRef.current?.focus();
  };

  const selectAudienceBandAtIndex = (index: number) => {
    const nextBand = AUDIENCE_BANDS[index];
    if (!nextBand) {
      return;
    }

    setAudienceBand(nextBand);
    setAudienceActiveIndex(index);
    closeAudienceMenu();
  };

  useEffect(() => {
    if (!audienceMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!audienceMenuRef.current?.contains(event.target as Node)) {
        setAudienceMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAudienceMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [audienceMenuOpen]);

  useEffect(() => {
    if (!audienceMenuOpen) {
      return;
    }

    const current = audienceOptionRefs.current[audienceActiveIndex];
    if (!current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      current.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [audienceActiveIndex, audienceMenuOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setShowLabelFeedback(true);
    setShowDescriptionFeedback(true);
    setShowWebsiteFeedback(websiteHasInput);
    setShowTelegramFeedback(telegramHasInput);
    setShowXFeedback(xHasInput);

    if (!normalizedLabel) {
      setError('Project name is required');
      return;
    }
    if (normalizedLabel.length > MAX_LABEL_LEN) {
      setError(`Project name too long (max ${MAX_LABEL_LEN} characters)`);
      return;
    }
    if (projectNameError) {
      setError(projectNameError);
      return;
    }
    if (appId.length < 3) {
      setError('Project name is too short');
      return;
    }
    if (appId.length > MAX_APP_ID_LEN) {
      setError(
        `App ID too long (max ${MAX_APP_ID_LEN} characters) — try a shorter name`
      );
      return;
    }
    if (!accountId) {
      setError('Wallet not connected');
      return;
    }
    if (!normalizedDescription) {
      setError('Add a short project overview');
      return;
    }
    if (descriptionTextError) {
      setError(descriptionTextError);
      return;
    }
    if (descriptionLength < MIN_DESCRIPTION_LEN) {
      setError(
        `Description is too short (min ${MIN_DESCRIPTION_LEN} characters)`
      );
      return;
    }
    if (descriptionLength > MAX_DESCRIPTION_LEN) {
      setError(
        `Description is too long (max ${MAX_DESCRIPTION_LEN} characters)`
      );
      return;
    }
    if (!AUDIENCE_BANDS.includes(audienceBand)) {
      setError('Choose an audience band');
      return;
    }
    if (!websiteUrl.trim() && !telegramHandle.trim() && !xHandle.trim()) {
      setError('Provide at least one public channel: Website, Telegram, or X');
      return;
    }

    setSubmitting(true);
    try {
      const normalizedWebsiteUrl = websiteUrl.trim()
        ? normalizeWebsiteInput(websiteUrl)
        : '';
      const normalizedTelegramHandle = telegramHandle.trim()
        ? normalizeHandleInput(telegramHandle, 'telegram')
        : '';
      const normalizedXHandle = xHandle.trim()
        ? normalizeHandleInput(xHandle, 'x')
        : '';

      setWebsiteUrl(normalizeWebsiteForDisplay(normalizedWebsiteUrl));
      setTelegramHandle(normalizedTelegramHandle.replace(/^@/, ''));
      setXHandle(normalizedXHandle.replace(/^@/, ''));
      setLabel(normalizedLabel);
      setDescription(normalizedDescription);

      await onSubmit({
        appId,
        label: normalizedLabel,
        description: normalizedDescription,
        audienceBand,
        websiteUrl: normalizedWebsiteUrl,
        telegramHandle: normalizedTelegramHandle,
        xHandle: normalizedXHandle,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Application failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!accountId) {
    return (
      <div className="text-center py-12">
        <Shield className="mx-auto mb-4 h-16 w-16 text-muted-foreground/40" />
        <h3 className="mb-2 text-xl font-semibold tracking-[-0.02em]">
          Connect Your Wallet
        </h3>
        <p className="mb-6 text-muted-foreground">
          Sign in with your NEAR wallet to start your partner application.
        </p>
        <Button
          onClick={() => connect()}
          size="lg"
          className="font-semibold px-8"
        >
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6">
      <div className="mb-4 flex items-center">
        <p className="inline-flex items-center gap-2.5 text-xs text-muted-foreground">
          <span
            className="h-px w-4 rounded-full bg-border/70"
            aria-hidden="true"
          />
          <span>Signed in as</span>
          <span
            className="font-mono font-medium"
            style={{ color: portalColors.slate }}
          >
            {accountId}
          </span>
        </p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Project Name
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setShowLabelFeedback(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          onBlur={() => setShowLabelFeedback(true)}
          placeholder="My Community"
          maxLength={MAX_LABEL_LEN}
          className="portal-blue-focus w-full rounded-2xl border border-border/60 bg-muted/20 px-4 py-3.5 text-sm outline-none"
          required
        />
        {showLabelFeedback && label.trim() && projectNameError && (
          <p className="mt-2 text-xs text-amber-600">{projectNameError}</p>
        )}
        {appId && (
          <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            {showLabelSuccess && (
              <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                <Check className="h-3 w-3" />
              </span>
            )}
            <p>
              App ID:{' '}
              <span className="font-mono text-foreground/85">{appId}</span>
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Description
        </label>
        <div className="mb-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>A short overview of your community and what you are building.</p>
          <span
            className={
              descriptionLength >= DESCRIPTION_WARNING_THRESHOLD
                ? 'text-amber-600'
                : undefined
            }
          >
            {descriptionLength}/{MAX_DESCRIPTION_LEN}
          </span>
        </div>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setShowDescriptionFeedback(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          onBlur={() => setShowDescriptionFeedback(true)}
          placeholder="A few lines about your community, your project, or the kind of value you create."
          rows={3}
          maxLength={MAX_DESCRIPTION_LEN}
          className="portal-blue-focus w-full resize-none rounded-2xl border border-border/60 bg-muted/20 px-4 py-3.5 text-sm outline-none"
        />
        {showDescriptionSuccess ? (
          <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
              <Check className="h-3 w-3" />
            </span>
            <p>Thanks, that helps.</p>
          </div>
        ) : showDescriptionFeedback &&
          hasDescription &&
          descriptionTextError ? (
          <p className="mt-2 text-xs text-amber-600">{descriptionTextError}</p>
        ) : (
          !descriptionReady && (
            <p
              className={`mt-2 text-xs ${
                showDescriptionWarning
                  ? 'text-amber-600'
                  : 'text-muted-foreground'
              }`}
            >
              {!hasDescription
                ? `Min ${MIN_DESCRIPTION_LEN} characters.`
                : showDescriptionWarning
                  ? `Add at least ${MIN_DESCRIPTION_LEN} characters to continue.`
                  : null}
            </p>
          )
        )}
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Audience Band
        </label>
        <p className="mb-2 text-xs text-muted-foreground">
          Pick the closest size for your active community. This sets your
          starting app budget.
        </p>
        <div className="relative" ref={audienceMenuRef}>
          <button
            ref={audienceTriggerRef}
            type="button"
            onClick={() => setAudienceMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                openAudienceMenu(
                  Math.min(selectedAudienceIndex + 1, AUDIENCE_BANDS.length - 1)
                );
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                openAudienceMenu(Math.max(selectedAudienceIndex - 1, 0));
              } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openAudienceMenu(selectedAudienceIndex);
              }
            }}
            aria-haspopup="listbox"
            aria-expanded={audienceMenuOpen}
            className="portal-blue-focus flex w-full items-center justify-between rounded-2xl border border-border/60 bg-muted/20 px-4 py-3.5 text-left text-sm outline-none"
          >
            <span>{audienceBand}</span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                audienceMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {audienceMenuOpen && (
            <div
              role="listbox"
              aria-label="Audience band"
              aria-activedescendant={`audience-band-option-${audienceActiveIndex}`}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setAudienceActiveIndex((current) =>
                    Math.min(current + 1, AUDIENCE_BANDS.length - 1)
                  );
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setAudienceActiveIndex((current) => Math.max(current - 1, 0));
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  setAudienceActiveIndex(0);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  setAudienceActiveIndex(AUDIENCE_BANDS.length - 1);
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectAudienceBandAtIndex(audienceActiveIndex);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  closeAudienceMenu();
                } else if (event.key === 'Tab') {
                  setAudienceMenuOpen(false);
                }
              }}
              className="absolute left-0 right-0 z-20 mt-2 rounded-2xl border border-border/50 bg-background/95 p-1 shadow-[0_14px_36px_rgba(0,0,0,0.12)] backdrop-blur"
            >
              {AUDIENCE_BANDS.map((band, index) => {
                const selected = band === audienceBand;
                const active = index === audienceActiveIndex;

                return (
                  <button
                    ref={(element) => {
                      audienceOptionRefs.current[index] = element;
                    }}
                    key={band}
                    id={`audience-band-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={active ? 0 : -1}
                    onClick={() => selectAudienceBandAtIndex(index)}
                    onMouseEnter={() => setAudienceActiveIndex(index)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                      selected
                        ? 'portal-blue-surface text-foreground'
                        : active
                          ? 'bg-muted/40 text-foreground'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    } rounded-xl outline-none focus-visible:bg-muted/40 focus-visible:text-foreground`}
                  >
                    <span>{band}</span>
                    <span className="flex h-4 w-4 items-center justify-center">
                      {selected && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Website
          </label>
          <div className="flex items-center rounded-2xl border border-border/60 bg-muted/20">
            <span className="border-r border-border/60 px-3 text-sm text-muted-foreground">
              https://
            </span>
            <input
              type="text"
              value={websiteUrl}
              onChange={(e) => {
                setWebsiteUrl(stripWebsiteProtocol(e.target.value));
                setShowWebsiteFeedback(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              inputMode="url"
              onBlur={() => {
                setShowWebsiteFeedback(Boolean(websiteUrl.trim()));
                if (!websiteUrl.trim()) {
                  return;
                }
                try {
                  setWebsiteUrl(normalizeWebsiteForDisplay(websiteUrl));
                } catch {
                  // Leave as-is; submit validation will show the error.
                }
              }}
              placeholder="example.com"
              className="portal-blue-focus w-full rounded-r-2xl bg-transparent px-4 py-3.5 text-sm outline-none"
            />
          </div>
          {websiteFeedbackVisible && (
            <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              {websiteValid ? (
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                  <Check className="h-3 w-3" />
                </span>
              ) : (
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                  <X className="h-3 w-3" />
                </span>
              )}
              {websiteValid ? (
                <a
                  href={websitePublicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 break-all portal-link"
                >
                  {websitePublicUrl}
                </a>
              ) : (
                <span className="min-w-0 break-all">{websitePreviewValue}</span>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Telegram
          </label>
          <div className="flex items-center rounded-2xl border border-border/60 bg-muted/20">
            <span className="border-r border-border/60 px-3 text-sm text-muted-foreground">
              t.me/
            </span>
            <input
              type="text"
              value={telegramHandle}
              onChange={(e) => {
                setTelegramHandle(e.target.value);
                setShowTelegramFeedback(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => {
                setShowTelegramFeedback(Boolean(telegramHandle.trim()));
                if (!telegramHandle.trim()) {
                  return;
                }
                try {
                  setTelegramHandle(
                    normalizeHandleForDisplay(telegramHandle, 'telegram')
                  );
                } catch {
                  // Leave as-is; submit validation will show the error.
                }
              }}
              placeholder="handle"
              className="portal-blue-focus w-full rounded-r-2xl bg-transparent px-4 py-3.5 text-sm outline-none"
            />
          </div>
          {telegramFeedbackVisible && (
            <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              {telegramValid ? (
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                  <Check className="h-3 w-3" />
                </span>
              ) : (
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                  <X className="h-3 w-3" />
                </span>
              )}
              {telegramValid ? (
                <a
                  href={telegramPublicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 break-all portal-link"
                >
                  {telegramPublicUrl}
                </a>
              ) : (
                <span className="min-w-0 break-all">
                  {telegramPreviewValue}
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            X
          </label>
          <div className="flex items-center rounded-2xl border border-border/60 bg-muted/20">
            <span className="border-r border-border/60 px-3 text-sm text-muted-foreground">
              x.com/
            </span>
            <input
              type="text"
              value={xHandle}
              onChange={(e) => {
                setXHandle(e.target.value);
                setShowXFeedback(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onBlur={() => {
                setShowXFeedback(Boolean(xHandle.trim()));
                if (!xHandle.trim()) {
                  return;
                }
                try {
                  setXHandle(normalizeHandleForDisplay(xHandle, 'x'));
                } catch {
                  // Leave as-is; submit validation will show the error.
                }
              }}
              placeholder="handle"
              className="portal-blue-focus w-full rounded-r-2xl bg-transparent px-4 py-3.5 text-sm outline-none"
            />
          </div>
          {xFeedbackVisible && (
            <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              {xValid ? (
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                  <Check className="h-3 w-3" />
                </span>
              ) : (
                <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                  <X className="h-3 w-3" />
                </span>
              )}
              {xValid ? (
                <a
                  href={xPublicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 break-all portal-link"
                >
                  {xPublicUrl}
                </a>
              ) : (
                <span className="min-w-0 break-all">{xPreviewValue}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {showMissingPublicLinkHint && (
        <p className="-mt-2 text-xs text-amber-600">
          At least one public link helps people recognize your community.
        </p>
      )}

      <div className="relative overflow-hidden rounded-[1.5rem] border border-border/50 bg-background/40 p-4 md:p-5">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-45 blur-2xl"
          style={{
            background: `radial-gradient(circle at 16% 18%, ${portalColors.blue}, transparent 38%)`,
          }}
        />

        <div className="relative z-10">
          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
              style={portalFrameStyle('blue')}
            >
              <Coins
                className="h-4.5 w-4.5"
                style={{ color: portalColors.blue }}
              />
            </span>
            <div>
              <h3 className="text-sm font-semibold tracking-[-0.02em]">
                Starting Terms
              </h3>
              <p className="mt-1 max-w-[32rem] text-xs text-muted-foreground">
                Base reward limits stay consistent. Community size only changes
                the app budget.
              </p>
            </div>
          </div>

          <dl className="mt-5 grid divide-y divide-border/30 text-sm md:grid-cols-2 md:divide-y-0 md:gap-y-5">
            <div className="py-4 md:py-0 md:pr-6">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Per Action
              </dt>
              <dd className="mt-2 text-[1.125rem] font-semibold tracking-[-0.03em] text-foreground">
                {PARTNER_PER_USER_TERMS.rewardPerAction} SOCIAL
              </dd>
            </div>
            <div className="py-4 md:py-0 md:pl-6">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Per Person / Day
              </dt>
              <dd className="mt-2 text-[1.125rem] font-semibold tracking-[-0.03em] text-foreground">
                {PARTNER_PER_USER_TERMS.dailyCap} SOCIAL
              </dd>
            </div>
            <div className="py-4 md:py-0 md:pr-6">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Total Budget
              </dt>
              <dd className="mt-2 text-[1.125rem] font-semibold tracking-[-0.03em] text-foreground">
                {Number(
                  PARTNER_AUDIENCE_BAND_BUDGETS[audienceBand].totalBudget
                ).toLocaleString()}{' '}
                SOCIAL
              </dd>
            </div>
            <div className="py-4 md:py-0 md:pl-6">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Daily Budget
              </dt>
              <dd className="mt-2 text-[1.125rem] font-semibold tracking-[-0.03em] text-foreground">
                {Number(
                  PARTNER_AUDIENCE_BAND_BUDGETS[audienceBand].dailyBudget
                ).toLocaleString()}{' '}
                SOCIAL
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {error && (
        <div className="portal-red-panel portal-red-text rounded-2xl border px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={
          submitting ||
          !appId ||
          !label ||
          !description.trim() ||
          descriptionLength < MIN_DESCRIPTION_LEN ||
          !publicLinkRequirementMet
        }
        size="lg"
        className="w-full font-semibold disabled:opacity-50"
      >
        {submitting ? (
          <>
            <PulsingDots size="sm" className="mr-2" />
            Submitting…
          </>
        ) : (
          <>
            Continue To Draft
            <ArrowRight className="w-4 h-4 ml-2" />
          </>
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        The final DAO proposal opens in the next step. Reward rules are
        standardized and become public on-chain once executed.
      </p>
    </form>
  );
}
