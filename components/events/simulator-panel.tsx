"use client";

import * as React from "react";
import { FlaskConical, PauseCircle, PlayCircle } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/ui/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  SIMULATION_SCENARIOS,
  SIMULATION_SCENARIO_META,
  type SimulationScenario,
} from "@/lib/events/simulator";
import { ATTENTION_META } from "@/lib/constants/events";
import { cn } from "@/lib/utils/cn";

const INTERVAL_OPTIONS = [20, 30, 60, 120, 300] as const;

const SCENARIO_ACCENT: Record<SimulationScenario, string> = {
  delivery: "text-brand",
  doorbell: "text-info",
  caregiver: "text-brand",
  person: "text-ink-2",
  motion: "text-muted",
  prolonged: "text-amber",
  generic: "text-muted",
};

export function SimulatorPanel({ className }: { className?: string }) {
  const { ready, settings, simulateEvent, updateSettings } = useApp();
  const { toast } = useToast();
  const [lastResult, setLastResult] = React.useState<{
    scenario: SimulationScenario;
    attention: string;
    id: string;
  } | null>(null);

  const autoEnabled = settings.autoGenerateEnabled;
  const interval = settings.autoGenerateIntervalSeconds;

  const handleSimulate = (scenario: SimulationScenario) => {
    const result = simulateEvent(scenario);
    const meta = SIMULATION_SCENARIO_META[scenario];
    setLastResult({
      scenario,
      attention: ATTENTION_META[result.evaluation.attentionLevel].label,
      id: result.event.id,
    });
    toast({
      title: `${meta.label} simulated`,
      description: `Recorded as “${ATTENTION_META[result.evaluation.attentionLevel].label}” by deterministic rules. Clearly labelled as simulated.`,
      tone: "success",
    });
  };

  const setAutoEnabled = (next: boolean) => {
    const result = updateSettings({ ...settings, autoGenerateEnabled: next });
    if (!result.ok) {
      toast({
        title: "Could not update the simulator",
        description: result.message,
        tone: "error",
      });
    }
  };

  const setIntervalSeconds = (next: number) => {
    updateSettings({ ...settings, autoGenerateIntervalSeconds: next });
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <div>
          <div className="flex items-center gap-2">
            <CardTitle>Event simulator</CardTitle>
            <Badge tone="demo">
              <FlaskConical aria-hidden="true" className="size-3" />
              Simulated
            </Badge>
          </div>
          <CardDescription>
            Add clearly labelled synthetic events. Nothing here reads a camera or
            contacts Ring.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="group" aria-label="Simulate an event" className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SIMULATION_SCENARIOS.map((scenario) => {
            const meta = SIMULATION_SCENARIO_META[scenario];
            return (
              <button
                key={scenario}
                type="button"
                onClick={() => handleSimulate(scenario)}
                disabled={!ready}
                className="group flex min-h-[58px] flex-col items-start rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={cn("text-[12.5px] font-medium", SCENARIO_ACCENT[scenario])}>
                  {meta.label}
                </span>
                <span className="mt-0.5 text-[11px] leading-4 text-muted">
                  {meta.description}
                </span>
              </button>
            );
          })}
        </div>

        {lastResult ? (
          <p
            role="status"
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11.5px] leading-5 text-muted"
          >
            Last added: <span className="font-medium text-ink-2">
              {SIMULATION_SCENARIO_META[lastResult.scenario].label}
            </span>{" "}
            · {lastResult.attention} ·{" "}
            <span className="font-mono text-[10.5px]">{lastResult.id.slice(0, 18)}…</span>
          </p>
        ) : null}

        <div className="rounded-xl border border-line bg-surface-2/70 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor="auto-generate" className="flex items-center gap-2">
                {autoEnabled ? (
                  <PauseCircle aria-hidden="true" className="size-4 text-amber" />
                ) : (
                  <PlayCircle aria-hidden="true" className="size-4 text-muted" />
                )}
                Auto-generate events
              </Label>
              <p className="mt-1 text-[11.5px] leading-4 text-muted">
                Adds one labelled simulated event on an interval. No AI requests are
                sent automatically.
              </p>
            </div>
            <Switch
              id="auto-generate"
              checked={autoEnabled}
              onCheckedChange={setAutoEnabled}
              aria-describedby="auto-generate-hint"
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
            <Label htmlFor="auto-interval" className="text-[12px] font-normal text-muted">
              Interval
            </Label>
            <Select
              id="auto-interval"
              value={interval}
              onChange={(event) => setIntervalSeconds(Number(event.target.value))}
              className="h-8 w-[128px] text-[12px]"
              disabled={!autoEnabled}
              aria-label="Automatic event interval"
            >
              {INTERVAL_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  Every {seconds}s
                </option>
              ))}
            </Select>
          </div>
          <p id="auto-generate-hint" className="sr-only">
            Automatic generation creates simulated events only and never calls the AI
            provider.
          </p>
        </div>

        <p className="text-[11px] leading-5 text-muted">
          Rules are deterministic and run locally. Simulated events are retained in this
          browser only and are not real observations.
        </p>
      </CardContent>
    </Card>
  );
}
