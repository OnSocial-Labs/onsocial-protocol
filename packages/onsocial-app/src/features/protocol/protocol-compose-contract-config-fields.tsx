'use client';



import { useCallback, useMemo, useState, type ReactNode } from 'react';

import {

  ChoiceDrawerField,

  SuffixField,

  type ChoiceOption,

} from '@onsocial/ui';

import {

  PROTOCOL_CONTRACT_CONFIG_OPS,

  type ProtocolContractConfigOpId,

} from '@/features/protocol/protocol-contracts';

import {

  ProtocolComposeBoostPoolInfoDrawer,

  ProtocolComposeBoostPoolLabel,

} from '@/features/protocol/protocol-compose-boost-pool-info';

import {

  CONTRACT_CONFIG_SPLIT_KEYS,

  contractConfigSplitBpsStringsFromPercents,

  contractConfigSplitPercentsFromBpsStrings,

  normalizeContractConfigPercentInput,

  parseContractConfigPercentInput,

  setContractConfigSplitPercent,

  type ContractConfigSplitKey,

  type ContractConfigSplitPercents,

} from '@/features/protocol/protocol-contract-config-split';



const ROUTING_SPLIT_FIELDS: Array<{ key: ContractConfigSplitKey; label: string }> =

  [

    { key: 'treasuryBps', label: 'Boost pool' },

    { key: 'seasonPoolBps', label: 'Rally pool' },

    { key: 'targetBps', label: 'Target' },

    { key: 'burnBps', label: 'Burn' },

  ];



function ProtocolComposeSplitPercentField({

  label,

  labelContent,

  percent,

  onCommit,

  pending = false,

}: {

  label: string;

  labelContent?: ReactNode;

  percent: number;

  onCommit: (percent: number) => void;

  pending?: boolean;

}) {

  const [focused, setFocused] = useState(false);

  const [draft, setDraft] = useState('');



  const displayValue = focused ? draft : String(percent);



  const commitDraft = useCallback(

    (raw: string) => {

      const normalized = normalizeContractConfigPercentInput(raw);

      setDraft(normalized);

      if (normalized === '') {

        onCommit(0);

        return;

      }

      const parsed = parseContractConfigPercentInput(normalized);

      if (parsed != null) onCommit(parsed);

    },

    [onCommit]

  );



  return (

    <label className="guild-field protocol-compose-split-field">

      {labelContent ?? <span>{label}</span>}

      <SuffixField

        value={displayValue}

        inputMode="numeric"

        onFocus={(event) => {

          setFocused(true);

          const current = String(percent);

          setDraft(current === '0' ? '' : current);

          event.currentTarget.select();

        }}

        onBlur={() => {

          if (draft === '') onCommit(0);

          setFocused(false);

          setDraft('');

        }}

        onValueChange={commitDraft}

        placeholder="0"

        aria-label={`${label} share percent`}

        suffix="%"

        disabled={pending}

      />

    </label>

  );

}



export function ProtocolComposeContractConfigFields({

  configOpId,

  onConfigOpChange,

  treasuryBps,

  onTreasuryBpsChange,

  seasonPoolBps,

  onSeasonPoolBpsChange,

  targetBps,

  onTargetBpsChange,

  burnBps,

  onBurnBpsChange,

  pending = false,

  zIndex,

}: {

  configOpId: ProtocolContractConfigOpId;

  onConfigOpChange: (value: ProtocolContractConfigOpId) => void;

  treasuryBps: string;

  onTreasuryBpsChange: (value: string) => void;

  seasonPoolBps: string;

  onSeasonPoolBpsChange: (value: string) => void;

  targetBps: string;

  onTargetBpsChange: (value: string) => void;

  burnBps: string;

  onBurnBpsChange: (value: string) => void;

  pending?: boolean;

  zIndex?: number;

}) {

  const [boostPoolInfoOpen, setBoostPoolInfoOpen] = useState(false);

  const infoZIndex = (zIndex ?? 90) + 10;



  const splitPercents = useMemo(

    () =>

      contractConfigSplitPercentsFromBpsStrings(

        treasuryBps,

        seasonPoolBps,

        targetBps,

        burnBps

      ),

    [burnBps, seasonPoolBps, targetBps, treasuryBps]

  );

  const setters = useMemo(

    () =>

      ({

        treasuryBps: onTreasuryBpsChange,

        seasonPoolBps: onSeasonPoolBpsChange,

        targetBps: onTargetBpsChange,

        burnBps: onBurnBpsChange,

      }) satisfies Record<ContractConfigSplitKey, (value: string) => void>,

    [

      onBurnBpsChange,

      onSeasonPoolBpsChange,

      onTargetBpsChange,

      onTreasuryBpsChange,

    ]

  );



  const applySplitPercents = useCallback(

    (nextPercents: ContractConfigSplitPercents) => {

      const nextBps = contractConfigSplitBpsStringsFromPercents(nextPercents);

      for (const key of CONTRACT_CONFIG_SPLIT_KEYS) {

        setters[key](nextBps[key]);

      }

    },

    [setters]

  );



  const commitPercent = useCallback(

    (key: ContractConfigSplitKey, parsed: number) => {

      applySplitPercents(

        setContractConfigSplitPercent(splitPercents, key, parsed)

      );

    },

    [applySplitPercents, splitPercents]

  );



  return (

    <>

      <div className="guild-field">

        <ChoiceDrawerField

          label="Setting"

          value={configOpId}

          options={PROTOCOL_CONTRACT_CONFIG_OPS.map(

            (op): ChoiceOption<ProtocolContractConfigOpId> => ({

              value: op.id,

              label: op.label,

            })

          )}

          onChange={onConfigOpChange}

          disabled={pending}

          persistSelected

          zIndex={zIndex}

        />

      </div>



      <div className="protocol-compose-split-block">

        <p className="protocol-picker-section-label">Routing split</p>

        <div className="protocol-compose-split-grid">

          {ROUTING_SPLIT_FIELDS.map(({ key, label }) => (

            <ProtocolComposeSplitPercentField

              key={key}

              label={label}

              labelContent={

                key === 'treasuryBps' ? (

                  <ProtocolComposeBoostPoolLabel

                    disabled={pending}

                    onOpenInfo={() => setBoostPoolInfoOpen(true)}

                  />

                ) : undefined

              }

              percent={splitPercents[key]}

              onCommit={(parsed) => commitPercent(key, parsed)}

              pending={pending}

            />

          ))}

        </div>

      </div>



      <ProtocolComposeBoostPoolInfoDrawer

        open={boostPoolInfoOpen}

        onClose={() => setBoostPoolInfoOpen(false)}

        zIndex={infoZIndex}

      />

    </>

  );

}


