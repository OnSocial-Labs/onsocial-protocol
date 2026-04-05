/**
 * In-card divider tier system — 3 semantic opacities for consistent visual hierarchy.
 *
 * Tier        Opacity   Purpose
 * ─────────── ──────── ──────────────────────────────────────────────
 * section     /40       Major card sections: headers, footers, action areas
 * detail      /25       Sub-sections: metadata grids, form groups, panels
 * item        /15       Individual rows: DL items, list entries
 *
 * Floating-panel dividers keep their own /35 tier (see floating-panel.ts).
 *
 * Standard spacing pairs (contextual — pick the one that fits the card density):
 *   sm   mt-3 pt-3 / pb-3
 *   md   mt-4 pt-4 / pb-4
 *   lg   mt-6 pt-6 / pb-5
 *
 * ── Usage ──────────────────────────────────────────────────────────
 *
 * Border on a content section:
 *   <div className={`border-t ${cardDividerSection} mt-4 pt-4`}>
 *
 * Standalone separator element:
 *   <div className={cardSeparatorSection} />
 *
 * List container:
 *   <ul className={cardDividerListSection}>
 */

/* ── section tier (/40) ─────────────────────────────────────────── */
export const cardDividerSection = 'border-fade-section';
export const cardSeparatorSection = 'h-px divider-section';
export const cardDividerListSection = 'divide-fade-section';

/* ── detail tier (/25) ──────────────────────────────────────────── */
export const cardDividerDetail = 'border-fade-detail';
export const cardSeparatorDetail = 'h-px divider-detail';
export const cardDividerListDetail = 'divide-fade-detail';

/* ── item tier (/15) ────────────────────────────────────────────── */
export const cardDividerItem = 'border-fade-item';
export const cardDividerListItem = 'divide-fade-item';
