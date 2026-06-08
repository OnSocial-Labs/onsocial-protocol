import { yoctoToSocial, type OnChainAppConfig } from '@/lib/near-rpc';
import { portalColors } from '@/lib/portal-colors';
import { cn } from '@/lib/utils';

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
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="shrink-0 text-muted-foreground">{label}</span>
        <span className="min-w-0 truncate text-right font-mono text-foreground">
          {value}
          {detail ? (
            <span className="text-muted-foreground"> {detail}</span>
          ) : null}
        </span>
      </div>
      {typeof progress === 'number' && (
        <div className="h-1 overflow-hidden rounded-full bg-muted/30">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, backgroundColor: accentColor }}
          />
        </div>
      )}
    </div>
  );
}

function TermsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right font-mono text-foreground">
        {value} SOCIAL
      </span>
    </div>
  );
}

export function OnChainConfigSummary({
  config,
  showUsageMetrics = true,
  showUserRewardTerms = true,
}: {
  config: OnChainAppConfig;
  showUsageMetrics?: boolean;
  showUserRewardTerms?: boolean;
}) {
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
    <div className="space-y-3">
      {showUserRewardTerms ? (
        <div className="space-y-1.5">
          <p className="portal-eyebrow text-muted-foreground/70">Per user</p>
          <TermsRow
            label="Per action"
            value={yoctoToSocial(config.reward_per_action)}
          />
          <TermsRow label="Max / day" value={yoctoToSocial(config.daily_cap)} />
        </div>
      ) : null}
      {showUsageMetrics ? (
        <div
          className={cn(
            'space-y-2',
            showUserRewardTerms && 'border-t border-fade-detail pt-3'
          )}
        >
          <p className="portal-eyebrow text-muted-foreground/70">App pool</p>
          <ProgressRow
            label="Total budget"
            value={`${totalUsed.toLocaleString()} / ${totalBudget.toLocaleString()}`}
            detail={`SOCIAL · ${totalPct.toFixed(1)}%`}
            accentColor={totalAccentColor}
            progress={totalPct}
          />

          <ProgressRow
            label="Today"
            value={
              dailyUnlimited
                ? `${dailySpent.toLocaleString()} SOCIAL`
                : `${dailySpent.toLocaleString()} / ${dailyBudget.toLocaleString()}`
            }
            detail={
              dailyUnlimited
                ? '· no pool cap'
                : `SOCIAL · ${dailyPct.toFixed(1)}%`
            }
            accentColor={dailyAccentColor}
            progress={dailyUnlimited ? undefined : dailyPct}
          />
        </div>
      ) : null}
    </div>
  );
}
