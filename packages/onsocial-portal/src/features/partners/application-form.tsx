'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Shield, X } from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { Button, buttonArrowRightClass } from '@/components/ui/button';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  AUDIENCE_BANDS,
  PARTNER_AUDIENCE_BAND_BUDGETS,
  PARTNER_PER_USER_TERMS,
} from '@/features/partners/constants';
import {
  floatingPanelItemActiveClass,
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import { checkAppIdAvailability } from '@/features/partners/api';
import { useDropdown } from '@/hooks/use-dropdown';
import type {
  ApplicationFormData,
  ApplicationFormPrefill,
} from '@/features/partners/types';

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

  return candidate;
}

function buildPublicHandleUrl(value: string, kind: 'telegram' | 'x'): string {
  const normalizedHandle = normalizeHandleInput(value, kind);
  return kind === 'telegram'
    ? `https://t.me/${normalizedHandle}`
    : `https://x.com/${normalizedHandle}`;
}

function normalizeHandleForDisplay(
  value: string,
  kind: 'telegram' | 'x'
): string {
  return normalizeHandleInput(value, kind);
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
  initialValues,
  governanceThresholdDisplay,
}: {
  onSubmit: (_data: ApplicationFormData) => Promise<void>;
  initialValues?: ApplicationFormPrefill | null;
  governanceThresholdDisplay?: string;
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
  const [appIdAvailability, setAppIdAvailability] = useState<{
    state: 'idle' | 'checking' | 'available' | 'taken' | 'error';
    appId: string;
    message: string;
  }>({ state: 'idle', appId: '', message: '' });
  const [audienceActiveIndex, setAudienceActiveIndex] = useState(
    AUDIENCE_BANDS.indexOf('1k-10k')
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const audienceMenu = useDropdown();
  const audienceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const audienceOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setLabel(initialValues?.label ?? '');
    setDescription(initialValues?.description ?? '');
    setAudienceBand(
      AUDIENCE_BANDS.includes(
        (initialValues?.audienceBand ??
          '1k-10k') as (typeof AUDIENCE_BANDS)[number]
      )
        ? ((initialValues?.audienceBand ??
            '1k-10k') as (typeof AUDIENCE_BANDS)[number])
        : '1k-10k'
    );
    setWebsiteUrl(
      initialValues?.websiteUrl
        ? (() => {
            try {
              return normalizeWebsiteForDisplay(initialValues.websiteUrl);
            } catch {
              return stripWebsiteProtocol(initialValues.websiteUrl);
            }
          })()
        : ''
    );
    setTelegramHandle(
      initialValues?.telegramHandle
        ? (() => {
            try {
              return normalizeHandleForDisplay(
                initialValues.telegramHandle,
                'telegram'
              );
            } catch {
              return initialValues.telegramHandle.replace(/^@/, '');
            }
          })()
        : ''
    );
    setXHandle(
      initialValues?.xHandle
        ? (() => {
            try {
              return normalizeHandleForDisplay(initialValues.xHandle, 'x');
            } catch {
              return initialValues.xHandle.replace(/^@/, '');
            }
          })()
        : ''
    );
    setShowLabelFeedback(false);
    setShowDescriptionFeedback(false);
    setShowWebsiteFeedback(Boolean(initialValues?.websiteUrl));
    setShowTelegramFeedback(Boolean(initialValues?.telegramHandle));
    setShowXFeedback(Boolean(initialValues?.xHandle));
    setAppIdAvailability({ state: 'idle', appId: '', message: '' });
    audienceMenu.close();
    setAudienceActiveIndex(
      AUDIENCE_BANDS.indexOf(
        AUDIENCE_BANDS.includes(
          (initialValues?.audienceBand ??
            '1k-10k') as (typeof AUDIENCE_BANDS)[number]
        )
          ? ((initialValues?.audienceBand ??
              '1k-10k') as (typeof AUDIENCE_BANDS)[number])
          : '1k-10k'
      )
    );
    setSubmitting(false);
    setError('');
  }, [initialValues]);

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
  const hasAnyPublicLinkInput = Boolean(
    websiteUrl.trim() || telegramHandle.trim() || xHandle.trim()
  );
  const websiteHasInput = Boolean(websiteUrl.trim());
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
  const appIdAvailabilityMatches = appIdAvailability.appId === appId;
  const appIdChecking =
    labelReady &&
    appIdAvailabilityMatches &&
    appIdAvailability.state === 'checking';
  const appIdAvailable =
    labelReady &&
    appIdAvailabilityMatches &&
    appIdAvailability.state === 'available';
  const appIdTaken =
    labelReady &&
    appIdAvailabilityMatches &&
    appIdAvailability.state === 'taken';
  const appIdAvailabilityError =
    labelReady &&
    appIdAvailabilityMatches &&
    appIdAvailability.state === 'error';
  const appIdPending =
    labelReady &&
    (!appIdAvailabilityMatches || appIdAvailability.state === 'checking');
  const showLabelSuccess = showLabelFeedback && labelReady && appIdAvailable;
  const descriptionReady =
    !descriptionTextError &&
    descriptionLength >= MIN_DESCRIPTION_LEN &&
    descriptionLength <= MAX_DESCRIPTION_LEN;
  const showMissingPublicLinkHint =
    !publicLinkRequirementMet &&
    (hasAnyPublicLinkInput || (labelReady && descriptionReady));

  const commitLabelInput = () => {
    const committedLabel = normalizeProjectName(label);

    if (committedLabel !== label) {
      const nextAppId = toSlug(committedLabel);

      setLabel(committedLabel);

      if (nextAppId !== appId) {
        setAppIdAvailability({ state: 'idle', appId: '', message: '' });
      }
    }

    setShowLabelFeedback(true);
  };

  const openAudienceMenu = (index = selectedAudienceIndex) => {
    setAudienceActiveIndex(index >= 0 ? index : 0);
    audienceMenu.open();
  };

  const closeAudienceMenu = () => {
    audienceMenu.close();
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
    if (!audienceMenu.isOpen) {
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
  }, [audienceActiveIndex, audienceMenu.isOpen]);

  useEffect(() => {
    if (!labelReady || !accountId) {
      setAppIdAvailability({ state: 'idle', appId: '', message: '' });
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setAppIdAvailability({
        state: 'checking',
        appId,
        message: 'Checking On-chain ID...',
      });

      checkAppIdAvailability(appId, accountId)
        .then((result) => {
          if (cancelled) {
            return;
          }

          setAppIdAvailability({
            state: result.available ? 'available' : 'taken',
            appId,
            message: result.available
              ? 'On-chain ID available'
              : 'On-chain ID already in use',
          });
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setAppIdAvailability({
            state: 'error',
            appId,
            message: 'Could not verify On-chain ID right now',
          });
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [accountId, appId, labelReady]);

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
    try {
      const availability = await checkAppIdAvailability(appId, accountId);
      setAppIdAvailability({
        state: availability.available ? 'available' : 'taken',
        appId,
        message: availability.available
          ? 'On-chain ID available'
          : 'On-chain ID already in use',
      });

      if (!availability.available) {
        return;
      }
    } catch (err) {
      setAppIdAvailability({
        state: 'error',
        appId,
        message: 'Could not verify On-chain ID right now',
      });
      setError(
        err instanceof Error ? err.message : 'Could not verify On-chain ID'
      );
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
      setTelegramHandle(normalizedTelegramHandle);
      setXHandle(normalizedXHandle);
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
        <Shield className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" />
        <p className="mb-6 text-muted-foreground">
          Sign in to start your partner application.
        </p>
        <Button
          onClick={() => connect()}
          size="default"
          className="font-semibold px-8"
        >
          Let's connect
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6">
      <SurfacePanel
        radius="xl"
        tone="subtle"
        padding="none"
        className="p-4 md:p-5"
      >
        <h2 className="mb-3 text-center text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          New Launch
        </h2>
        <StatStrip>
          <StatStripCell label="Requirement">
            <p className="mt-1 truncate font-mono text-sm font-bold text-foreground/80 md:text-base">
              {governanceThresholdDisplay ?? '100'}
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">
              delegated SOCIAL
            </p>
          </StatStripCell>
        </StatStrip>
      </SurfacePanel>

      <SurfacePanel
        radius="xl"
        tone="subtle"
        padding="none"
        className="p-4 md:p-5"
      >
        <h3 className="mb-4 text-center text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Details
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Name
            </label>
            <div className="flex items-center rounded-2xl border border-border/60">
              <input
                type="text"
                value={label}
                onChange={(e) => {
                  const nextLabel = e.target.value;
                  const nextAppId = toSlug(nextLabel);

                  setLabel(nextLabel);
                  setShowLabelFeedback(false);

                  if (nextAppId !== appId) {
                    setAppIdAvailability({
                      state: 'idle',
                      appId: '',
                      message: '',
                    });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                onBlur={commitLabelInput}
                placeholder="OnSocial"
                maxLength={MAX_LABEL_LEN}
                className="portal-blue-focus w-full bg-transparent px-4 py-3.5 text-sm outline-none"
                required
              />
              {appId && (
                <span className="shrink-0 pr-3">
                  {appIdChecking ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground">
                      <PulsingDots size="sm" />
                    </span>
                  ) : appIdTaken ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                      <X className="h-3 w-3" />
                    </span>
                  ) : appIdAvailable ||
                    (showLabelSuccess && !appIdAvailabilityError) ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : null}
                </span>
              )}
            </div>
            <AnimatePresence initial={false} mode="wait">
              {showLabelFeedback && label.trim() && projectNameError ? (
                <motion.p
                  key="label-error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="mt-2 text-xs text-amber-600"
                >
                  {projectNameError}
                </motion.p>
              ) : appId ? (
                <motion.p
                  key="app-id-feedback"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="mt-2 text-xs text-muted-foreground"
                >
                  On-chain ID:{' '}
                  <span className="font-mono text-foreground/85">{appId}</span>
                  {appIdTaken && <span className="text-red-600"> · Taken</span>}
                  {appIdAvailabilityError && (
                    <span className="text-amber-600"> · Couldn't verify</span>
                  )}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              About your community
            </label>
            <div className="relative rounded-2xl border border-border/60">
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
                placeholder="Describe what your community builds and the value it creates."
                rows={3}
                maxLength={MAX_DESCRIPTION_LEN}
                className="portal-blue-focus w-full resize-none rounded-2xl bg-transparent px-4 pt-3.5 pb-7 text-sm outline-none"
              />
              <span
                className={`pointer-events-none absolute right-3 bottom-2 text-[10px] tabular-nums tracking-wide ${
                  descriptionLength < MIN_DESCRIPTION_LEN && hasDescription
                    ? 'text-amber-600'
                    : descriptionLength >= DESCRIPTION_WARNING_THRESHOLD
                      ? 'text-amber-600'
                      : 'text-muted-foreground/60'
                }`}
              >
                {descriptionLength < MIN_DESCRIPTION_LEN
                  ? `${descriptionLength} / ${MIN_DESCRIPTION_LEN} min`
                  : `${descriptionLength} / ${MAX_DESCRIPTION_LEN}`}
              </span>
            </div>
            <AnimatePresence initial={false}>
              {showDescriptionFeedback &&
              hasDescription &&
              descriptionTextError ? (
                <motion.p
                  key="description-error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="mt-2 text-xs text-amber-600"
                >
                  {descriptionTextError}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Community Size
            </label>
            <div className="relative" ref={audienceMenu.containerRef}>
              <button
                ref={audienceTriggerRef}
                type="button"
                onClick={audienceMenu.toggle}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    openAudienceMenu(
                      Math.min(
                        selectedAudienceIndex + 1,
                        AUDIENCE_BANDS.length - 1
                      )
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
                aria-expanded={audienceMenu.isOpen}
                className="portal-blue-focus flex w-full items-center justify-between rounded-2xl border border-border/60 px-4 py-3.5 text-left text-sm outline-none"
              >
                <span>{audienceBand}</span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    audienceMenu.isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <FloatingPanelMenu
                open={audienceMenu.isOpen}
                align="full"
                className="space-y-0.5 p-1 md:p-1.5"
                role="listbox"
                aria-label="Audience band"
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setAudienceActiveIndex((current) =>
                      Math.min(current + 1, AUDIENCE_BANDS.length - 1)
                    );
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setAudienceActiveIndex((current) =>
                      Math.max(current - 1, 0)
                    );
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
                    audienceMenu.close();
                  }
                }}
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
                      className={`${floatingPanelItemClass} justify-between ${
                        selected
                          ? floatingPanelItemSelectedClass
                          : active
                            ? floatingPanelItemActiveClass
                            : ''
                      }`}
                    >
                      <span>{band}</span>
                      <span className="flex h-4 w-4 items-center justify-center">
                        {selected && <Check className="h-4 w-4" />}
                      </span>
                    </button>
                  );
                })}
              </FloatingPanelMenu>
            </div>
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel
        radius="xl"
        tone="subtle"
        padding="none"
        className="p-4 md:p-5"
      >
        <h3 className="mb-4 text-center text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Links
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Website
            </label>
            <div className="flex items-center rounded-2xl border border-border/60">
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
                className="portal-blue-focus w-full bg-transparent px-4 py-3.5 text-sm outline-none"
              />
              {websiteFeedbackVisible && (
                <span className="shrink-0 pr-3">
                  {websiteValid ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Telegram
            </label>
            <div className="flex items-center rounded-2xl border border-border/60">
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
                className="portal-blue-focus w-full bg-transparent px-4 py-3.5 text-sm outline-none"
              />
              {telegramFeedbackVisible && (
                <span className="shrink-0 pr-3">
                  {telegramValid ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              X
            </label>
            <div className="flex items-center rounded-2xl border border-border/60">
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
                className="portal-blue-focus w-full bg-transparent px-4 py-3.5 text-sm outline-none"
              />
              {xFeedbackVisible && (
                <span className="shrink-0 pr-3">
                  {xValid ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                      <X className="h-3 w-3" />
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showMissingPublicLinkHint ? (
            <motion.p
              key="missing-public-link"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="mt-2 text-center text-xs text-amber-600"
            >
              At least one public link helps people recognize your community.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </SurfacePanel>

      <SurfacePanel
        radius="xl"
        tone="subtle"
        padding="none"
        className="p-4 md:p-5"
      >
        <h3 className="mb-3 text-center text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Launch Terms
        </h3>
        <StatStrip columns={4}>
          <StatStripCell
            label="Per Action"
            value={PARTNER_PER_USER_TERMS.rewardPerAction}
            showDivider
          />
          <StatStripCell
            label="Max / Day"
            value={PARTNER_PER_USER_TERMS.dailyCap}
            showDivider
          />
          <StatStripCell
            label="Total Budget"
            value={Number(
              PARTNER_AUDIENCE_BAND_BUDGETS[audienceBand].totalBudget
            ).toLocaleString()}
            valueClassName="portal-blue-text"
            showDivider
          />
          <StatStripCell
            label="Daily Budget"
            value={Number(
              PARTNER_AUDIENCE_BAND_BUDGETS[audienceBand].dailyBudget
            ).toLocaleString()}
            valueClassName="portal-blue-text"
          />
        </StatStrip>
      </SurfacePanel>

      {error && (
        <div className="portal-red-panel portal-red-text rounded-[1rem] border px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={
          submitting ||
          !appId ||
          appIdPending ||
          appIdTaken ||
          !label ||
          !description.trim() ||
          descriptionLength < MIN_DESCRIPTION_LEN ||
          !publicLinkRequirementMet
        }
        size="default"
        className="w-full font-semibold disabled:opacity-50"
        loading={submitting}
      >
        Continue to Draft
        <ArrowRight className={`ml-2 h-4 w-4 ${buttonArrowRightClass}`} />
      </Button>
    </form>
  );
}
