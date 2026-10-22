import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  footnote,
  emphasis = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  footnote?: string;
  emphasis?: "default" | "attention" | "review";
}) {
  return (
    <Card className="flex flex-col justify-between p-4.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-medium leading-5 text-muted">{label}</p>
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg border",
            emphasis === "attention"
              ? "border-danger/20 bg-danger-soft text-danger"
              : emphasis === "review"
                ? "border-amber/20 bg-amber-soft text-amber"
                : "border-line bg-surface-2 text-muted",
          )}
        >
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
      </div>
      <div className="mt-3">
        <p className="text-[27px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
          {value}
        </p>
        {hint ? <p className="mt-1.5 text-[11px] leading-4 text-muted">{hint}</p> : null}
      </div>
      {footnote ? (
        <p className="mt-2.5 border-t border-line pt-2.5 text-[10.5px] leading-4 text-muted">
          {footnote}
        </p>
      ) : null}
    </Card>
  );
}
