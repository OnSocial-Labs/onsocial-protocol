import { yoctoToSocial, type OnChainAppConfig } from '@/lib/near-rpc';
import { portalColors } from '@/lib/portal-colors';

function ProgressRow({
  label,
  value,
  detail,
  accentColor,
  progress,
}: {
  label: string;
  value: string;
  detail?: string;
  accentColor: string;
  progress?: number;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">
          {value}
          {detail && (
            <span className="ml-1 text-muted-foreground">{detail}</span>
          )}
        </span>
      </div>
      {typeof progress === 'number' && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted/30">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, backgroundColor: accentColor }}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  align = 'left',
  emphasized = false,
}: {
  label: string;
  value: string;
  align?: 'left' | 'right';
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-left sm:block ${
        align === 'right' ? 'sm:text-right' : 'sm:text-left'
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground sm:mb-1">
        {label}
      </p>
      <p
        className={`font-mono text-sm whitespace-nowrap ${
          emphasized ? 'text-foreground' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function OnChainConfigSummary({ config }: { config: OnChainAppConfig }) {
  const totalUsed = parseFloat(yoctoToSocial(config.total_credited));
  const totalBudget = parseFloat(yoctoToSocial(config.total_budget));
  const totalPct =
    totalBudget > 0 ? Math.min((totalUsed / totalBudget) * 100, 100) : 0;

  const dailySpent = parseFloat(yoctoToSocial(config.daily_budget_spent));
  const dailyBudget = parseFloat(yoctoToSocial(config.daily_budget));
  const dailyUnlimited = dailyBudget === 0;
  const dailyPct =
    !dailyUnlimited && dailyBudget > 0
      ? Math.min((dailySpent / dailyBudget) * 100, 100)
      : 0;

  const totalAccentColor =
    totalPct >= 90
      ? portalColors.red
      : totalPct >= 70
        ? 'rgb(234 179 8)'
        : portalColors.green;

  const dailyAccentColor =
    dailyPct >= 90
      ? portalColors.red
      : dailyPct >= 70
        ? 'rgb(234 179 8)'
        : portalColors.blue;

  return (
    <div className="space-y-4">
      <ProgressRow
        label="Budget Used"
        value={`${totalUsed.toLocaleString()} / ${totalBudget.toLocaleString()} SOCIAL`}
        detail={`(${totalPct.toFixed(1)}%)`}
        accentColor={totalAccentColor}
        progress={totalPct}
      />

      <ProgressRow
        label="Today's Spend"
        value={
          dailyUnlimited
            ? `${dailySpent.toLocaleString()} SOCIAL`
            : `${dailySpent.toLocaleString()} / ${dailyBudget.toLocaleString()} SOCIAL`
        }
        detail={
          dailyUnlimited ? '(no daily limit)' : `(${dailyPct.toFixed(1)}%)`
        }
        accentColor={dailyAccentColor}
        progress={dailyUnlimited ? undefined : dailyPct}
      />

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border/30 pt-1 sm:grid-cols-3">
        <StatCard
          label="Reward"
          value={`${yoctoToSocial(config.reward_per_action)} /action`}
        />
        <StatCard
          label="Daily Cap"
          value={`${yoctoToSocial(config.daily_cap)} /user`}
        />
        <StatCard
          label="Daily Budget"
          value={
            yoctoToSocial(config.daily_budget) === '0'
              ? 'Unlimited'
              : yoctoToSocial(config.daily_budget)
          }
          align="right"
          emphasized={yoctoToSocial(config.daily_budget) === '0'}
        />
      </div>
    </div>
  );
}
