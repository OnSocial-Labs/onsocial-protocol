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
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { zipSync } from 'fflate';
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
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36);
}

/** "cool-hat_v2.png" → "cool hat v2" */
function traitNameFromFile(file: File): string {
  return file.name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
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
}: GenerativeDropBuilderProps) {
  const [layers, setLayers] = useState<BuilderLayer[]>([
    { id: newId(), name: 'Background', optional: false, traits: [] },
  ]);
  const [supplyInput, setSupplyInput] = useState('100');
  const [status, setStatus] = useState<BuilderStatus>({ kind: 'idle' });
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const traitInputRef = useRef<HTMLInputElement>(null);
  const traitTargetLayerRef = useRef<string | null>(null);

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
  useEffect(() => {
    onDesignChange?.({ layers: readyLayerCount, traits: traitCount, working });
  }, [onDesignChange, readyLayerCount, traitCount, working]);

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
        const added = files.slice(0, room).map((file) => ({
          id: newId(),
          name: traitNameFromFile(file),
          weight: '1',
          file,
          url: URL.createObjectURL(file),
        }));
        return { ...layer, traits: [...layer.traits, ...added] };
      })
    );
  }, []);

  const removeTrait = useCallback((layerId: string, traitId: string) => {
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
    setLayers((prev) => {
      const target = prev.find((layer) => layer.id === layerId);
      target?.traits.forEach((trait) => URL.revokeObjectURL(trait.url));
      return prev.filter((layer) => layer.id !== layerId);
    });
  }, []);

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
                : `Rendering ${job.progress.done.toLocaleString()}/${job.progress.total.toLocaleString()} on our servers…`,
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

  return (
    <div className="gen-builder">
      <p className="gen-builder-hint">
        Layers paint in order — the first layer is the background, later layers
        stack on top. Use transparent PNGs so lower layers show through.
      </p>
      {layers.map((layer, layerIndex) => (
        <div key={layer.id} className="gen-layer-card">
          <div className="gen-layer-head">
            <input
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
                onClick={() => moveLayer(layer.id, -1)}
                disabled={working || layerIndex === 0}
                aria-label="Paint this layer earlier"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveLayer(layer.id, 1)}
                disabled={working || layerIndex === layers.length - 1}
                aria-label="Paint this layer later"
              >
                ↓
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
                  onClick={() => removeLayer(layer.id)}
                  disabled={working}
                  aria-label={`Remove layer ${layerIndex + 1}`}
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>

          {layer.traits.length > 0 ? (
            <div className="gen-trait-grid">
              {layer.traits.map((trait) => (
                <div key={trait.id} className="gen-trait-card">
                  <img src={trait.url} alt={trait.name} />
                  <input
                    value={trait.name}
                    onChange={(event) =>
                      updateTrait(layer.id, trait.id, {
                        name: event.target.value,
                      })
                    }
                    maxLength={32}
                    aria-label="Trait name"
                    disabled={working}
                  />
                  <div className="gen-trait-weight">
                    <input
                      value={trait.weight}
                      inputMode="decimal"
                      onChange={(event) =>
                        updateTrait(layer.id, trait.id, {
                          weight: event.target.value.replace(/[^\d.]/g, ''),
                        })
                      }
                      aria-label="Rarity weight"
                      disabled={working}
                    />
                    <button
                      type="button"
                      onClick={() => removeTrait(layer.id, trait.id)}
                      disabled={working}
                      aria-label={`Remove trait ${trait.name}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className="gen-add-traits"
            onClick={() => pickTraitFiles(layer.id)}
            disabled={working || layer.traits.length >= MAX_TRAITS_PER_LAYER}
          >
            {layer.traits.length > 0 ? 'Add more images' : 'Add trait images'}
          </button>
        </div>
      ))}

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
        <button
          type="button"
          className="gen-add-layer"
          onClick={addLayer}
          disabled={working}
        >
          Add layer
        </button>
      ) : null}

      <div className="guild-field">
        <span>Pieces to generate</span>
        <div className="drop-create-suffix-field">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={supplyInput}
            onChange={(event) =>
              setSupplyInput(event.target.value.replace(/[^\d]/g, ''))
            }
            placeholder="100"
            aria-label="Pieces to generate"
            disabled={working}
          />
          <span>pieces</span>
        </div>
        <small>
          {possible > 0
            ? supplyValid
              ? isRemoteSet
                ? `Big set — rendered on our servers (a few minutes). Keep this screen open while it runs.`
                : `${Math.min(possible, MAX_REMOTE_PIECES).toLocaleString()} unique pieces possible with these layers · higher weight = more common`
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

      <button
        type="button"
        className="gen-generate"
        onClick={() => void generate()}
        disabled={!canGenerate}
      >
        {working ? status.label : 'Generate & pin set'}
      </button>
    </div>
  );
}
