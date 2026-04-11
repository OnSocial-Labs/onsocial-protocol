const TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    accent: 'green' as const,
    rate: '60 /min',
    depth: '3',
    complexity: '50',
    rows: '100',
    aggregations: false,
    cta: 'Request API key',
    ctaHref: 'mailto:build@onsocial.id?subject=OnAPI%20Free%20Tier',
    ctaClass: 'portal-green-surface',
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/mo',
    accent: 'blue' as const,
    rate: '600 /min',
    depth: '8',
    complexity: '1,000',
    rows: '10,000',
    aggregations: true,
    cta: 'Contact us',
    ctaHref: 'mailto:build@onsocial.id?subject=OnAPI%20Pro%20Tier',
    ctaClass: 'portal-blue-surface',
  },
  {
    name: 'Scale',
    price: '$199',
    period: '/mo',
    accent: 'purple' as const,
    rate: '3,000 /min',
    depth: '12',
    complexity: '5,000',
    rows: '50,000',
    aggregations: true,
    cta: 'Contact us',
    ctaHref: 'mailto:build@onsocial.id?subject=OnAPI%20Scale%20Tier',
    ctaClass: 'portal-purple-surface',
  },
];

const accentColor = {
  green: '#4ade80',
  blue: '#60a5fa',
  purple: '#c084fc',
  slate: '#6b7280',
};

const PROTOCOL_ITEMS = [
  {
    eyebrow: 'Identity',
    description: 'Shared profiles and social state — portable across dApps.',
    proof: [
      'One profile across every app',
      'Posts, follows, and social feeds',
      'Permissioned data access for dApps',
    ],
    accent: 'blue' as const,
    icon: 'M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zm10 0a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6zM4 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2zm10 0a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2z',
  },
  {
    eyebrow: 'Communities',
    description: 'Groups, roles, and proposals — reusable community state.',
    proof: [
      'DAOs, clubs, and creator groups',
      'Proposals with voting and auto-execution',
      'Shared membership across dApps',
    ],
    accent: 'purple' as const,
    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  },
  {
    eyebrow: 'Scarces',
    description:
      'Digital goods with programmable sale, auction, and royalty rules.',
    proof: [
      'Storefronts with collections and drops',
      'Auctions, offers, and buy-now listings',
      'Subscriptions and redeemable passes',
    ],
    accent: 'green' as const,
    icon: 'M12 20.5c-4.56-3.44-8-6.5-8-9.5C4 7.46 7.13 4.5 11 4.5c1 0 2 .19 3 .5h6v10l-2.5 2.5L15 16l-3 4.5z',
  },
  {
    eyebrow: 'Execution',
    description: 'Gasless transactions and flexible auth paths for dApps.',
    proof: [
      'Zero-gas onboarding for new users',
      'Telegram bots and web apps',
      'Any auth model — keys, JWTs, or meta-tx',
    ],
    accent: 'slate' as const,
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  },
];


const ENDPOINTS = [
  { method: 'POST', path: '/graph/query', desc: 'Query social data via GraphQL' },
  { method: 'POST', path: '/relay/execute', desc: 'Gasless transaction relay' },
  { method: 'POST', path: '/storage/upload', desc: 'Upload files to IPFS' },
  { method: 'GET', path: '/storage/:cid', desc: 'Retrieve stored content' },
  { method: 'POST', path: '/compose/mint', desc: 'Mint digital assets' },
  { method: 'GET', path: '/data/get', desc: 'Read on-chain key-value data' },
];

/* The OnSocial logo SVG — same path as portal BrandLogo */
function Logo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 672 672"
      role="img"
      aria-label="OnSocial"
      className={className}
    >
      <path
        fill="currentColor"
        d="M453.054199,538.116394 C424.212219,552.454224 394.131012,560.710876 362.363831,563.429443 C319.568481,567.091614 278.488464,560.290955 239.667847,542.439819 C185.179367,517.383972 145.979202,477.603943 125.990204,420.059631 C115.325256,389.357452 109.737495,357.978973 110.886894,325.466003 C112.150772,289.714844 122.072670,256.289429 138.365387,224.647644 C157.224594,188.021500 184.527512,159.193527 219.773529,138.007156 C244.278748,123.277077 270.817993,114.075600 298.974548,108.784660 C341.531128,100.787796 382.974304,105.125610 423.509552,118.946007 C453.518707,129.177551 479.907959,145.697281 502.869781,167.809280 C537.542175,201.198380 558.431213,242.015503 567.606873,288.736755 C574.762390,325.171814 572.982422,361.656128 563.017517,397.545685 C555.820374,423.466644 538.791077,440.538727 514.386902,450.962769 C491.261505,460.840546 467.270874,466.425293 442.065002,465.954193 C434.599792,465.814697 427.083160,465.339539 419.754333,463.567108 C418.160675,463.181732 416.246185,462.981476 415.769653,461.053741 C415.239075,458.907288 417.247040,458.253723 418.554749,457.399170 C434.696106,446.851044 449.398499,434.691925 461.222870,419.322357 C483.312408,390.609772 492.769470,358.103027 490.268372,322.045715 C488.222534,292.551147 478.921112,265.627350 460.828461,242.130569 C437.349548,211.638809 406.488159,192.282272 368.498810,186.569107 C305.881348,177.152176 254.525299,197.030853 217.490723,249.519241 C204.619537,267.761353 197.797958,288.680939 194.607224,310.738922 C189.230255,347.910645 195.277863,383.104126 215.771667,414.679199 C241.164551,453.802399 277.282227,476.512482 324.274078,480.990601 C339.539185,482.445282 354.521393,481.131104 369.360352,477.661682 C373.931732,476.592834 378.305237,477.367828 382.686493,478.255981 C402.303589,482.232758 421.996246,485.156525 442.112427,485.159485 C464.881989,485.162872 486.715454,480.243073 508.347870,473.898468 C514.099670,472.211517 519.779480,470.280670 525.507568,468.510834 C527.231018,467.978363 529.242371,467.065338 530.591370,468.871613 C531.983276,470.735352 530.376526,472.323120 529.343567,473.781311 C517.793030,490.086395 503.945221,504.147552 488.044739,516.239075 C477.141937,524.530151 465.760498,532.023010 453.054199,538.116394 z"
      />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <a href="/" className="flex items-center gap-2.5">
            <Logo className="h-6 w-6 text-foreground" />
            <span className="text-sm font-semibold tracking-tight">
              OnSocial Labs
            </span>
          </a>
          <div className="flex items-center gap-5">
            <a
              href="#pricing"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </a>
            <a
              href="#api"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              API
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative flex min-h-[64vh] items-center justify-center overflow-hidden pt-20 md:min-h-[72vh] md:pt-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 50% 30%, rgba(74,222,128,0.10), transparent 32%), radial-gradient(circle at 70% 20%, rgba(96,165,250,0.08), transparent 26%)',
          }}
        />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4">
          <div className="mx-auto max-w-3xl space-y-6 text-center md:space-y-7">
            <div className="relative mx-auto flex w-fit max-w-full flex-col items-center">
              <h1 className="relative max-w-full text-[3rem] font-bold leading-[0.92] tracking-[-0.05em] sm:text-5xl md:text-7xl lg:text-[5.5rem]">
                Build on the{' '}
                <span className="portal-green-text">Graph.</span>
              </h1>
              <div className="pointer-events-none relative mt-5 h-3 w-[calc(100%-1rem)] max-w-[44rem] opacity-60 sm:w-[calc(100%-1.5rem)]">
                <div
                  className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent 0%, rgba(107,114,128,0.16) 12%, rgba(96,165,250,0.24) 46%, rgba(74,222,128,0.26) 54%, rgba(107,114,128,0.16) 88%, transparent 100%)',
                    boxShadow: '0 0 14px rgba(96,165,250,0.1)',
                  }}
                />
                <div
                  className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 opacity-45"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 30%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0.22) 70%, transparent 100%)',
                  }}
                />
              </div>
            </div>

            <div className="mx-auto max-w-2xl">
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                <span className="block">
                  A single API for social data, gasless transactions, and
                  decentralized storage.
                </span>
                <span className="mt-1 block">Ship faster with managed infrastructure.</span>
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <a
                href="mailto:build@onsocial.id?subject=OnAPI%20API%20Key"
                className="portal-green-surface rounded-xl border px-6 py-2.5 text-sm font-semibold"
              >
                Request your API key
              </a>
              <a
                href="#api"
                className="rounded-xl border border-border/50 px-6 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-border hover:text-foreground"
              >
                View endpoints
              </a>
            </div>
          </div>

          {/* Quick start snippet */}
          <div className="mx-auto mt-14 max-w-2xl">
            <div className="glass-panel p-5">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Quick start
              </p>
              <pre className="overflow-x-auto text-xs leading-relaxed">
                <code className="text-muted-foreground">
                  <span className="portal-green-text">curl</span>
                  {' -X POST https://api.onsocial.id/graph/query \\\n'}
                  {'  -H "Content-Type: application/json" \\\n'}
                  {'  -H "X-API-Key: '}
                  <span className="portal-blue-text">YOUR_KEY</span>
                  {'" \\\n'}
                  {'  -d \'{"query": "{ reputationScores(limit: 5) { accountId reputation rank } }"}\''}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── Protocol ──────────────────────────────────────── */}
      <section className="px-4 py-16">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="mb-5 text-center text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Protocol
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {PROTOCOL_ITEMS.map((item) => (
              <div
                key={item.eyebrow}
                className="glass-panel"
                style={{
                  '--_accent-border': `color-mix(in srgb, ${accentColor[item.accent]} 35%, transparent)`,
                  '--_accent-shadow': `color-mix(in srgb, ${accentColor[item.accent]} 20%, transparent)`,
                } as React.CSSProperties}
              >
                <div className="flex flex-col items-center text-center gap-3 px-5 py-6 lg:px-6 lg:py-8">
                  <div className="space-y-1">
                    <span
                      className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]"
                      style={{ color: accentColor[item.accent] }}
                    >
                      <svg
                        className="shrink-0 overflow-visible"
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={item.icon} />
                      </svg>
                      {item.eyebrow}
                    </span>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>

                  <ul className="space-y-1.5 text-left w-full max-w-xs">
                    {item.proof.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                      >
                        <span
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: accentColor[item.accent] }}
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="px-4 py-16">
        <div className="mx-auto w-full max-w-6xl">
          {/* Header glow */}
          <div className="relative mb-8 py-3 text-center">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-75 blur-3xl"
              style={{
                background:
                  'radial-gradient(circle at 24% 18%, rgb(74 222 128 / 0.14), transparent 36%), radial-gradient(circle at 52% 20%, rgb(96 165 250 / 0.18), transparent 34%), radial-gradient(circle at 80% 24%, rgb(192 132 252 / 0.16), transparent 32%)',
              }}
            />
            <span className="relative inline-block rounded-full border border-border/50 bg-background/40 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] portal-blue-text">
              Access Tiers
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier.name} className="glass-panel overflow-hidden">
                <div className="px-5 pt-5 pb-1 md:px-6 md:pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3
                      className="text-lg font-bold tracking-[-0.02em]"
                      style={{ color: accentColor[tier.accent] }}
                    >
                      {tier.name}
                    </h3>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-bold tracking-[-0.03em]">
                      {tier.price}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {tier.period}
                    </span>
                  </div>
                </div>

                {/* Stat strip — Rate / Depth / Complexity */}
                <div className="mt-2">
                  <div className="divider-section h-px w-full" />
                  <div className="stat-strip">
                    {[
                      { label: 'Rate', value: tier.rate },
                      { label: 'Depth', value: tier.depth },
                      { label: 'Complexity', value: tier.complexity },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="stat-cell"
                        style={{ width: 'calc(100% / 3)' }}
                      >
                        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          {s.label}
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-semibold">
                          {s.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="divider-section h-px w-full" />
                </div>

                {/* Stat strip — Rows / Aggregations */}
                <div>
                  <div className="stat-strip">
                    <div
                      className="stat-cell"
                      style={{ width: '50%' }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Rows
                      </p>
                      <p className="mt-0.5 font-mono text-sm font-semibold">
                        {tier.rows}
                      </p>
                    </div>
                    <div
                      className="stat-cell"
                      style={{ width: '50%' }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Aggregations
                      </p>
                      <p
                        className="mt-0.5 text-sm font-semibold"
                        style={{
                          color: tier.aggregations
                            ? 'var(--portal-green)'
                            : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        {tier.aggregations ? 'Yes' : 'No'}
                      </p>
                    </div>
                  </div>
                  <div className="divider-section h-px w-full" />
                </div>

                {/* CTA */}
                <div className="px-5 pb-4 pt-2 md:px-6">
                  <a
                    href={tier.ctaHref}
                    className={`${tier.ctaClass} flex w-full items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium`}
                  >
                    {tier.cta}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── API Endpoints ───────────────────────────────────── */}
      <section id="api" className="px-4 py-16">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-8 text-center">
            <span className="inline-block rounded-full border border-border/50 bg-background/40 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] portal-purple-text">
              API Reference
            </span>
          </div>

          <div className="glass-panel overflow-hidden">
            {ENDPOINTS.map((ep) => (
              <div
                key={ep.path}
                className="flex items-center gap-4 border-b border-border/30 px-5 py-3 last:border-0"
              >
                <span
                  className="w-12 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold uppercase"
                  style={{
                    backgroundColor:
                      ep.method === 'GET'
                        ? 'var(--portal-blue-bg)'
                        : 'var(--portal-green-bg)',
                    color:
                      ep.method === 'GET'
                        ? 'var(--portal-blue)'
                        : 'var(--portal-green)',
                  }}
                >
                  {ep.method}
                </span>
                <code className="shrink-0 text-xs font-medium">{ep.path}</code>
                <span className="ml-auto text-right text-xs text-muted-foreground">
                  {ep.desc}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Base URL:{' '}
            <code className="rounded-md border border-border/30 bg-background/40 px-1.5 py-0.5 text-[11px]">
              https://api.onsocial.id
            </code>
          </p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-border/30 px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <a href="/" className="flex items-center gap-2">
            <Logo className="h-4 w-4 text-foreground" />
            <span className="text-xs font-medium">OnSocial Labs</span>
          </a>
          <div className="flex items-center gap-4">
            <a
              href="https://t.me/onsocialprotocol"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
              className="text-muted-foreground transition-colors hover:text-[var(--portal-blue)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M21.75 3.5 2.82 10.8c-1.29.52-1.28 1.24-.23 1.56l4.86 1.52 1.89 5.89c.24.74.12 1.03.91 1.03.61 0 .88-.28 1.22-.62l2.35-2.28 4.89 3.61c.9.5 1.55.24 1.77-.83L23.96 4.96c.32-1.32-.5-1.92-2.21-1.46Zm-2.44 3.2-8.93 8.06-.35 3.41-1.13-3.84 10.41-7.63c.45-.3.86-.14.52.3Z" />
              </svg>
            </a>
            <a
              href="https://x.com/onsocialid"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.153h7.594l5.243 6.932 6.064-6.932Zm-1.291 19.492h2.04L6.486 3.24H4.298L17.61 20.645Z" />
              </svg>
            </a>
            <a
              href="https://github.com/OnSocial-Labs/onsocial-protocol"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="text-muted-foreground transition-colors hover:text-[var(--portal-purple)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M12 .5C5.649.5.5 5.649.5 12A11.5 11.5 0 0 0 8.36 22.63c.575.106.785-.25.785-.556 0-.274-.01-1-.015-1.962-3.183.692-3.854-1.533-3.854-1.533-.52-1.322-1.27-1.674-1.27-1.674-1.038-.709.078-.694.078-.694 1.147.08 1.75 1.177 1.75 1.177 1.02 1.748 2.676 1.243 3.328.95.104-.739.4-1.243.727-1.529-2.54-.289-5.212-1.27-5.212-5.654 0-1.248.446-2.27 1.177-3.07-.117-.288-.51-1.45.111-3.024 0 0 .96-.307 3.146 1.173A10.94 10.94 0 0 1 12 6.03a10.9 10.9 0 0 1 2.866.386c2.186-1.48 3.144-1.173 3.144-1.173.623 1.574.23 2.736.113 3.024.733.8 1.176 1.822 1.176 3.07 0 4.395-2.676 5.362-5.224 5.646.411.354.777 1.052.777 2.12 0 1.53-.014 2.765-.014 3.14 0 .31.207.668.792.554A11.503 11.503 0 0 0 23.5 12C23.5 5.649 18.351.5 12 .5Z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
