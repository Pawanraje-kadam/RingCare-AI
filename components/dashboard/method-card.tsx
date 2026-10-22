"use client";

import Link from "next/link";
import {
  Check,
  Cpu,
  Database,
  KeyRound,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AI_LIMITS } from "@/lib/constants/ai";
import { describeAiHealth } from "@/lib/ai/health-display";
import { cn } from "@/lib/utils/cn";

export function MethodCard() {
  const { aiHealth, aiHealthStatus, refreshAiHealth, events, settings } = useApp();
  const health = describeAiHealth(aiHealth, aiHealthStatus, settings.aiEnabled);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>How this demo works</CardTitle>
          <CardDescription>
            Local event data, deterministic rules, and optional server-side Gemini
            narration.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-3 text-muted">
            <Cpu aria-hidden="true" className="size-3.5" />
          </span>
          <div>
            <p className="text-[12px] font-medium text-ink">Rules decide, AI explains</p>
            <p className="mt-0.5 text-[11px] leading-5 text-muted">
              Attention levels and recommendations come from deterministic rules. Gemini can
              phrase an explanation but cannot upgrade the attention level.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-3 text-muted">
            <Database aria-hidden="true" className="size-3.5" />
          </span>
          <div>
            <p className="text-[12px] font-medium text-ink">Stored in this browser</p>
            <p className="mt-0.5 text-[11px] leading-5 text-muted">
              {events.length} event{events.length === 1 ? "" : "s"} retained locally (maximum{" "}
              {settings.retentionLimit}). Clearing browser data removes them. No server
              database is used.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface-2/60 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
              <KeyRound aria-hidden="true" className="size-3.5 text-muted" />
              Gemini status
            </p>
            <Badge tone={health.tone}>
              {health.verified ? (
                <Check aria-hidden="true" className="size-3" />
              ) : health.tone === "attention" ? (
                <XCircle aria-hidden="true" className="size-3" />
              ) : health.tone === "review" ? (
                <X aria-hidden="true" className="size-3" />
              ) : null}
              {health.label}
            </Badge>
          </div>
          <dl className="mt-2.5 space-y-1.5 text-[10.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Model</dt>
              <dd className="text-right font-mono text-ink-2">
                {aiHealth?.model ?? "gemini-3.8-flash"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Connection</dt>
              <dd className="text-right text-ink-2">
                {health.verified
                  ? `Verified${aiHealth?.latencyMs !== undefined ? ` · ${aiHealth.latencyMs} ms` : ""}`
                  : health.usable
                    ? "Unverified"
                    : "Not verified"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Prompt version</dt>
              <dd className="text-right font-mono text-ink-2">
                {aiHealth?.promptVersion ?? "Not reported"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Request limit</dt>
              <dd className="text-right text-ink-2">
                {AI_LIMITS.rateLimitRequestsPerMinute}/min per instance
              </dd>
            </div>
          </dl>
          <p className="mt-2.5 border-t border-line pt-2 text-[10px] leading-4 text-muted">
            {health.detail}
          </p>
          {aiHealth?.modelNotice ? (
            <p className="mt-1.5 text-[10px] leading-4 text-amber">
              {aiHealth.modelNotice}
            </p>
          ) : null}
          <p className="mt-1.5 text-[10px] leading-4 text-muted">
            The key is read only on the server and is never sent to the browser. Environment
            variable changes on Vercel require a redeploy.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshAiHealth(true)}
              disabled={aiHealthStatus === "checking"}
            >
              <RefreshCw
                aria-hidden="true"
                className={cn("size-3.5", aiHealthStatus === "checking" && "animate-spin")}
              />
              Refresh status
            </Button>
            <Link
              href="/dashboard/settings"
              className="text-[11.5px] font-medium text-brand underline-offset-2 hover:underline"
            >
              Settings
            </Link>
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-[10.5px] leading-4 text-muted">
          <Sparkles aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          Gemini calls happen only when you request an explanation, summary, insight, or
          search. Events from the automatic generator are never sent without your action.
        </p>
      </CardContent>
    </Card>
  );
}
