// Render every mood as an SVG to ./preview/ for design iteration.
// Usage: pnpm preview
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTextCardSvg } from '../src/generator.js';
import { MOODS, type MoodKey } from '../src/themes.js';
import { MARK_SHAPES, MARK_COLORS } from '../src/generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'preview');
mkdirSync(outDir, { recursive: true });

const sample = {
  short: 'Build the thing you wish existed.',
  medium:
    'A scarce text-card is a quote tweet that someone paid to make permanent.',
  long: 'The best ideas feel obvious after you hear them. Until then they sound like nonsense, or worse, like everybody already knew.',
  // ~190 chars — exercises the auto-shrink ladder (44 → 38 → 32 → 28).
  longest:
    'The best ideas always feel obvious in retrospect, but until you hear them spoken aloud they sound like nonsense, or worse, like everybody on earth had already figured it out years ago.',
};

const creators = {
  alice: { accountId: 'alice.near', displayName: 'Alice' },
  bob: { accountId: 'bob.testnet', displayName: 'Bob Builder' },
  longHandle: {
    accountId: 'someone-with-a-very-long-handle.near',
    displayName: 'Long Name McLongface',
  },
};

const samples: Array<[string, string, keyof typeof creators]> = [
  ['short', sample.short, 'alice'],
  ['medium', sample.medium, 'bob'],
  ['long', sample.long, 'longHandle'],
];

for (const moodKey of Object.keys(MOODS) as MoodKey[]) {
  // Receipt is a layout (short claim + photo). Skip from the generic
  // catalog; it gets its own showcase below with the photo present.
  if (moodKey.startsWith('receipt-')) continue;
  for (const [label, title, creatorKey] of samples) {
    const svg = generateTextCardSvg({
      title,
      creator: creators[creatorKey],
      theme: { bg: moodKey },
    });
    const file = join(outDir, `${moodKey}-${label}.svg`);
    writeFileSync(file, svg, 'utf-8');
  }
}

// ── Showcase: modern type moods (display + journal) ────────────────────
// Same titles, side-by-side, to highlight the typographic difference.
const modernSamples: Array<[string, string]> = [
  ['display-statement', 'Make something people can\u2019t un-see.'],
  ['display-question', 'What if the feed was permanent?'],
  ['display-truth', 'Boring code. Interesting product.'],
  ['journal-quote', 'The best ideas feel obvious afterwards.'],
  ['journal-confession', 'I keep rewriting the same essay.'],
  ['journal-note', 'Permanence changes what you\u2019re willing to say.'],
];
for (const [name, title] of modernSamples) {
  const moodKey: MoodKey = name.startsWith('display')
    ? 'display-light'
    : 'journal-light';
  const svg = generateTextCardSvg({
    title,
    creator: creators.alice,
    theme: { bg: moodKey },
  });
  writeFileSync(join(outDir, `modern-${name}.svg`), svg, 'utf-8');
}

// ── Customisation showcase ──────────────────────────────────────────────
// One row per knob, demonstrating the variants on the default mood.
const customisation: Array<
  [string, string, Parameters<typeof generateTextCardSvg>[0]]
> = [
  // Mark shapes — same content, four different ornaments.
  ...MARK_SHAPES.map(
    (shape) =>
      [
        `shape-${shape}`,
        `Shape: ${shape}`,
        {
          title: 'A small mark, four moods.',
          creator: creators.alice,
          theme: { bg: 'serif-night' as MoodKey, markShape: shape },
        },
      ] as [string, string, Parameters<typeof generateTextCardSvg>[0]]
  ),
  // Mark colours — first six of the named palette.
  ...MARK_COLORS.slice(0, 6).map(
    (color) =>
      [
        `color-${color}`,
        `Color: ${color}`,
        {
          title: 'Lock the colour to make it yours.',
          creator: creators.alice,
          theme: { bg: 'serif-light' as MoodKey, markColor: color },
        },
      ] as [string, string, Parameters<typeof generateTextCardSvg>[0]]
  ),
  // Title alignment — left vs centre.
  [
    'align-left',
    'Align: left (default)',
    {
      title: 'Left-anchored, editorial.',
      creator: creators.alice,
      theme: { bg: 'serif-night' as MoodKey, titleAlign: 'left' },
    },
  ],
  [
    'align-center',
    'Align: center',
    {
      title: 'Centred, like a poem.',
      creator: creators.alice,
      theme: { bg: 'serif-night' as MoodKey, titleAlign: 'center' },
    },
  ],
  // Emoji handling.
  [
    'emoji-mixed',
    'Emoji: mixed',
    {
      title: '🔥 Hot take: 🚀 ship it 🚢 anyway.',
      creator: { accountId: 'alice.near', displayName: 'Alice 👋' },
      theme: { bg: 'serif-light' as MoodKey },
    },
  ],
  [
    'emoji-zwj',
    'Emoji: ZWJ sequence',
    {
      title: 'pride 🏳️‍🌈 always — never split a grapheme.',
      creator: creators.alice,
      theme: { bg: 'serif-dusk' as MoodKey },
    },
  ],
];
for (const [name, , opts] of customisation) {
  const svg = generateTextCardSvg(opts);
  writeFileSync(join(outDir, `custom-${name}.svg`), svg, 'utf-8');
}

// ── Long-text auto-shrink showcase ───────────────────────────────────────
// Same long body across moods so the size ladder is visible.
const longRows: Array<[string, MoodKey]> = [
  ['serif-night', 'serif-night'],
  ['serif-light', 'serif-light'],
  ['display-light', 'display-light'],
  ['journal-light', 'journal-light'],
];
for (const [name, mood] of longRows) {
  const svg = generateTextCardSvg({
    title: sample.longest,
    creator: creators.alice,
    theme: { bg: mood },
  });
  writeFileSync(join(outDir, `longtext-${name}.svg`), svg, 'utf-8');
}

// ── Receipt mood showcase ────────────────────────────────────────
// The killer mint-from-post format: short claim + photo as proof.
// Tiny inline data: URI — a soft purple square — stands in for the
// post media so the preview has zero network deps. In production the
// gateway resolves a CID via `gatewayUrl()` and passes the https URL.
const stubPhoto =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C5CFF"/><stop offset="1" stop-color="#EC4899"/></linearGradient></defs><rect width="220" height="220" fill="url(#p)"/></svg>'
  );
const receiptRows: Array<[string, string]> = [
  ['shipped', 'Shipped.'],
  ['sold-out', 'Sold out in 4 hours.'],
  ['day-100', 'Day 100.'],
  ['first-customer', 'First customer.'],
];
for (const [name, title] of receiptRows) {
  const svg = generateTextCardSvg({
    title,
    creator: creators.alice,
    theme: { bg: 'receipt-light' },
    photo: stubPhoto,
  });
  writeFileSync(join(outDir, `receipt-light-${name}.svg`), svg, 'utf-8');
}

// Receipt — Night: dark slate variant. Same proof format, ship-log mood.
const receiptNightRows: Array<[string, string]> = [
  ['merged', 'Merged at 2am.'],
  ['k', '$10K MRR.'],
  ['greenboard', 'All green.'],
  ['launched', 'Launched.'],
];
for (const [name, title] of receiptNightRows) {
  const svg = generateTextCardSvg({
    title,
    creator: creators.alice,
    theme: { bg: 'receipt-night' },
    photo: stubPhoto,
  });
  writeFileSync(join(outDir, `receipt-night-${name}.svg`), svg, 'utf-8');
}

// Receipt — Noir: matte black variant. Movie-poster weight.
const receiptNoirRows: Array<[string, string]> = [
  ['signed', 'Signed.'],
  ['done', 'Done.'],
  ['won', 'Won.'],
  ['final-cut', 'Final cut.'],
];
for (const [name, title] of receiptNoirRows) {
  const svg = generateTextCardSvg({
    title,
    creator: creators.alice,
    theme: { bg: 'receipt-noir' },
    photo: stubPhoto,
  });
  writeFileSync(join(outDir, `receipt-noir-${name}.svg`), svg, 'utf-8');
}

// Receipt — Dusk: indigo-violet variant. Moody, after-hours.
const receiptDuskRows: Array<[string, string]> = [
  ['quiet-win', 'Quiet win.'],
  ['late', 'Late wins.'],
  ['done', 'Done, finally.'],
  ['shipped-friday', 'Shipped on Friday.'],
];
for (const [name, title] of receiptDuskRows) {
  const svg = generateTextCardSvg({
    title,
    creator: creators.alice,
    theme: { bg: 'receipt-dusk' },
    photo: stubPhoto,
  });
  writeFileSync(join(outDir, `receipt-dusk-${name}.svg`), svg, 'utf-8');
}

// Also generate a side-by-side HTML index for quick browsing.
// Receipt is excluded from the generic catalog (it has its own showcase).
const moodKeys = (Object.keys(MOODS) as MoodKey[]).filter(
  (m) => !m.startsWith('receipt-')
);
const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>text-card preview</title>
<style>
  body { background: #1a1a1a; color: #eee; font-family: system-ui, sans-serif; margin: 0; padding: 32px; }
  h1 { font-weight: 400; letter-spacing: 0.5px; margin: 0 0 8px; }
  p.sub { color: #888; margin: 0 0 32px; }
  h2 { margin: 48px 0 16px; font-weight: 500; text-transform: capitalize; color: #fff; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .card { background: #000; border-radius: 12px; overflow: hidden; }
  .card img { width: 100%; display: block; }
  .label { padding: 8px 12px; font-size: 12px; color: #888; }
</style></head><body>
<h1>OnSocial — text-card preview</h1>
<p class="sub">6 voices × 4 palettes = 24 standard moods, plus the Matrix bonus and a Receipt format (short claim + photo as proof) in 4 finishes. Each user gets their own deterministic signature colour.</p>
${moodKeys
  .map(
    (
      m
    ) => `<h2>${MOODS[m].label} — <span style="color:#888;font-weight:400;font-size:14px">${MOODS[m].description}</span></h2>
<div class="grid">
${samples
  .map(
    ([label]) =>
      `<div class="card"><img src="${m}-${label}.svg" alt=""/><div class="label">${label}</div></div>`
  )
  .join('\n')}
</div>`
  )
  .join('\n')}

<h2 style="margin-top:64px">Modern type — display & journal</h2>
<p class="sub" style="margin-bottom:24px">Same single-line "Name · @handle" byline, two new typographic voices: <strong>display</strong> (modern geometric sans — Inter / SF Pro Display) and <strong>journal</strong> (modern editorial serif — Newsreader / Source Serif). Real fonts on real devices; system fallbacks elsewhere.</p>
<div class="grid">
${modernSamples
  .map(
    ([name, title]) =>
      `<div class="card"><img src="modern-${name}.svg" alt=""/><div class="label">${name.split('-')[0]} — ${title.replace(/[<>]/g, '')}</div></div>`
  )
  .join('\n')}
</div>

<h2 style="margin-top:64px">Long titles — auto-shrink ladder</h2>
<p class="sub" style="margin-bottom:24px">~190-char title across four moods. The generator tries 44 → 38 → 32 → 28px and picks the largest that fits in 6 lines without truncating. Below 28px it truncates and the full text is preserved in NFT metadata.</p>
<div class="grid">
${longRows
  .map(
    ([name]) =>
      `<div class="card"><img src="longtext-${name}.svg" alt=""/><div class="label">${name} — auto-shrunk</div></div>`
  )
  .join('\n')}
</div>

<h2 style="margin-top:64px">Receipt — short claim + photo as proof</h2>
<p class="sub" style="margin-bottom:24px">The killer mint-from-post format. Permanent receipts for milestones, wins, evidence. Hard 60-char headline cap (the SDK throws past that). Photo is the hero of the bottom half — 220×220, anchored to the same left column as the title. <code>os.scarces.fromPost.mintReceipt(post)</code>.</p>
<div class="grid">
${receiptRows
  .map(
    ([name, title]) =>
      `<div class="card"><img src="receipt-light-${name}.svg" alt=""/><div class="label">receipt-light — ${title.replace(/[<>]/g, '')}</div></div>`
  )
  .join('\n')}
</div>

<h2 style="margin-top:64px">Receipt — Night</h2>
<p class="sub" style="margin-bottom:24px">Same format, deep navy. For ship-logs, late-night merges, terminal screenshots. Pass <code>{ palette: 'night' }</code> to <code>mintReceipt()</code> or <code>cardBg: 'receipt-night'</code> directly.</p>
<div class="grid">
${receiptNightRows
  .map(
    ([name, title]) =>
      `<div class="card"><img src="receipt-night-${name}.svg" alt=""/><div class="label">receipt-night — ${title.replace(/[<>]/g, '')}</div></div>`
  )
  .join('\n')}
</div>

<h2 style="margin-top:64px">Receipt — Noir</h2>
<p class="sub" style="margin-bottom:24px">Same format, matte black. The photo POPs harder than on slate — closer to a movie poster than a notice. Pass <code>{ palette: 'noir' }</code> or <code>cardBg: 'receipt-noir'</code>.</p>
<div class="grid">
${receiptNoirRows
  .map(
    ([name, title]) =>
      `<div class="card"><img src="receipt-noir-${name}.svg" alt=""/><div class="label">receipt-noir — ${title.replace(/[<>]/g, '')}</div></div>`
  )
  .join('\n')}
</div>

<h2 style="margin-top:64px">Receipt — Dusk</h2>
<p class="sub" style="margin-bottom:24px">Same format, indigo-violet. Moody, after-hours. Pass <code>{ palette: 'dusk' }</code> or <code>cardBg: 'receipt-dusk'</code>.</p>
<div class="grid">
${receiptDuskRows
  .map(
    ([name, title]) =>
      `<div class="card"><img src="receipt-dusk-${name}.svg" alt=""/><div class="label">receipt-dusk — ${title.replace(/[<>]/g, '')}</div></div>`
  )
  .join('\n')}
</div>

<h2>Customisation — three small knobs + emoji handling</h2>
<div class="grid">
${customisation
  .map(
    ([name, label]) =>
      `<div class="card"><img src="custom-${name}.svg" alt=""/><div class="label">${label}</div></div>`
  )
  .join('\n')}
</div>
</body></html>`;
writeFileSync(join(outDir, 'index.html'), html, 'utf-8');

console.log(
  `✓ wrote ${moodKeys.length * samples.length + customisation.length + modernSamples.length + longRows.length + receiptRows.length + receiptNightRows.length + receiptNoirRows.length + receiptDuskRows.length} SVGs + index.html to ${outDir}`
);
console.log(`  open: file://${join(outDir, 'index.html')}`);
