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
      <div className="mb-1 flex flex-col gap-0.5 text-xs sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="truncate font-mono text-foreground">
          {value}
          {detail && (
            <span className="ml-1 text-muted-foreground">{detail}</span>
          )}
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

export function OnChainConfigSummary({
  config,
  showUsageMetrics = true,
}: {
  config: OnChainAppConfig;
  showUsageMetrics?: boolean;
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
    <div className="space-y-2">
      {showUsageMetrics && (
        <>
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
        </>
      )}
    </div>
  );
}
