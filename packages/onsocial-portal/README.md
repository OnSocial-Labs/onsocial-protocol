# OnSocial Portal

> Modern, minimalistic web portal for OnSocial Protocol

## 🎨 Features

- ⚡ **Next.js 16** - App Router with React 19
- 🎭 **Framer Motion** - Smooth, modern animations
- 🪶 **Lenis** - Butter-smooth scrolling
- 🎨 **Tailwind CSS** - Utility-first styling
- 🌙 **Dark Mode** - Seamless theme switching
- 📱 **Responsive** - Mobile-first design
- ♿ **Accessible** - WCAG compliant components
- 🚀 **Optimized** - Lighthouse 100 performance

## 🏗️ Structure

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Landing page
│   └── globals.css        # Global styles
├── components/
│   ├── navigation/        # Navigation components
│   ├── sections/          # Page sections (Hero, Features, etc.)
│   ├── providers/         # Context providers
│   ├── ui/                # Reusable UI components
│   └── theme-toggle.tsx   # Theme switcher
└── lib/
    └── utils.ts           # Utility functions
```

## 🚀 Getting Started

### Install Dependencies

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Runtime Config

The portal is single-network per deployment. Browser-facing values live in
`src/lib/portal-config.ts` and server-only admin proxy values live in
`src/lib/portal-server-config.ts`.

Recommended local scripts:

```bash
pnpm dev:local-sandbox
pnpm dev:testnet
pnpm dev:mainnet
pnpm dev:both
```

`pnpm dev:both` runs testnet on `localhost:3000` and mainnet on
`localhost:3001`.

Local sandbox billing against a local gateway:

```bash
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

Use `pnpm dev:local-sandbox` when the gateway is running locally in Revolut
sandbox mode and you want the portal checkout flow to stay entirely on your
machine.

Testnet / staging:

```bash
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_API_URL=https://testnet.onsocial.id
NEXT_PUBLIC_BACKEND_URL=https://testnet.onsocial.id
```

Mainnet / production:

```bash
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_API_URL=https://api.onsocial.id
NEXT_PUBLIC_BACKEND_URL=https://api.onsocial.id
```

For local development, switch the values in `.env.local` instead of adding a UI
network toggle. The shared config automatically drives wallet network,
Nearblocks links, admin contract targets, relayer account selection, gateway
health checks, transparency data, and partner backend calls.

If your URLs and `NEXT_PUBLIC_NEAR_NETWORK` drift apart, the portal logs a
startup warning in the browser console so the mismatch is visible early.

### Build

```bash
pnpm build
```

### Production

```bash
pnpm start
```

## 🎯 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project to Vercel
3. Deploy automatically

Or use Vercel CLI:

```bash
npx vercel
```

## 🎨 Customization

### Theme Colors

Edit `src/app/globals.css` to customize the color palette:

```css
:root {
  --primary: 222.2 47.4% 11.2%;
  --secondary: 210 40% 96.1%;
  /* ... */
}
```

### Animations

Framer Motion animations are configured in each component. Adjust timing and easing in component files.

### Content

Update content in:

- `src/components/sections/hero.tsx` - Hero section
- `src/components/sections/features.tsx` - Features
- `src/components/sections/stats.tsx` - Statistics
- `src/components/sections/cta.tsx` - Call to action

## 📝 Tech Stack

- **Framework**: Next.js 16
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion, Lenis
- **Icons**: Lucide React
- **Theme**: next-themes
- **Deployment**: Vercel

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) in the root directory.

## 📄 License

See [LICENSE.md](../../LICENSE.md) in the root directory.

## 🔗 Links

- [Documentation](https://docs.onsocial.xyz)
- [GitHub](https://github.com/OnSocial-Labs)
- [Website](https://onsocial.xyz)
