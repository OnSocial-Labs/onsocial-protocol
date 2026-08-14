'use client';

/**
 * Generative drop builder — layered art generator for variation drops.
 *
 * Creators stack transparent PNG/WebP layers (Background → Body → Hat …),
 * weight each trait's rarity, and pick a supply. Sets up to
 * `MAX_GENERATED_PIECES` are composited and zipped in the browser; larger
 * sets (up to 10k) upload only the layers + recipe and render on the
 * gateway, with progress polled while the creator waits. Either way the
 * pinned CIDs feed straight into the create-drop form.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type Ref,
} from 'react';
import { zipSync } from 'fflate';
import {
  ChevronDownIcon,
  MultiplyIcon,
  TrashIcon,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { SuffixField } from '@onsocial/ui';
import type {
  GenerateSetJob,
  GenerativeLayerSpec,
  VariationSetUpload,
} from '@onsocial/sdk';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import {
  comboAttributes,
  maxCombinations,
  sampleUniqueCombos,
  MAX_GENERATED_PIECES,
  type GenLayerInput,
} from './generative-set';

const MIN_PIECES = 2;
/** Above the in-browser cap, sets render server-side up to this ceiling. */
const MAX_REMOTE_PIECES = 10_000;
const MAX_LAYERS = 10;
const MAX_TRAITS_PER_LAYER = 30;
const PREVIEW_COUNT = 8;
const REMOTE_POLL_MS = 2_500;

interface BuilderTrait {
  id: string;
  name: string;
  weight: string;
  file: File;
  url: string;
}

interface BuilderLayer {
  id: string;
  name: string;
  optional: boolean;
  traits: BuilderTrait[];
}

type BuilderStatus =
  | { kind: 'idle' }
  | { kind: 'working'; label: string }
  | { kind: 'done' };

export interface BuilderDesignSummary {
  /** Layers that have at least one trait image. */
  layers: number;
  /** Trait images across all layers. */
  traits: number;
  /** True while rendering / uploading / pinning. */
  working: boolean;
  /** True when the design is complete enough to generate. */
  canGenerate: boolean;
  /** Progress line while working (e.g. "Rendering 40/100…"). */
  statusLabel: string | null;
}

/** Imperative surface so the host can put Generate in the screen header. */
export interface GenerativeBuilderHandle {
  generate: () => void;
}

export interface GeneratedSet {
  artCid: string;
  traitsCid: string;
  count: number;
  /** Object URLs of the first few composited pieces, for confirmation UI. */
  previews: string[];
}

interface GenerativeDropBuilderProps {
  disabled?: boolean;
  /** Pins both ZIP archives via the gateway; returns the directory CIDs. */
  upload: (imagesZip: Blob, traitsZip: Blob) => Promise<VariationSetUpload>;
  /** Starts a server-side render job (large sets — layers + recipe only). */
  remoteStart: (
    supply: number,
    layers: GenerativeLayerSpec[]
  ) => Promise<GenerateSetJob>;
  /** Polls a server-side render job for progress. */
  remotePoll: (jobId: string) => Promise<GenerateSetJob>;
  onGenerated: (result: GeneratedSet) => void;
  /** Reports design progress so the host can summarize the studio while it's hidden. */
  onDesignChange?: (design: BuilderDesignSummary) => void;
  /** Exposes {@link GenerativeBuilderHandle} for the host's header CTA. */
  ref?: Ref<GenerativeBuilderHandle>;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36);
}

function cryptoRand(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

function toGenLayers(layers: BuilderLayer[]): GenLayerInput[] {
  return layers.map((layer) => ({
    name: layer.name.trim() || 'Layer',
    noneWeight: layer.optional ? 1 : 0,
    traits: layer.traits.map((trait) => ({
      name: trait.name.trim() || 'Trait',
      weight: Number.parseFloat(trait.weight) || 0,
    })),
  }));
}

export function GenerativeDropBuilder({
  disabled,
  upload,
  remoteStart,
  remotePoll,
  onGenerated,
  onDesignChange,
  ref,
}: GenerativeDropBuilderProps) {
  const [layers, setLayers] = useState<BuilderLayer[]>([
    { id: newId(), name: 'Background', optional: false, traits: [] },
  ]);
  const [supplyInput, setSupplyInput] = useState('100');
  const [status, setStatus] = useState<BuilderStatus>({ kind: 'idle' });
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Which trait tile is open for name / weight editing. */
  const [editingTrait, setEditingTrait] = useState<{
    layerId: string;
    traitId: string;
  } | null>(null);
  const traitInputRef = useRef<HTMLInputElement>(null);
  const traitTargetLayerRef = useRef<string | null>(null);
  const traitNameInputRef = useRef<HTMLInputElement>(null);

  const working = status.kind === 'working';
  const supply = Number.parseInt(supplyInput, 10);
  const readyLayers = layers.filter((layer) => layer.traits.length > 0);
  const possible =
    readyLayers.length > 0 ? maxCombinations(toGenLayers(readyLayers)) : 0;
  const supplyValid =
    Number.isSafeInteger(supply) &&
    supply >= MIN_PIECES &&
    supply <= Math.min(MAX_REMOTE_PIECES, possible);
  const isRemoteSet = supplyValid && supply > MAX_GENERATED_PIECES;
  const canGenerate =
    !disabled && !working && readyLayers.length > 0 && supplyValid;

  const traitCount = layers.reduce(
    (sum, layer) => sum + layer.traits.length,
    0
  );
  const readyLayerCount = readyLayers.length;
  const statusLabel = status.kind === 'working' ? status.label : null;
  useEffect(() => {
    onDesignChange?.({
      layers: readyLayerCount,
      traits: traitCount,
      working,
      canGenerate,
      statusLabel,
    });
  }, [
    onDesignChange,
    readyLayerCount,
    traitCount,
    working,
    canGenerate,
    statusLabel,
  ]);

  const pickTraitFiles = useCallback((layerId: string) => {
    traitTargetLayerRef.current = layerId;
    traitInputRef.current?.click();
  }, []);

  const onTraitFiles = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const layerId = traitTargetLayerRef.current;
    if (!layerId || files.length === 0) return;

    for (const file of files) {
      if (!isPostImageMime(file.type) || file.type === 'image/jpeg') {
        setError('Use PNG or WebP layers — transparency is what stacks.');
        return;
      }
      if (file.size > POST_IMAGE_MAX_BYTES) {
        setError('Each layer image must be 5 MB or smaller.');
        return;
      }
    }

    setError(null);
    setLayers((prev) =>
      prev.map((layer) => {
        if (layer.id !== layerId) return layer;
        const room = MAX_TRAITS_PER_LAYER - layer.traits.length;
        const start = layer.traits.length;
        const added = files.slice(0, room).map((file, index) => ({
          id: newId(),
          // Stable defaults — export filenames (e.g. "Adobe Express") stay out.
          name: `Trait ${start + index + 1}`,
          weight: '1',
          file,
          url: URL.createObjectURL(file),
        }));
        return { ...layer, traits: [...layer.traits, ...added] };
      })
    );
  }, []);

  const removeTrait = useCallback((layerId: string, traitId: string) => {
    setEditingTrait((current) =>
      current?.layerId === layerId && current.traitId === traitId
        ? null
        : current
    );
    setLayers((prev) =>
      prev.map((layer) => {
        if (layer.id !== layerId) return layer;
        const removed = layer.traits.find((trait) => trait.id === traitId);
        if (removed) URL.revokeObjectURL(removed.url);
        return {
          ...layer,
          traits: layer.traits.filter((trait) => trait.id !== traitId),
        };
      })
    );
  }, []);

  const updateTrait = useCallback(
    (layerId: string, traitId: string, patch: Partial<BuilderTrait>) => {
      setLayers((prev) =>
        prev.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                traits: layer.traits.map((trait) =>
                  trait.id === traitId ? { ...trait, ...patch } : trait
                ),
              }
            : layer
        )
      );
    },
    []
  );

  const updateLayer = useCallback(
    (layerId: string, patch: Partial<BuilderLayer>) => {
      setLayers((prev) =>
        prev.map((layer) =>
          layer.id === layerId ? { ...layer, ...patch } : layer
        )
      );
    },
    []
  );

  const addLayer = useCallback(() => {
    setLayers((prev) =>
      prev.length >= MAX_LAYERS
        ? prev
        : [...prev, { id: newId(), name: '', optional: false, traits: [] }]
    );
  }, []);

  const removeLayer = useCallback((layerId: string) => {
    setEditingTrait((current) =>
      current?.layerId === layerId ? null : current
    );
    setLayers((prev) => {
      const target = prev.find((layer) => layer.id === layerId);
      target?.traits.forEach((trait) => URL.revokeObjectURL(trait.url));
      return prev.filter((layer) => layer.id !== layerId);
    });
  }, []);

  useEffect(() => {
    if (!editingTrait) return;
    traitNameInputRef.current?.focus();
  }, [editingTrait]);

  const moveLayer = useCallback((layerId: string, delta: -1 | 1) => {
    setLayers((prev) => {
      const index = prev.findIndex((layer) => layer.id === layerId);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= prev.length) return prev;
      const reordered = [...prev];
      [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
      return reordered;
    });
  }, []);

  const generate = useCallback(async () => {
    if (!canGenerate) return;
    setError(null);
    setPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });

    try {
      const activeLayers = readyLayers;
      const genLayers = toGenLayers(activeLayers);

      // Decode every trait image once, keyed by position in the layer list.
      setStatus({ kind: 'working', label: 'Loading layers…' });
      const bitmaps = await Promise.all(
        activeLayers.map((layer) =>
          Promise.all(
            layer.traits.map((trait) => createImageBitmap(trait.file))
          )
        )
      );

      const width = bitmaps[0][0].width;
      const height = bitmaps[0][0].height;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable in this browser.');

      const renderCombo = (combo: number[]): Promise<Blob> => {
        ctx.clearRect(0, 0, width, height);
        combo.forEach((traitIndex, layerIndex) => {
          if (traitIndex < 0) return;
          ctx.drawImage(bitmaps[layerIndex][traitIndex], 0, 0, width, height);
        });
        return new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (out) =>
              out ? resolve(out) : reject(new Error('Could not render PNG')),
            'image/png'
          );
        });
      };

      if (supply > MAX_GENERATED_PIECES) {
        // Server path: composite only sample previews locally, then ship the
        // layers + recipe to the gateway and poll the render job.
        const previewCombos = sampleUniqueCombos(
          genLayers,
          Math.min(PREVIEW_COUNT, supply),
          cryptoRand
        );
        const previewUrls: string[] = [];
        for (const combo of previewCombos) {
          previewUrls.push(URL.createObjectURL(await renderCombo(combo)));
        }
        bitmaps.flat().forEach((bitmap) => bitmap.close());
        setPreviews(previewUrls);

        setStatus({ kind: 'working', label: 'Uploading layers…' });
        let job = await remoteStart(
          supply,
          activeLayers.map((layer) => ({
            name: layer.name.trim() || 'Layer',
            noneWeight: layer.optional ? 1 : 0,
            traits: layer.traits.map((trait) => ({
              name: trait.name.trim() || 'Trait',
              weight: Number.parseFloat(trait.weight) || 0,
              image: trait.file,
            })),
          }))
        );

        while (job.state !== 'done' && job.state !== 'failed') {
          setStatus({
            kind: 'working',
            label:
              job.state === 'pinning'
                ? 'Pinning to IPFS…'
                : `Rendering ${job.progress.done.toLocaleString()}/${job.progress.total.toLocaleString()} on OnSocial…`,
          });
          await new Promise((resolve) => setTimeout(resolve, REMOTE_POLL_MS));
          job = await remotePoll(job.jobId);
        }
        if (job.state === 'failed' || !job.result?.reference) {
          throw new Error(job.error ?? 'Rendering the set failed — try again.');
        }

        setStatus({ kind: 'done' });
        onGenerated({
          artCid: job.result.variations.cid,
          traitsCid: job.result.reference.cid,
          count: job.result.variations.count,
          previews: previewUrls,
        });
        return;
      }

      // Local path: composite the full set in the browser and zip it.
      const combos = sampleUniqueCombos(genLayers, supply, cryptoRand);
      const artFiles: Record<string, Uint8Array> = {};
      const traitFiles: Record<string, Uint8Array> = {};
      const encoder = new TextEncoder();
      const previewUrls: string[] = [];

      for (let index = 0; index < combos.length; index += 1) {
        const combo = combos[index];
        const blob = await renderCombo(combo);
        artFiles[`${index + 1}.png`] = new Uint8Array(await blob.arrayBuffer());
        traitFiles[`${index + 1}.json`] = encoder.encode(
          JSON.stringify({ attributes: comboAttributes(genLayers, combo) })
        );
        if (previewUrls.length < PREVIEW_COUNT) {
          previewUrls.push(URL.createObjectURL(blob));
        }

        if (index % 5 === 4 || index === combos.length - 1) {
          setStatus({
            kind: 'working',
            label: `Rendering ${index + 1}/${combos.length}…`,
          });
          // Let the progress line paint between batches.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      bitmaps.flat().forEach((bitmap) => bitmap.close());
      setPreviews(previewUrls);

      setStatus({ kind: 'working', label: 'Pinning to IPFS…' });
      // PNGs are already compressed — store them; trait JSON compresses well.
      const imagesZip = new Blob([zipSync(artFiles, { level: 0 })], {
        type: 'application/zip',
      });
      const traitsZip = new Blob([zipSync(traitFiles)], {
        type: 'application/zip',
      });

      const pinned = await upload(imagesZip, traitsZip);
      if (!pinned.reference) {
        throw new Error('The gateway did not return a traits CID.');
      }

      setStatus({ kind: 'done' });
      onGenerated({
        artCid: pinned.variations.cid,
        traitsCid: pinned.reference.cid,
        count: pinned.variations.count,
        previews: previewUrls,
      });
    } catch (cause) {
      setStatus({ kind: 'idle' });
      setError(
        cause instanceof Error
          ? cause.message
          : 'Generating the set failed — try again.'
      );
    }
  }, [
    canGenerate,
    readyLayers,
    supply,
    upload,
    remoteStart,
    remotePoll,
    onGenerated,
  ]);

  useImperativeHandle(ref, () => ({ generate: () => void generate() }), [
    generate,
  ]);

  return (
    <div className="gen-builder">
      {layers.map((layer, layerIndex) => {
        const editing =
          editingTrait?.layerId === layer.id
            ? (layer.traits.find((t) => t.id === editingTrait.traitId) ?? null)
            : null;

        return (
          <div key={layer.id} className="guild-field gen-layer">
            <div className="gen-layer-head">
              <input
                className={osFieldBorderedClassName}
                value={layer.name}
                onChange={(event) =>
                  updateLayer(layer.id, { name: event.target.value })
                }
                placeholder={`Layer ${layerIndex + 1} — e.g. Background`}
                maxLength={32}
                aria-label={`Layer ${layerIndex + 1} name`}
                disabled={working}
              />
              <div className="gen-layer-tools">
                <button
                  type="button"
                  className="gen-tool"
                  onClick={() => moveLayer(layer.id, -1)}
                  disabled={working || layerIndex === 0}
                  aria-label="Paint this layer earlier"
                >
                  <ChevronDownIcon
                    className="gen-tool-icon is-up"
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  className="gen-tool"
                  onClick={() => moveLayer(layer.id, 1)}
                  disabled={working || layerIndex === layers.length - 1}
                  aria-label="Paint this layer later"
                >
                  <ChevronDownIcon className="gen-tool-icon" aria-hidden />
                </button>
                <button
                  type="button"
                  className={`os-surface-chip${layer.optional ? ' is-selected' : ''}`}
                  onClick={() =>
                    updateLayer(layer.id, { optional: !layer.optional })
                  }
                  disabled={working}
                >
                  Optional
                </button>
                {layers.length > 1 ? (
                  <button
                    type="button"
                    className="gen-tool"
                    onClick={() => removeLayer(layer.id)}
                    disabled={working}
                    aria-label={`Remove layer ${layerIndex + 1}`}
                  >
                    <TrashIcon className="gen-tool-icon" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>

            {layer.traits.length > 0 ? (
              <div
                className="gen-trait-grid"
                role="listbox"
                aria-label={`${layer.name || `Layer ${layerIndex + 1}`} traits`}
              >
                {layer.traits.map((trait) => {
                  const selected = editing?.id === trait.id;
                  return (
                    <div
                      key={trait.id}
                      className={`gen-trait-tile${selected ? ' is-selected' : ''}`}
                      role="option"
                      aria-selected={selected}
                    >
                      <button
                        type="button"
                        className="gen-trait-tile-hit"
                        disabled={working}
                        aria-label={`Edit ${trait.name}`}
                        onClick={() =>
                          setEditingTrait(
                            selected
                              ? null
                              : { layerId: layer.id, traitId: trait.id }
                          )
                        }
                      >
                        <img src={trait.url} alt="" />
                        <span className="gen-trait-weight-badge">
                          {trait.weight || '1'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="gen-trait-remove"
                        disabled={working}
                        aria-label={`Remove ${trait.name}`}
                        onClick={() => removeTrait(layer.id, trait.id)}
                      >
                        <MultiplyIcon className="gen-tool-icon" aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {editing ? (
              <div className="gen-trait-edit">
                <input
                  className={osFieldBorderedClassName}
                  ref={traitNameInputRef}
                  value={editing.name}
                  onChange={(event) =>
                    updateTrait(layer.id, editing.id, {
                      name: event.target.value,
                    })
                  }
                  maxLength={32}
                  placeholder="Trait name"
                  aria-label="Trait name"
                  disabled={working}
                />
                <SuffixField
                  className="gen-trait-weight-field"
                  value={editing.weight}
                  inputMode="decimal"
                  onValueChange={(value) =>
                    updateTrait(layer.id, editing.id, {
                      weight: value.replace(/[^\d.]/g, ''),
                    })
                  }
                  aria-label="Rarity weight"
                  suffix="weight"
                  disabled={working}
                />
              </div>
            ) : null}

            <div
              className="app-storage-presets"
              role="group"
              aria-label={`Layer ${layerIndex + 1} actions`}
            >
              <button
                type="button"
                className="os-surface-chip"
                onClick={() => pickTraitFiles(layer.id)}
                disabled={
                  working || layer.traits.length >= MAX_TRAITS_PER_LAYER
                }
              >
                {layer.traits.length > 0
                  ? 'Add more images'
                  : 'Add trait images'}
              </button>
            </div>
          </div>
        );
      })}

      <input
        ref={traitInputRef}
        type="file"
        accept="image/png,image/webp"
        multiple
        className="scarce-cover-file-input"
        tabIndex={-1}
        aria-hidden
        onChange={onTraitFiles}
      />

      {layers.length < MAX_LAYERS ? (
        <div className="app-storage-presets" role="group" aria-label="Layers">
          <button
            type="button"
            className="os-surface-chip"
            onClick={addLayer}
            disabled={working}
          >
            Add layer
          </button>
        </div>
      ) : null}

      <div className="guild-field">
        <span>Pieces to generate</span>
        <SuffixField
          value={supplyInput}
          onValueChange={(value) =>
            setSupplyInput(value.replace(/[^\d]/g, ''))
          }
          placeholder="100"
          aria-label="Pieces to generate"
          suffix="pieces"
          disabled={working}
        />
        <small>
          {possible > 0
            ? supplyValid
              ? isRemoteSet
                ? `Big set — rendered on OnSocial (a few minutes). Keep this screen open while it runs.`
                : `${Math.min(possible, MAX_REMOTE_PIECES).toLocaleString()} unique pieces possible with these layers · higher weight = more common · tap a tile to rename`
              : `Pick ${MIN_PIECES}–${Math.min(possible, MAX_REMOTE_PIECES).toLocaleString()} pieces — that's the most unique combinations these layers allow.`
            : 'Add trait images to each layer to unlock generating.'}
        </small>
      </div>

      {previews.length > 0 ? (
        <div className="gen-preview-grid" aria-label="Generated previews">
          {previews.map((src, index) => (
            <img key={src} src={src} alt={`Generated piece ${index + 1}`} />
          ))}
        </div>
      ) : null}

      {error ? <p className="guild-form-error">{error}</p> : null}

      {working ? (
        <p className="gen-progress-note" role="status">
          {status.label}
        </p>
      ) : null}
    </div>
  );
}
