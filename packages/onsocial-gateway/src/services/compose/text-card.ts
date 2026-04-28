// Backwards-compatible re-export. The canonical generator + theme catalog
// lives in `@onsocial/text-card` so the same code renders authoritatively
// in the gateway and identically in client UIs (live preview).
export { generateTextCardSvg, type TextCardOptions } from '@onsocial/text-card';
