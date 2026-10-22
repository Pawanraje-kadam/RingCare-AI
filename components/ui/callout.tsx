import {
  AlertTriangle,
  CheckCircle2,
  Info,
  OctagonAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type CalloutTone = "info" | "warning" | "danger" | "success" | "neutral";

const tones: Record<
  CalloutTone,
  { icon: LucideIcon; className: string; iconClassName: string }
> = {
  info: {
    icon: Info,
    className: "border-line bg-surface-2 text-ink-2",
    iconClassName: "text-info",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber/20 bg-amber-soft/70 text-ink-2",
    iconClassName: "text-amber",
  },
  danger: {
    icon: OctagonAlert,
    className: "border-danger/20 bg-danger-soft/70 text-ink-2",
    iconClassName: "text-danger",
  },
  success: {
    icon: CheckCircle2,
    className: "border-brand/20 bg-brand-soft/60 text-ink-2",
    iconClassName: "text-brand",
  },
  neutral: {
    icon: Info,
    className: "border-line bg-surface-2 text-muted",
    iconClassName: "text-muted",
  },
};

export function Callout({
  tone = "info",
  title,
  children,
  className,
  icon: IconOverride,
}: {
  tone?: CalloutTone;
  title?: string;
  children: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
}) {
  const meta = tones[tone];
  const Icon = IconOverride ?? meta.icon;
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border px-3.5 py-3 text-[12.5px] leading-5",
        meta.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", meta.iconClassName)} />
      <div className="min-w-0">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        <div className={cn(title ? "mt-0.5" : "", "text-muted")}>{children}</div>
      </div>
    </div>
  );
}
