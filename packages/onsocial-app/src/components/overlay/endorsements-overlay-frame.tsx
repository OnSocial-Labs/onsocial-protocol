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
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
import { OsChipAction } from '@/lib/os-chip-action';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';

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

export function EndorsementsHeaderActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<EndorsementsHeaderActionState | null>(
    null
  );

  return (
    <EndorsementsHeaderActionsDispatchContext.Provider value={setState}>
      <EndorsementsHeaderActionsContext.Provider value={state}>
        {children}
      </EndorsementsHeaderActionsContext.Provider>
    </EndorsementsHeaderActionsDispatchContext.Provider>
  );
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
      <SimpleOverlayPanel
        ariaTitle={ariaTitle}
        title={title}
        headerActions={<EndorsementsHeaderActions />}
      >
        {children}
      </SimpleOverlayPanel>
    </EndorsementsHeaderActionsProvider>
  );
}
