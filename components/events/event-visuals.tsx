import {
  Activity,
  BellRing,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CircleHelp,
  Cpu,
  FlaskConical,
  HeartHandshake,
  Package,
  Sparkles,
  Timer,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  ATTENTION_META,
  EVENT_TYPE_META,
  PROCESSING_STATUS_META,
  type AI_SOURCES,
  type AttentionLevel,
  type EventType,
  type ProcessingStatus,
} from "@/lib/constants/events";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import type { AiAnalysis } from "@/types/events";

export const EVENT_TYPE_ICONS: Record<EventType, LucideIcon> = {
  person_detected: UserRound,
  delivery_related: Package,
  doorbell_pressed: BellRing,
  caregiver_arrival: HeartHandshake,
  prolonged_presence: Timer,
  motion_detected: Activity,
  unknown_activity: CircleHelp,
};

export function EventTypeIcon({
  type,
  className,
}: {
  type: EventType;
  className?: string;
}) {
  const Icon = EVENT_TYPE_ICONS[type];
  return <Icon aria-hidden="true" className={cn("size-4", className)} />;
}

const ATTENTION_VISUALS: Record<
  AttentionLevel,
  { tone: BadgeProps["tone"]; icon: LucideIcon }
> = {
  routine: { tone: "routine", icon: CheckCircle2 },
  review: { tone: "review", icon: CircleAlert },
  high_attention: { tone: "attention", icon: TriangleAlert },
  unknown: { tone: "unknown", icon: CircleDashed },
};

export function AttentionBadge({
  level,
  short = false,
  className,
}: {
  level: AttentionLevel;
  short?: boolean;
  className?: string;
}) {
  const meta = ATTENTION_VISUALS[level];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} className={className}>
      <Icon aria-hidden="true" className="size-3" />
      {short ? ATTENTION_META[level].shortLabel : ATTENTION_META[level].label}
    </Badge>
  );
}

export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="demo" className={className}>
      <FlaskConical aria-hidden="true" className="size-3" />
      Simulated
    </Badge>
  );
}

export function AiSourceBadge({
  source,
  cached,
  className,
}: {
  source: AiAnalysis["source"] | null;
  cached?: boolean;
  className?: string;
}) {
  if (!source) {
    return (
      <Badge tone="outline" className={className}>
        <CircleDashed aria-hidden="true" className="size-3" />
        Not analyzed
      </Badge>
    );
  }
  if (source === "groq") {
    return (
      <span title={cached ? "Served from the server's short-lived in-memory cache." : undefined}>
        <Badge tone="brand" className={className}>
          <Sparkles aria-hidden="true" className="size-3" />
          {cached ? "GPT-OSS 120B · cached" : "GPT-OSS 120B"}
        </Badge>
      </span>
    );
  }
  return (
    <Badge tone="neutral" className={className}>
      <Cpu aria-hidden="true" className="size-3" />
      Rules-based
    </Badge>
  );
}

export function ProcessingStatusBadge({
  status,
  className,
}: {
  status: ProcessingStatus;
  className?: string;
}) {
  return (
    <span title={PROCESSING_STATUS_META[status].description}>
      <Badge tone="outline" className={className}>
        {PROCESSING_STATUS_META[status].label}
      </Badge>
    </span>
  );
}

export function EventTypeLabel({
  type,
  className,
}: {
  type: EventType;
  className?: string;
}) {
  return (
    <span className={cn("font-medium text-ink", className)}>
      {EVENT_TYPE_META[type].label}
    </span>
  );
}

export const AI_SOURCE_LABEL: Record<(typeof AI_SOURCES)[number], string> = {
  groq: "Groq · GPT-OSS 120B",
  fallback: "Deterministic rules",
};
