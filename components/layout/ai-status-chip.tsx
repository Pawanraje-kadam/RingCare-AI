"use client";

import { CircleSlash2, Sparkles, TriangleAlert, XCircle } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { describeAiHealth } from "@/lib/ai/health-display";

export function AiStatusChip() {
  const { settings, aiHealth, aiHealthStatus } = useApp();
  const summary = describeAiHealth(aiHealth, aiHealthStatus, settings.aiEnabled);

  const icon = !settings.aiEnabled ? (
    <CircleSlash2 aria-hidden="true" className="size-3" />
  ) : summary.verified ? (
    <Sparkles aria-hidden="true" className="size-3" />
  ) : summary.tone === "attention" ? (
    <XCircle aria-hidden="true" className="size-3" />
  ) : summary.tone === "review" ? (
    <TriangleAlert aria-hidden="true" className="size-3" />
  ) : (
    <Sparkles aria-hidden="true" className="size-3" />
  );

  return (
    <span title={summary.detail}>
      <Badge tone={summary.tone} className="gap-1.5">
        {icon}
        {summary.label}
      </Badge>
    </span>
  );
}
