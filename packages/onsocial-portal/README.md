# OnSocial Portal

> Modern, minimalistic web portal for OnSocial Protocol

## 🎨 Features

- ⚡ **Next.js 14** - Latest App Router with React Server Components
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

- **Framework**: Next.js 14
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
