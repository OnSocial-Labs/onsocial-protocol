'use client';

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  DiscardConfirmSheet,
  OsIconAction,
  QuestionMarkCircleFillIcon,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { InfoDrawer } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import {
  entityIdAvailabilityClass,
  useEntityIdAvailability,
} from '@/hooks/use-entity-id-availability';
import { useEntityIdLead, useShellCreateError } from '@/lib/use-shell';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { GUILD_CREATE_FORM_ID } from '@/features/guilds/guild-create-voice';
import { APP_GROUPS_PATH } from '@/lib/app-routes';
import { GUILD_CREATE_FORM_CLASS } from '@/lib/os-create-page';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import {
  collectRelayTxHashes,
  normalizeGuildIdInput,
} from '@/features/guilds/guilds-data';
import { seedCreatedGuildCaches } from '@/features/guilds/guild-create-seed';
import {
  GuildBadgeWell,
  GuildLookPreview,
} from '@/features/guilds/guild-look-preview';
import { GuildTagsEditor } from '@/features/guilds/guild-tags-editor';
import { prepareSquareOpaqueJpeg } from '@/lib/prepare-square-opaque-jpeg';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import { normalizeGuildEditorTags } from '@/features/guilds/guild-tag-editor';
import {
  GUILD_MAX_DESCRIPTION_LENGTH,
  GUILD_MAX_NAME_LENGTH,
} from '@/features/guilds/guild-config';
import {
  DEFAULT_GUILD_STRUCTURE,
  guildStructureForMetadata,
} from '@/features/guilds/guild-structure';

function fieldId(name: string) {
  return `guild-create-${name}`;
}

function isFormFieldTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

const GUILD_MIN_ID = 3;

export function GuildCreatePanel() {
  const router = useRouter();
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [badgeFile, setBadgeFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [badgePreview, setBadgePreview] = useState<string | null>(null);
  const [accessGated, setAccessGated] = useState(false);
  const [memberDriven, setMemberDriven] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [formFieldFocused, setFormFieldFocused] = useState(false);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const formViewport = useVisualViewportSheetMetrics(formFieldFocused);
  const formKeyboardOpen =
    formFieldFocused && formViewport.isMobile && formViewport.lift > 0;

  const leaveToGuilds = useCallback(() => {
    router.push(APP_GROUPS_PATH);
  }, [router]);

  const dirty =
    name.trim().length > 0 ||
    description.trim().length > 0 ||
    bannerFile != null ||
    badgeFile != null ||
    (slugTouched && slug.trim().length > 0) ||
    tags.length > 0 ||
    accessGated ||
    memberDriven;

  const { discardConfirmOpen, requestCloseOrConfirm, keepEditing, discard } =
    useDiscardConfirm({
      open: true,
      dirty,
      pending,
      onClose: leaveToGuilds,
    });

  const handleDockBack = useCallback(() => {
    if (requestCloseOrConfirm()) {
      leaveToGuilds();
    }
  }, [requestCloseOrConfirm, leaveToGuilds]);

  const handleFormFocusCapture = useCallback(
    (event: FocusEvent<HTMLFormElement>) => {
      if (isFormFieldTarget(event.target)) setFormFieldFocused(true);
    },
    []
  );

  const onBadgeChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!isPostImageMime(file.type)) {
      setError('Use a JPG, PNG, or WebP image for the badge.');
      return;
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
      setError('Badge must be 5 MB or smaller.');
      return;
    }
    try {
      const prepared = await prepareSquareOpaqueJpeg(file);
      setError(null);
      setBadgeFile(prepared);
      setBadgePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(prepared);
      });
    } catch {
      setError('Could not prepare that badge image.');
    }
  };

  const onBannerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!isPostImageMime(file.type)) {
      setError('Use a JPG, PNG, or WebP image for the banner.');
      return;
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
      setError('Banner must be 5 MB or smaller.');
      return;
    }
    setError(null);
    setBannerFile(file);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const clearBadge = () => {
    setBadgeFile(null);
    setBadgePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const clearBanner = () => {
    setBannerFile(null);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleFormBlurCapture = useCallback(
    (event: FocusEvent<HTMLFormElement>) => {
      const next = event.relatedTarget;
      const form = event.currentTarget;
      if (
        next instanceof Node &&
        form.contains(next) &&
        isFormFieldTarget(next)
      ) {
        return;
      }
      setFormFieldFocused(false);
    },
    []
  );

  const screenStyle = useMemo(
    () =>
      ({
        ['--drop-create-keyboard-lift' as string]: formKeyboardOpen
          ? `${formViewport.lift}px`
          : '0px',
      }) as CSSProperties,
    [formKeyboardOpen, formViewport.lift]
  );

  const groupId = useMemo(
    () => normalizeGuildIdInput(slugTouched ? slug || name : name),
    [name, slug, slugTouched]
  );
  const idAvailability = useEntityIdAvailability(
    'guild',
    groupId,
    GUILD_MIN_ID
  );
  const idAvailabilityClass = entityIdAvailabilityClass(idAvailability);
  const idLead = useEntityIdLead(idAvailability);
  const t = useTranslations('shell');
  const shownError = useShellCreateError(error);
  const canSubmit =
    groupId.length >= GUILD_MIN_ID &&
    name.trim().length >= 2 &&
    !pending &&
    isConnected &&
    idAvailability !== 'taken' &&
    idAvailability !== 'checking';

  const footerState = useMemo((): CommerceSheetFooterState => {
    if (!isConnected) {
      return {
        visible: true,
        primaryLabel: t('dock.connect'),
        primaryPendingLabel: t('create.creating'),
        canSubmit: true,
        pending: false,
        primaryType: 'button',
        onPrimaryClick: () => {
          void connect();
        },
      };
    }
    return {
      visible: true,
      primaryLabel: t('homeChrome.createGuild'),
      primaryPendingLabel: t('create.creating'),
      canSubmit,
      pending,
      disabled: !canSubmit,
      primaryType: 'submit',
    };
  }, [isConnected, connect, canSubmit, pending, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isConnected) {
      await connect();
      return;
    }

    if (!canSubmit) {
      if (idAvailability === 'taken') {
        setError('That guild ID is taken — pick another.');
        return;
      }
      setError('Add a guild name and an ID with at least 3 characters.');
      return;
    }

    if (name.trim().length > GUILD_MAX_NAME_LENGTH) {
      setError(
        `Guild name must be ${GUILD_MAX_NAME_LENGTH} characters or fewer.`
      );
      return;
    }
    if (description.trim().length > GUILD_MAX_DESCRIPTION_LENGTH) {
      setError(
        `Description must be ${GUILD_MAX_DESCRIPTION_LENGTH} characters or fewer.`
      );
      return;
    }

    setPending(true);
    try {
      const { client } = await getClient();
      const onsocial: Record<string, unknown> = {
        structure: guildStructureForMetadata(DEFAULT_GUILD_STRUCTURE),
      };
      let bannerCid: string | null = null;
      let badgeCid: string | null = null;
      if (bannerFile) {
        const uploaded = await client.storage.upload(bannerFile);
        bannerCid = uploaded.cid;
        onsocial.banner = {
          cid: uploaded.cid,
          mime: uploaded.mime,
          size: uploaded.size,
        };
      }
      if (badgeFile) {
        const uploaded = await client.storage.upload(badgeFile);
        badgeCid = uploaded.cid;
        onsocial.badge = {
          cid: uploaded.cid,
          mime: uploaded.mime,
          size: uploaded.size,
        };
      }
      const response = await client.groups.create(groupId, {
        v: 1,
        name: name.trim(),
        description: description.trim() || undefined,
        isPrivate: accessGated,
        memberDriven,
        topics: normalizeGuildEditorTags(tags),
        x: { onsocial },
      });
      const txHashes = collectRelayTxHashes(response);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.creatingGuild,
        successMessage: txToastSuccess.guildCreated,
        failureMessage: txToastError.guildCreateFailed,
      });

      if (confirmed) {
        if (accountId) {
          seedCreatedGuildCaches({
            groupId,
            accountId,
            name: name.trim(),
            description: description.trim(),
            bannerCid,
            badgeCid,
            accessGated,
            memberDriven,
            topics: normalizeGuildEditorTags(tags),
          });
        }
        router.push(`/groups/${encodeURIComponent(groupId)}`);
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg: txToastError.guildCreateFailed,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <OsAppScreen
      title={t('homeChrome.createGuild')}
      dockBack
      headerOwnsConnect
      backFallbackHref={APP_GROUPS_PATH}
      onDockBack={handleDockBack}
      glassChrome
      style={screenStyle}
      actions={
        <OsIconAction
          ariaLabel={t('help.guildTitle')}
          aria-expanded={helpOpen}
          aria-haspopup="dialog"
          onClick={() => setHelpOpen(true)}
        >
          <QuestionMarkCircleFillIcon
            aria-hidden
            className="glass-sheet-close-icon"
          />
        </OsIconAction>
      }
      footer={
        <CommerceSheetFooter
          formId={GUILD_CREATE_FORM_ID}
          keyboardOpen={formKeyboardOpen}
          state={footerState}
        />
      }
    >
      <form
        id={GUILD_CREATE_FORM_ID}
        className={GUILD_CREATE_FORM_CLASS}
        data-form-focused={formFieldFocused ? '' : undefined}
        data-keyboard={formKeyboardOpen ? 'open' : undefined}
        onFocusCapture={handleFormFocusCapture}
        onBlurCapture={handleFormBlurCapture}
        onSubmit={handleSubmit}
      >
        <GuildLookPreview
          bannerUrl={bannerPreview}
          disabled={pending}
          onBannerChange={onBannerChange}
          onRemoveBanner={clearBanner}
        />

        <div className="guild-field">
          <label htmlFor={fieldId('name')}>
            <span>{t('create.name')}</span>
          </label>
          <div className="guild-create-name-row">
            <GuildBadgeWell
              badgeUrl={badgePreview}
              disabled={pending}
              onBadgeChange={(event) => {
                void onBadgeChange(event);
              }}
              onRemoveBadge={clearBadge}
            />
            <input
              id={fieldId('name')}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                // Name is source of truth — re-link ID after any name edit.
                setSlugTouched(false);
              }}
              placeholder="Builder Room"
              maxLength={GUILD_MAX_NAME_LENGTH}
              disabled={pending}
              onFocus={scrollFieldIntoView}
              className={osFieldBorderedClassName}
            />
          </div>
        </div>

        <label className="guild-field" htmlFor={fieldId('id')}>
          <span>{t('create.guildId')}</span>
          <div
            className={
              idAvailabilityClass
                ? `${osFieldBorderedClassName} ${idAvailabilityClass}`
                : osFieldBorderedClassName
            }
          >
            <input
              id={fieldId('id')}
              value={slugTouched ? slug : groupId}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              placeholder="builder-room"
              maxLength={40}
              disabled={pending}
              onFocus={scrollFieldIntoView}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              aria-invalid={idAvailability === 'taken'}
            />
          </div>
          <small className={idAvailabilityClass}>
            {idLead} · {t('create.publicLink')} /groups/
            {groupId || 'builder-room'}
          </small>
        </label>

        <button
          type="button"
          className="collection-allowlist-toggle"
          aria-expanded={aboutOpen}
          disabled={pending}
          onClick={() => setAboutOpen((open) => !open)}
        >
          {aboutOpen
            ? t('create.hideAbout')
            : description.trim()
              ? t('create.editAbout')
              : t('create.addAbout')}
        </button>
        {aboutOpen ? (
          <label className="guild-field" htmlFor={fieldId('description')}>
            <span>{t('create.about')}</span>
            <textarea
              id={fieldId('description')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onFocus={scrollFieldIntoView}
              placeholder={t('create.guildAboutPlaceholder')}
              maxLength={GUILD_MAX_DESCRIPTION_LENGTH}
              disabled={pending}
              aria-describedby={fieldId('description-count')}
              className={osFieldBorderedClassName}
            />
            <small id={fieldId('description-count')}>
              {description.length}/{GUILD_MAX_DESCRIPTION_LENGTH}
            </small>
          </label>
        ) : null}

        <div className="guild-field">
          <span>{t('create.topic')}</span>
          <GuildTagsEditor
            tags={tags}
            onChange={setTags}
            id={fieldId('tags')}
            disabled={pending}
          />
        </div>

        <div className="guild-field">
          <span>{t('create.access')}</span>
          <div
            className="app-storage-presets"
            role="radiogroup"
            aria-label={t('create.guildAccess')}
          >
            <button
              type="button"
              role="radio"
              aria-checked={!accessGated && !memberDriven}
              className={`os-surface-chip${
                !accessGated && !memberDriven ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => {
                setAccessGated(false);
                setMemberDriven(false);
              }}
            >
              {t('create.open')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={accessGated && !memberDriven}
              className={`os-surface-chip${
                accessGated && !memberDriven ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => {
                setAccessGated(true);
                setMemberDriven(false);
              }}
            >
              {t('create.inviteOnly')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={memberDriven}
              className={`os-surface-chip${memberDriven ? ' is-selected' : ''}`}
              disabled={pending}
              onClick={() => {
                setMemberDriven(true);
                setAccessGated(true);
              }}
            >
              {t('create.collaborative')}
            </button>
          </div>
          <small>
            {memberDriven
              ? t('create.accessCollaborativeDetail')
              : accessGated
                ? t('create.accessInviteDetail')
                : t('create.accessOpenDetail')}
          </small>
        </div>

        {shownError ? <p className="guild-form-error">{shownError}</p> : null}
      </form>
      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
        title={t('create.discardGuild')}
        body={t('create.discardLookBody')}
      />
      <InfoDrawer
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={t('help.guildTitle')}
        summary={t('help.guildSummary')}
        detail={t('help.guildDetail')}
        gotItLabel={t('help.gotIt')}
      />
    </OsAppScreen>
  );
}
