"use client";

import { CircleSlash2, Sparkles, TriangleAlert } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";

export function AiStatusChip() {
  const { settings, aiHealth, aiHealthStatus } = useApp();

  if (!settings.aiEnabled) {
    return (
      <span title="AI analysis is turned off in Settings.">
        <Badge tone="neutral" className="gap-1.5">
          <CircleSlash2 aria-hidden="true" className="size-3" />
          AI off
        </Badge>
      </span>
    );
  }

  if (aiHealthStatus === "checking") {
    return (
      <span title="Checking server-side AI configuration.">
        <Badge tone="neutral" className="gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 animate-pulse rounded-full bg-muted"
          />
          Checking AI
        </Badge>
      </span>
    );
  }

  if (aiHealthStatus === "unreachable") {
    return (
      <span title="The health endpoint could not be reached. Rules-based fallbacks remain available.">
        <Badge tone="review" className="gap-1.5">
          <TriangleAlert aria-hidden="true" className="size-3" />
          AI status unknown
        </Badge>
      </span>
    );
  }

  if (aiHealth && !aiHealth.configured) {
    return (
      <span title="No GEMINI_API_KEY is configured on the server. The app uses deterministic rules-based explanations.">
        <Badge tone="review" className="gap-1.5">
          <TriangleAlert aria-hidden="true" className="size-3" />
          Rules-only
        </Badge>
      </span>
    );
  }

  return (
    <span title="A server-side Gemini key is configured. Key validity and quota are not verified by this indicator.">
      <Badge tone="brand" className="gap-1.5">
        <Sparkles aria-hidden="true" className="size-3" />
        Gemini configured
      </Badge>
    </span>
  );
}
