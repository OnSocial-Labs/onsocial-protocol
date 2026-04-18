'use client';

import Link from 'next/link';
import { Github, Mail, Globe, MapPin } from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SurfacePanel } from '@/components/ui/surface-panel';

const socials = [
  {
    label: 'GitHub',
    href: 'https://github.com/OnSocial-Labs/onsocial-protocol',
    icon: Github,
    accent: 'hover:text-[var(--portal-purple)]',
  },
  {
    label: 'X',
    href: 'https://x.com/onsocialid',
    icon: FaXTwitter,
    accent: 'hover:text-foreground',
  },
  {
    label: 'Telegram',
    href: 'https://t.me/onsocialprotocol',
    icon: RiTelegram2Line,
    accent: 'hover:text-[var(--portal-blue)]',
  },
] as const;

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Globe;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
      <div className="min-w-0">
        <p className="text-[0.7rem] uppercase tracking-widest text-muted-foreground/50">
          {label}
        </p>
        <div className="text-sm text-foreground/80">{children}</div>
      </div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <PageShell className="max-w-xl">
      <SecondaryPageHeader
        badge="About"
        badgeAccent="slate"
        glowAccents={['blue', 'purple']}
        title="OnSocial"
        description="Decentralized social infrastructure on NEAR."
      />

      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        OnSocial Labs builds services and tools on top of the OnSocial
        protocol. The protocol is governed independently by its{' '}
        <Link
          href="/governance"
          className="text-foreground/70 underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
        >
          DAO
        </Link>
        .
      </p>

      <SurfacePanel
        tone="subtle"
        borderTone="faint"
        padding="roomy"
        className="space-y-5"
      >
        <DetailRow icon={MapPin} label="Registered office">
          <p>71-75 Shelton Street</p>
          <p>Covent Garden</p>
          <p>London WC2H 9JQ</p>
          <p>United Kingdom</p>
        </DetailRow>

        <div className="overflow-hidden rounded-xl border border-border/30">
          <iframe
            title="OnSocial registered office"
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2482.9050207912896!2d-0.12537!3d51.51459!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x487604ccbd1e2703%3A0x62be3e65e0d0c5c8!2s71-75%20Shelton%20St%2C%20London%20WC2H%209JQ%2C%20UK!5e0!3m2!1sen!2sus!4v1"
            width="100%"
            height="180"
            style={{ border: 0 }}
            allowFullScreen={false}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="grayscale opacity-80 transition-all hover:grayscale-0 hover:opacity-100"
          />
        </div>

        <DetailRow icon={Globe} label="Website">
          <Link
            href="https://portal.onsocial.id"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[var(--portal-blue)]"
          >
            portal.onsocial.id
          </Link>
        </DetailRow>

        <DetailRow icon={Mail} label="Contact">
          <Link
            href="mailto:build@onsocial.id"
            className="transition-colors hover:text-[var(--portal-blue)]"
          >
            build@onsocial.id
          </Link>
        </DetailRow>
      </SurfacePanel>

      {/* ── Social ────────────────────────────────────────────── */}
      <div className="mt-6 flex items-center justify-center gap-4">
        {socials.map(({ label, href, icon: Icon, accent }) => (
          <Link
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className={`text-muted-foreground transition-colors ${accent}`}
          >
            <Icon className="h-4 w-4" />
          </Link>
        ))}
      </div>

      <p className="mt-4 text-center text-[0.65rem] text-muted-foreground/40">
        © {new Date().getFullYear()} OnSocial Labs
      </p>
    </PageShell>
  );
}
