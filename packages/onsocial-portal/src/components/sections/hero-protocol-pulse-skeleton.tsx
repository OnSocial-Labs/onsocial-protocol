import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { Skeleton } from '@/components/ui/skeleton';
import {
  HERO_PROTOCOL_PULSE_METRICS,
  resolveProtocolPulseMetrics,
} from '@/lib/protocol-pulse-metrics';

const heroMetrics = resolveProtocolPulseMetrics(HERO_PROTOCOL_PULSE_METRICS);

export function HeroProtocolPulseSkeleton() {
  return (
    <div
      className="mx-auto mt-8 max-w-2xl rounded-[1.25rem] border border-border/40 bg-background/35 backdrop-blur-sm"
      aria-hidden
    >
      <StatStrip
        columns={heroMetrics.length}
        showTopDivider={false}
        showBottomDivider={false}
      >
        {heroMetrics.map((metric, index) => (
          <StatStripCell
            key={metric.id}
            label={typeof metric.label === 'function' ? '…' : metric.label}
            showDivider={index < heroMetrics.length - 1}
          >
            <Skeleton className="mx-auto mt-1 h-5 w-14 rounded-md bg-foreground/[0.08]" />
          </StatStripCell>
        ))}
      </StatStrip>
      <div className="border-t border-fade-detail px-4 py-3 text-center">
        <Skeleton className="mx-auto h-3 w-48 max-w-full rounded-md bg-foreground/5" />
      </div>
    </div>
  );
}
