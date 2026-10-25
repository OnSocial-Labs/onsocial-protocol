'use client';

/**
 * Owner-only one-liner at the top of About: "What's your craft?" — a single
 * field, Enter saves the tag straight to the profile (no editor, no save
 * button), × skips and stays skipped. Hidden once any craft is set.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MultiplyIcon } from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import {
  readAboutCraftPromptDismissed,
  shouldShowAboutCraftPrompt,
  writeAboutCraftPromptDismissed,
} from '@/lib/about-craft-prompt';
import {
  normalizeProfileEditorTagDraft,
  normalizeProfileEditorTags,
  PROFILE_EDITOR_MAX_TAG_LENGTH,
} from '@/lib/profile-tag-editor';
import { formatTopicDraftInput } from '@/lib/topic-slug';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function PortfolioAboutCraftPrompt({
  accountId,
  tags = null,
  showsCrafts,
}: {
  accountId: string;
  tags?: string[] | null;
  /** Person-kind About only (org / DAO prompt for industry instead). */
  showsCrafts: boolean;
}) {
  const fieldId = useId();
  const router = useRouter();
  const { accountId: viewerAccountId } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  /** Null until the dismissal flag is read post-hydration (SSR renders null). */
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDismissed(readAboutCraftPromptDismissed(accountId));
  }, [accountId]);

  const existing = normalizeProfileEditorTags(tags);
  const visible =
    dismissed !== null &&
    !saved &&
    shouldShowAboutCraftPrompt({
      viewerAccountId,
      profileAccountId: accountId,
      showsCrafts,
      hasCrafts: existing.length > 0,
      dismissed,
    });

  if (!visible) return null;

  const dismiss = () => {
    writeAboutCraftPromptDismissed(accountId);
    setDismissed(true);
  };

  const commit = async () => {
    const craft = normalizeProfileEditorTagDraft(draft);
    if (!craft || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { client } = await getClient();
      await client.profiles.update(
        { tags: normalizeProfileEditorTags([...existing, craft]) },
        { wait: true }
      );
      // Hide right away — the craft line itself lands with the indexer.
      setSaved(true);
      router.refresh();
    } catch (err) {
      if (!isWalletUserCancellation(err)) {
        setError('Couldn’t save. Try again.');
      }
      setSaving(false);
    }
  };

  return (
    <div
      className="portfolio-about-craft-prompt"
      data-testid="about-craft-prompt"
    >
      <label
        className="portfolio-about-craft-prompt-field"
        htmlFor={`${fieldId}-input`}
      >
        <span className="portfolio-about-craft-prompt-label">
          What’s your craft?
        </span>
        <input
          ref={inputRef}
          id={`${fieldId}-input`}
          className="portfolio-about-craft-prompt-input"
          value={draft}
          maxLength={PROFILE_EDITOR_MAX_TAG_LENGTH}
          placeholder="Photographer"
          autoComplete="organization-title"
          disabled={saving}
          enterKeyHint="done"
          onChange={(event) =>
            setDraft(formatTopicDraftInput(event.target.value))
          }
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void commit();
          }}
        />
      </label>
      <button
        type="button"
        className="portfolio-about-craft-prompt-skip"
        aria-label="Skip craft prompt"
        disabled={saving}
        onClick={dismiss}
      >
        <MultiplyIcon
          aria-hidden
          className="portfolio-about-craft-prompt-skip-icon"
        />
      </button>
      {error ? (
        <p className="portfolio-about-craft-prompt-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
