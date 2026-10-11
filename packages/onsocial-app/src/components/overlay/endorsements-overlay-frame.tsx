'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { OsChipAction } from '@/lib/os-chip-action';
import { OsSheetAction, OsSheetActions, SheetCloseButton } from '@onsocial/ui';

type EndorsementsHeaderActionState = {
  show: boolean;
  endorsed: boolean;
  pending: boolean;
  blocked: boolean;
  label: string;
  showAddTopic: boolean;
  onEndorse: () => void;
  onAddTopic: () => void;
};

type EndorsementsHeaderActionInput = EndorsementsHeaderActionState;

const EndorsementsHeaderActionsContext =
  createContext<EndorsementsHeaderActionState | null>(null);

const EndorsementsHeaderActionsDispatchContext = createContext<
  (state: EndorsementsHeaderActionState | null) => void
>(() => {});

const EndorsementsToolbarSlotContext = createContext<HTMLDivElement | null>(
  null
);

const EndorsementsToolbarSlotDispatchContext = createContext<
  (slot: HTMLDivElement | null) => void
>(() => {});

export function EndorsementsHeaderActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<EndorsementsHeaderActionState | null>(
    null
  );
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

  return (
    <EndorsementsHeaderActionsDispatchContext.Provider value={setState}>
      <EndorsementsHeaderActionsContext.Provider value={state}>
        <EndorsementsToolbarSlotContext.Provider value={toolbarSlot}>
          <EndorsementsToolbarSlotDispatchContext.Provider
            value={setToolbarSlot}
          >
            {children}
          </EndorsementsToolbarSlotDispatchContext.Provider>
        </EndorsementsToolbarSlotContext.Provider>
      </EndorsementsHeaderActionsContext.Provider>
    </EndorsementsHeaderActionsDispatchContext.Provider>
  );
}

/** Filter and search mount here so the header matches standing's compact row. */
export function useEndorsementsToolbarSlot(): HTMLDivElement | null {
  return useContext(EndorsementsToolbarSlotContext);
}

/**
 * Panel owns compose state. The overlay header is portaled outside the panel,
 * so the panel publishes the Endorse cluster and the frame renders it beside Close.
 */
export function usePublishEndorsementsHeaderActions(
  input: EndorsementsHeaderActionInput
) {
  const setState = useContext(EndorsementsHeaderActionsDispatchContext);
  const onEndorseRef = useRef(input.onEndorse);
  const onAddTopicRef = useRef(input.onAddTopic);
  const { show, endorsed, pending, blocked, label, showAddTopic } = input;
  const publishEndorse = input.onEndorse;
  const publishAddTopic = input.onAddTopic;

  const onEndorse = useCallback(() => {
    onEndorseRef.current();
  }, []);
  const onAddTopic = useCallback(() => {
    onAddTopicRef.current();
  }, []);

  useLayoutEffect(() => {
    onEndorseRef.current = publishEndorse;
    onAddTopicRef.current = publishAddTopic;
  }, [publishAddTopic, publishEndorse]);

  useLayoutEffect(() => {
    setState({
      show,
      endorsed,
      pending,
      blocked,
      label,
      showAddTopic,
      onEndorse,
      onAddTopic,
    });
  }, [
    blocked,
    endorsed,
    label,
    onAddTopic,
    onEndorse,
    pending,
    setState,
    show,
    showAddTopic,
  ]);

  useLayoutEffect(() => {
    return () => setState(null);
  }, [setState]);
}

export function EndorsementsHeaderActions() {
  const state = useContext(EndorsementsHeaderActionsContext);
  if (!state?.show) return null;

  return (
    <>
      <OsSheetActions
        layout="row-compact"
        size="sm"
        tone="frosted-primary"
        borderless
        className="endorsements-endorse-action"
      >
        <OsSheetAction
          type="button"
          ready={!state.blocked}
          active={state.endorsed}
          disabled={state.pending || state.blocked}
          pending={state.pending}
          pendingLabel={state.endorsed ? 'Saving…' : 'Endorsing…'}
          {...(state.endorsed
            ? { 'aria-label': `Edit endorsement for ${state.label}` }
            : {})}
          onClick={state.onEndorse}
        >
          {state.endorsed ? 'Endorsed' : 'Endorse'}
        </OsSheetAction>
      </OsSheetActions>
      {state.showAddTopic ? (
        <OsChipAction
          onClick={state.onAddTopic}
          disabled={state.pending}
          aria-label={`Add another endorsement for ${state.label}`}
        >
          Add topic
        </OsChipAction>
      ) : null}
    </>
  );
}

function EndorsementsOverlayChrome({
  ariaTitle,
  title,
}: {
  ariaTitle: string;
  title?: string;
}) {
  const close = useOverlayDismiss();
  const setToolbarSlot = useContext(EndorsementsToolbarSlotDispatchContext);

  return (
    <OverlayPanelChrome
      ariaTitle={ariaTitle}
      toolbar={
        <div className="standing-sheet-header standing-sheet-header--compact">
          <div className="standing-sheet-subject-row">
            <span className="standing-sheet-subject-name endorsements-sheet-title">
              {title ?? ariaTitle}
            </span>
            <div className="standing-sheet-actions">
              <EndorsementsHeaderActions />
              <SheetCloseButton
                onClick={close}
                ariaLabel={`Close ${title ?? ariaTitle}`}
              />
            </div>
          </div>
          <div
            ref={setToolbarSlot}
            className="os-app-chrome-rail standing-sheet-toolbar-row standing-toolbar-rail"
          />
        </div>
      }
    />
  );
}

export function EndorsementsOverlayFrame({
  ariaTitle,
  title,
  children,
}: {
  ariaTitle: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <EndorsementsHeaderActionsProvider>
      <EndorsementsOverlayChrome ariaTitle={ariaTitle} title={title} />
      {children}
    </EndorsementsHeaderActionsProvider>
  );
}
