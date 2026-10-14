'use client';

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  Divider,
  GlobeIcon,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { SHEET_Z } from '@/lib/sheet-z';
import { PortfolioLinkIcon } from '@/components/portfolio/portfolio-link-icon';
import {
  formatProfileLinkForEditor,
  profileLinkEditorInlineError,
  PROFILE_LINK_EDITOR_FIELDS,
  sanitizeOnSocialLinkInput,
  type ProfileLinkKind,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import { PAGE_LINK_NOTE_MAX } from '@/lib/page-launch-config';
import { probeNearAccountExists } from '@/hooks/use-near-account-status';
import { PROFILE_ABOUT_PHOTO_ACCEPT } from '@/lib/profile-about-photos';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import {
  portfolioWebsiteDraftError,
  type PortfolioWebsiteDraft,
} from '@/lib/profile-websites';
import { portfolioWebsiteRowCopy } from '@/lib/profile-social-links';

const PHOTO_TYPES = new Set(PROFILE_ABOUT_PHOTO_ACCEPT.split(','));

/** One preview per chosen file. Do not recreate it when the list opens —
 * a fresh blob URL that is revoked on mount paints a broken image. */
const localPhotoUrls = new WeakMap<File, string>();

function localPhotoUrl(file: File): string {
  const cached = localPhotoUrls.get(file);
  if (cached) return cached;
  const url = URL.createObjectURL(file);
  localPhotoUrls.set(file, url);
  return url;
}

function releaseLocalPhoto(file: File | null | undefined) {
  if (!file) return;
  const url = localPhotoUrls.get(file);
  if (!url) return;
  localPhotoUrls.delete(file);
  URL.revokeObjectURL(url);
}

function websitePhotoSrc(row: PortfolioWebsiteDraft): string {
  if (row.imageFile) return localPhotoUrl(row.imageFile);
  return resolveProfileMediaUrl(row.image) || '';
}

/** A short hug drawer is already on screen. Focusing a field must not scroll
 * the phone or the sheet — the browser reveals the caret and the drawer jumps. */
function rememberDrawerScroll(field: HTMLElement) {
  const pinned: Array<{ node: HTMLElement; top: number; left: number }> = [];
  let node: HTMLElement | null = field.parentElement;
  while (node) {
    pinned.push({ node, top: node.scrollTop, left: node.scrollLeft });
    node = node.parentElement;
  }
  return { pinned, x: window.scrollX, y: window.scrollY };
}

function restoreDrawerScroll(
  snap: ReturnType<typeof rememberDrawerScroll> | null
) {
  if (!snap) return;
  for (const item of snap.pinned) {
    if (item.node.scrollTop !== item.top) item.node.scrollTop = item.top;
    if (item.node.scrollLeft !== item.left) item.node.scrollLeft = item.left;
  }
  if (window.scrollX !== snap.x || window.scrollY !== snap.y) {
    window.scrollTo(snap.x, snap.y);
  }
}

let drawerScrollSnap: ReturnType<typeof rememberDrawerScroll> | null = null;

function holdDrawerStill(event: FocusEvent<HTMLInputElement>) {
  const snap = drawerScrollSnap ?? rememberDrawerScroll(event.currentTarget);
  drawerScrollSnap = null;
  const restore = () => restoreDrawerScroll(snap);
  restore();
  window.requestAnimationFrame(restore);
  window.setTimeout(restore, 50);
}

function focusFieldStill(event: PointerEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (document.activeElement === input) return;
  drawerScrollSnap = rememberDrawerScroll(input);
  if (event.pointerType !== 'mouse') return;
  event.preventDefault();
  input.focus({ preventScroll: true });
}

type LinkStep =
  | { kind: 'picker' }
  | { kind: 'sites' }
  | { kind: 'website'; draft: PortfolioWebsiteDraft; existing: boolean }
  | { kind: 'social'; key: keyof ProfileLinksInput; existing: boolean };

function emptyWebsite(id: string): PortfolioWebsiteDraft {
  return { id, url: '', name: '', line: '', image: '', imageFile: null };
}

function websiteCopy(row: PortfolioWebsiteDraft) {
  const raw = row.url.trim();
  const href = !raw ? '' : /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return portfolioWebsiteRowCopy({
    key: row.id,
    kind: 'website',
    label: 'Website',
    href,
    note: row.name.trim() || undefined,
    line: row.line.trim() || undefined,
  });
}

function BorderedLinkValue({
  id,
  value,
  placeholder,
  label,
  leading,
  invalid,
  error,
  disabled,
  maxLength,
  inputMode,
  autoComplete,
  spellCheck,
  onChange,
  onKeyDown,
}: {
  id: string;
  value: string;
  placeholder: string;
  label: string;
  leading: ReactNode;
  invalid?: boolean;
  error?: string | null;
  disabled?: boolean;
  maxLength: number;
  inputMode?: 'url';
  autoComplete?: string;
  spellCheck?: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="guild-field">
      <span id={`${id}-label`}>{label}</span>
      <div
        className={`os-account-field ${osFieldBorderedClassName}${
          invalid ? ' is-invalid' : ''
        }`}
      >
        {leading}
        <Divider
          orientation="vertical"
          variant="detail"
          className="os-account-field-divider"
        />
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          aria-labelledby={`${id}-label`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          maxLength={maxLength}
          inputMode={inputMode}
          autoComplete={autoComplete}
          spellCheck={spellCheck}
          onPointerDown={focusFieldStill}
          onFocus={holdDrawerStill}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      {error ? (
        <small className="is-invalid" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

function WebsiteLinkForm({
  draft,
  storedFile,
  addressError,
  onChange,
  onKeyDown,
}: {
  draft: PortfolioWebsiteDraft;
  /** Photo still on the saved row, so a discarded edit must not revoke it. */
  storedFile: File | null;
  addressError: string | null;
  onChange: (patch: Partial<PortfolioWebsiteDraft>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const src = websitePhotoSrc(draft);

  const onPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.has(file.type)) {
      setPhotoError('Use a photo');
      return;
    }
    setPhotoError(null);
    if (
      draft.imageFile &&
      draft.imageFile !== file &&
      draft.imageFile !== storedFile
    ) {
      releaseLocalPhoto(draft.imageFile);
    }
    localPhotoUrl(file);
    onChange({ imageFile: file });
  };

  return (
    <div className="account-editor-sheet-form">
      <input
        ref={fileRef}
        type="file"
        accept={PROFILE_ABOUT_PHOTO_ACCEPT}
        className="account-editor-website-file"
        tabIndex={-1}
        aria-hidden
        onChange={onPhoto}
      />
      <label className="guild-field" htmlFor="profile-link-title">
        <span>Title</span>
        <input
          id="profile-link-title"
          className={osFieldBorderedClassName}
          value={draft.name}
          placeholder="Studio"
          aria-label="Title"
          maxLength={PAGE_LINK_NOTE_MAX}
          autoComplete="off"
          onPointerDown={focusFieldStill}
          onFocus={holdDrawerStill}
          onChange={(event) =>
            onChange({
              name: event.target.value.slice(0, PAGE_LINK_NOTE_MAX),
            })
          }
          onKeyDown={onKeyDown}
        />
      </label>
      <BorderedLinkValue
        id="profile-link-url"
        value={draft.url}
        placeholder="studio.com"
        label="Link"
        invalid={Boolean(addressError)}
        error={addressError}
        maxLength={255}
        inputMode="url"
        autoComplete="url"
        leading={
          <button
            type="button"
            className="os-account-field-leading account-editor-link-leading"
            aria-label={src ? 'Replace photo' : 'Add photo'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            {src ? (
              <img src={src} alt="" className="account-editor-link-photo" />
            ) : (
              <GlobeIcon className="portfolio-link-icon" aria-hidden />
            )}
          </button>
        }
        onChange={(url) => onChange({ url })}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="account-editor-website-photo-action"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!src) {
            fileRef.current?.click();
            return;
          }
          setPhotoError(null);
          if (draft.imageFile && draft.imageFile !== storedFile) {
            releaseLocalPhoto(draft.imageFile);
          }
          onChange({ image: '', imageFile: null });
        }}
      >
        {src ? 'Remove photo' : 'Add photo'}
      </button>
      {photoError ? (
        <span className="account-editor-website-photo-error" role="alert">
          {photoError}
        </span>
      ) : null}
    </div>
  );
}

interface ProfileLinksEditorProps {
  links: ProfileLinksInput;
  fieldErrors: Partial<Record<keyof ProfileLinksInput, string>>;
  notes?: Record<string, string>;
  /** Portfolio editor keeps websites in their own list. DAO keeps one website field. */
  omitWebsite?: boolean;
  websites?: PortfolioWebsiteDraft[];
  websiteErrors?: Record<string, string>;
  /** Opens a new website inside this drawer. Shown as Website in Add link. */
  canAddWebsite?: boolean;
  onSaveWebsite?: (row: PortfolioWebsiteDraft) => void;
  onRemoveWebsite?: (id: string) => void;
  onUpdateLink: (key: keyof ProfileLinksInput, value: string) => void;
  onUpdateNote?: (key: keyof ProfileLinksInput, value: string) => void;
  onClearFieldError: (key: keyof ProfileLinksInput) => void;
  onSetFieldError: (key: keyof ProfileLinksInput, error: string | null) => void;
}

export function ProfileLinksEditor({
  links,
  fieldErrors,
  notes,
  omitWebsite = false,
  websites = [],
  websiteErrors = {},
  canAddWebsite = false,
  onSaveWebsite,
  onRemoveWebsite,
  onUpdateLink,
  onUpdateNote,
  onClearFieldError,
  onSetFieldError,
}: ProfileLinksEditorProps) {
  const editorFields = useMemo(
    () =>
      PROFILE_LINK_EDITOR_FIELDS.filter(
        (field) => !omitWebsite || field.key !== 'website'
      ),
    [omitWebsite]
  );
  const [step, setStep] = useState<LinkStep | null>(null);
  const websiteIdRef = useRef(0);
  const editBaselineRef = useRef<
    Partial<Record<keyof ProfileLinksInput, string>>
  >({});
  const noteBaselineRef = useRef<
    Partial<Record<keyof ProfileLinksInput, string>>
  >({});
  const probeGenRef = useRef(0);
  const [probingKey, setProbingKey] = useState<keyof ProfileLinksInput | null>(
    null
  );

  const faceFields = useMemo(
    () =>
      editorFields.filter(
        (field) =>
          links[field.key].trim().length > 0 || Boolean(fieldErrors[field.key])
      ),
    [editorFields, fieldErrors, links]
  );

  const availableToAdd = useMemo(
    () => editorFields.filter((field) => !links[field.key].trim()),
    [editorFields, links]
  );

  const rememberBaseline = (key: keyof ProfileLinksInput) => {
    editBaselineRef.current[key] = links[key];
    noteBaselineRef.current[key] = notes?.[key] ?? '';
  };

  const clearBaseline = (key: keyof ProfileLinksInput) => {
    delete editBaselineRef.current[key];
    delete noteBaselineRef.current[key];
  };

  const handleCancel = (key: keyof ProfileLinksInput) => {
    probeGenRef.current += 1;
    setProbingKey(null);
    const baseline = editBaselineRef.current[key] ?? '';
    onUpdateLink(key, baseline);
    onUpdateNote?.(key, noteBaselineRef.current[key] ?? '');
    onClearFieldError(key);
    clearBaseline(key);
    setStep(null);
  };

  const handleCommit = (
    key: keyof ProfileLinksInput,
    kind: ProfileLinkKind
  ) => {
    if (probingKey === key) return;

    const result = formatProfileLinkForEditor(links[key], kind);

    if (result.error) {
      onSetFieldError(key, result.error);
      return;
    }

    if (!result.value.trim()) return;

    const finish = () => {
      onClearFieldError(key);
      if (result.value !== links[key]) {
        onUpdateLink(key, result.value);
      }
      clearBaseline(key);
      setStep(null);
    };

    if (kind === 'onsocial' && result.value.trim()) {
      const gen = ++probeGenRef.current;
      setProbingKey(key);
      onClearFieldError(key);
      void probeNearAccountExists(result.value)
        .then((exists) => {
          if (gen !== probeGenRef.current) return;
          setProbingKey(null);
          if (!exists) {
            onSetFieldError(key, 'Account not found on this network');
            return;
          }
          finish();
        })
        .catch(() => {
          if (gen !== probeGenRef.current) return;
          setProbingKey(null);
          onSetFieldError(key, 'Could not verify account');
        });
      return;
    }

    finish();
  };

  const socialField =
    step?.kind === 'social'
      ? (editorFields.find((field) => field.key === step.key) ?? null)
      : null;

  const websiteAddressError =
    step?.kind === 'website' && step.draft.url.trim()
      ? portfolioWebsiteDraftError(step.draft)
      : null;
  const websiteReady =
    step?.kind === 'website' &&
    Boolean(step.draft.url.trim()) &&
    !websiteAddressError;
  const socialReady = Boolean(
    socialField &&
      links[socialField.key].trim() &&
      !fieldErrors[socialField.key] &&
      probingKey !== socialField.key
  );

  const showWebsiteChoice = Boolean(onSaveWebsite && canAddWebsite);
  const canAddLink = availableToAdd.length > 0 || showWebsiteChoice;
  const showGlobe = Boolean(onSaveWebsite) && websites.length > 0;
  const websiteError = websites
    .map((row) => websiteErrors[row.id])
    .find((error) => Boolean(error));

  const closeDrawer = () => {
    if (step?.kind === 'social') {
      handleCancel(step.key);
      return;
    }
    if (step?.kind === 'website') {
      const stored =
        websites.find((row) => row.id === step.draft.id)?.imageFile ?? null;
      if (step.draft.imageFile && step.draft.imageFile !== stored) {
        releaseLocalPhoto(step.draft.imageFile);
      }
    }
    probeGenRef.current += 1;
    setProbingKey(null);
    setStep(null);
  };

  const startSocial = (key: keyof ProfileLinksInput, existing: boolean) => {
    rememberBaseline(key);
    setStep({ kind: 'social', key, existing });
  };

  const startWebsite = (row?: PortfolioWebsiteDraft) => {
    if (row) {
      setStep({
        kind: 'website',
        existing: true,
        draft: { ...row, imageFile: row.imageFile ?? null },
      });
      return;
    }
    websiteIdRef.current += 1;
    setStep({
      kind: 'website',
      existing: false,
      draft: emptyWebsite(`draft-${websiteIdRef.current}`),
    });
  };

  const openWebsites = () => {
    if (websites.length === 1) {
      const row = websites[0];
      if (row) startWebsite(row);
      return;
    }
    setStep({ kind: 'sites' });
  };

  const saveWebsite = () => {
    if (step?.kind !== 'website' || !onSaveWebsite || !websiteReady) return;
    const stored =
      websites.find((row) => row.id === step.draft.id)?.imageFile ?? null;
    if (stored && stored !== step.draft.imageFile) {
      releaseLocalPhoto(stored);
    }
    onSaveWebsite({ ...step.draft, url: step.draft.url.trim() });
    setStep(null);
  };

  const removeWebsite = () => {
    if (step?.kind !== 'website' || !onRemoveWebsite) return;
    const stored =
      websites.find((row) => row.id === step.draft.id)?.imageFile ?? null;
    releaseLocalPhoto(step.draft.imageFile);
    if (stored && stored !== step.draft.imageFile) {
      releaseLocalPhoto(stored);
    }
    onRemoveWebsite(step.draft.id);
    setStep(null);
  };

  const removeSocial = () => {
    if (step?.kind !== 'social') return;
    probeGenRef.current += 1;
    setProbingKey(null);
    onUpdateLink(step.key, '');
    onUpdateNote?.(step.key, '');
    onClearFieldError(step.key);
    clearBaseline(step.key);
    setStep(null);
  };

  const onFormKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (step?.kind === 'website') saveWebsite();
    else if (socialField) handleCommit(socialField.key, socialField.kind);
  };

  const sheetLabel =
    step?.kind === 'sites'
      ? 'Links'
      : step?.kind === 'website'
        ? step.existing
          ? 'Edit link'
          : 'New link'
        : socialField
          ? socialField.label
          : 'Add link';

  const formFooter =
    step?.kind === 'website' || socialField ? (
      <OsSheetFooter>
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          {step?.kind === 'website' && step.existing ? (
            <OsSheetAction
              type="button"
              variant="danger"
              ready
              onClick={removeWebsite}
            >
              Remove
            </OsSheetAction>
          ) : null}
          {step?.kind === 'social' && step.existing ? (
            <OsSheetAction
              type="button"
              variant="danger"
              ready={probingKey !== step.key}
              disabled={probingKey === step.key}
              onClick={removeSocial}
            >
              Remove
            </OsSheetAction>
          ) : null}
          <OsSheetAction
            type="button"
            variant="primary"
            ready={step?.kind === 'website' ? websiteReady : socialReady}
            pending={socialField ? probingKey === socialField.key : false}
            pendingLabel="Checking…"
            disabled={step?.kind === 'website' ? !websiteReady : !socialReady}
            onClick={() => {
              if (step?.kind === 'website') saveWebsite();
              else if (socialField) {
                handleCommit(socialField.key, socialField.kind);
              }
            }}
          >
            Done
          </OsSheetAction>
        </OsSheetActions>
      </OsSheetFooter>
    ) : undefined;

  return (
    <section className="account-editor-section account-editor-links-section">
      <h3 className="sr-only">Links</h3>

      {showGlobe || faceFields.length > 0 ? (
        <div className="portfolio-links-scroll">
          <ul className="portfolio-links">
            {showGlobe ? (
              <li>
                <button
                  type="button"
                  className="portfolio-link"
                  aria-label={
                    websites.length > 1 ? 'Edit links' : 'Edit website'
                  }
                  onClick={openWebsites}
                >
                  <PortfolioLinkIcon
                    kind="website"
                    className="portfolio-link-icon"
                  />
                </button>
              </li>
            ) : null}
            {faceFields.map((field) => (
              <li key={field.key}>
                <button
                  type="button"
                  className="portfolio-link"
                  aria-label={`Edit ${notes?.[field.key]?.trim() || field.label}`}
                  onClick={() => startSocial(field.key, true)}
                >
                  <PortfolioLinkIcon
                    kind={field.kind}
                    className="portfolio-link-icon"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {websiteError ? (
        <span className="account-editor-website-photo-error" role="alert">
          {websiteError}
        </span>
      ) : null}

      {canAddLink ? (
        <div className="account-editor-links-actions">
          <button
            type="button"
            className="account-editor-links-add"
            aria-haspopup="dialog"
            aria-expanded={step != null}
            onClick={() => setStep({ kind: 'picker' })}
          >
            Add link
          </button>
        </div>
      ) : null}

      <OsHugSheet
        open={step != null}
        onClose={closeDrawer}
        label={sheetLabel}
        closeAriaLabel="Close link"
        backdropLabel="Close link"
        zIndex={SHEET_Z.confirm}
        chrome="choice"
        panelClassName="account-editor-link-sheet"
        footer={formFooter}
      >
        {step?.kind === 'website' ? (
          <WebsiteLinkForm
            key={step.draft.id}
            draft={step.draft}
            storedFile={
              websites.find((row) => row.id === step.draft.id)?.imageFile ??
              null
            }
            addressError={websiteAddressError}
            onChange={(patch) =>
              setStep((current) =>
                current?.kind === 'website'
                  ? { ...current, draft: { ...current.draft, ...patch } }
                  : current
              )
            }
            onKeyDown={onFormKeyDown}
          />
        ) : null}
        {socialField && step?.kind === 'social' ? (
          <div className="account-editor-sheet-form">
            {onUpdateNote ? (
              <label className="guild-field" htmlFor="profile-link-title">
                <span>Title</span>
                <input
                  id="profile-link-title"
                  className={osFieldBorderedClassName}
                  value={notes?.[socialField.key] ?? ''}
                  placeholder="Studio"
                  aria-label="Title"
                  maxLength={PAGE_LINK_NOTE_MAX}
                  autoComplete="off"
                  disabled={probingKey === socialField.key}
                  onPointerDown={focusFieldStill}
                  onFocus={holdDrawerStill}
                  onChange={(event) =>
                    onUpdateNote(
                      socialField.key,
                      event.target.value.slice(0, PAGE_LINK_NOTE_MAX)
                    )
                  }
                  onKeyDown={onFormKeyDown}
                />
              </label>
            ) : null}
            <BorderedLinkValue
              id="profile-link-url"
              value={links[socialField.key]}
              placeholder={
                socialField.kind === 'website'
                  ? 'studio.com'
                  : socialField.placeholder
              }
              label="Link"
              invalid={Boolean(fieldErrors[socialField.key])}
              error={
                fieldErrors[socialField.key]
                  ? profileLinkEditorInlineError(
                      socialField.kind,
                      fieldErrors[socialField.key] ?? ''
                    )
                  : null
              }
              disabled={probingKey === socialField.key}
              maxLength={
                socialField.kind === 'website' ||
                socialField.kind === 'onsocial'
                  ? 255
                  : 64
              }
              inputMode={
                socialField.kind === 'website' ||
                socialField.kind === 'onsocial'
                  ? 'url'
                  : undefined
              }
              autoComplete={socialField.kind === 'website' ? 'url' : 'off'}
              spellCheck={socialField.kind === 'onsocial' ? false : undefined}
              leading={
                <span className="os-account-field-leading" aria-hidden>
                  <PortfolioLinkIcon
                    kind={socialField.kind}
                    className="portfolio-link-icon"
                  />
                </span>
              }
              onChange={(value) => {
                onUpdateLink(
                  socialField.key,
                  socialField.kind === 'onsocial'
                    ? sanitizeOnSocialLinkInput(value)
                    : value
                );
                if (fieldErrors[socialField.key]) {
                  onClearFieldError(socialField.key);
                }
              }}
              onKeyDown={onFormKeyDown}
            />
          </div>
        ) : null}
        {step?.kind === 'sites' ? (
          <div className="portfolio-sites-list">
            {websites.map((row, index) => (
              <WebsiteListRow
                key={row.id}
                row={row}
                divided={index > 0}
                onEdit={() => startWebsite(row)}
              />
            ))}
          </div>
        ) : null}
        {step?.kind === 'picker' ? (
          <div
            className="os-choice-sheet-list"
            role="menu"
            aria-label="Add link"
          >
            <div className="os-choice-sheet-section">
              {showWebsiteChoice ? (
                <button
                  type="button"
                  role="menuitem"
                  className="os-choice-sheet-option"
                  onClick={() => startWebsite()}
                >
                  <span className="os-choice-sheet-leading">
                    <PortfolioLinkIcon
                      kind="website"
                      className="portfolio-link-icon"
                    />
                  </span>
                  <span className="os-choice-sheet-option-copy">
                    <span className="os-choice-sheet-option-primary">
                      <span className="os-choice-sheet-option-label">
                        Website
                      </span>
                    </span>
                  </span>
                </button>
              ) : null}
              {availableToAdd.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  role="menuitem"
                  className="os-choice-sheet-option"
                  onClick={() => startSocial(field.key, false)}
                >
                  <span className="os-choice-sheet-leading">
                    <PortfolioLinkIcon
                      kind={field.kind}
                      className="portfolio-link-icon"
                    />
                  </span>
                  <span className="os-choice-sheet-option-copy">
                    <span className="os-choice-sheet-option-primary">
                      <span className="os-choice-sheet-option-label">
                        {field.label}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </OsHugSheet>
    </section>
  );
}

function WebsiteListRow({
  row,
  divided,
  onEdit,
}: {
  row: PortfolioWebsiteDraft;
  divided: boolean;
  onEdit: () => void;
}) {
  const src = websitePhotoSrc(row);
  const copy = websiteCopy(row);
  return (
    <div>
      {divided ? <Divider variant="item" /> : null}
      <button type="button" className="portfolio-sites-row" onClick={onEdit}>
        <span className="portfolio-sites-mark" aria-hidden>
          {src ? (
            <img src={src} alt="" className="portfolio-sites-photo" />
          ) : (
            <GlobeIcon className="portfolio-link-icon" />
          )}
        </span>
        <span className="portfolio-sites-copy">
          <span className="portfolio-sites-name">{copy.title}</span>
          {copy.detail ? (
            <span className="portfolio-sites-line">{copy.detail}</span>
          ) : null}
        </span>
      </button>
    </div>
  );
}
