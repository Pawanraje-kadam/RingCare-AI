"use client";

import * as React from "react";
import {
  AlertTriangle,
  BellRing,
  Check,
  Database,
  FlaskConical,
  HeartHandshake,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/dashboard-loading";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldHint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast-provider";
import {
  EVENT_TYPES,
  EVENT_TYPE_META,
  type CaregiverCriteria,
  type EventType,
} from "@/lib/constants/events";
import { SETTINGS_LIMITS } from "@/lib/constants/settings";
import { AI_LIMITS, DEFAULT_GEMINI_MODEL, GEMINI_MODEL_ID } from "@/lib/constants/ai";
import { describeAiHealth } from "@/lib/ai/health-display";
import { cn } from "@/lib/utils/cn";
import type { AppSettings } from "@/types/settings";

const RETENTION_OPTIONS = [50, 100, 250, 500, 1000] as const;
const AUTO_INTERVAL_OPTIONS = [20, 30, 60, 120, 300] as const;

function SettingsSection({
  id,
  title,
  description,
  icon: Icon,
  children,
  footer,
}: {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span id={`${id}-title`}>{title}</span>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </CardHeader>
      <CardContent className="space-y-4" aria-labelledby={`${id}-title`}>
        {children}
      </CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <Label htmlFor={id} className={cn("text-[12.5px]", disabled && "text-muted")}>
          {label}
        </Label>
        <p id={`${id}-description`} className="mt-0.5 text-[11px] leading-5 text-muted">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={`${id}-description`}
        className="mt-0.5"
      />
    </div>
  );
}

export default function SettingsPage() {
  const {
    ready,
    settings,
    events,
    aiHealth,
    aiHealthStatus,
    updateSettings,
    resetDemoData,
    clearLocalData,
    refreshAiHealth,
  } = useApp();
  const { toast } = useToast();

  const [draft, setDraft] = React.useState<AppSettings>(settings);
  const [thresholdInput, setThresholdInput] = React.useState(
    String(settings.prolongedPresenceThresholdSeconds),
  );
  const [dirty, setDirty] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    threshold?: string;
    caregiverLabel?: string;
    form?: string;
  }>({});
  const [saving, setSaving] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  React.useEffect(() => {
    if (!ready || dirty) return;
    setDraft(settings);
    setThresholdInput(String(settings.prolongedPresenceThresholdSeconds));
  }, [ready, settings, dirty]);

  if (!ready) return <DashboardLoading />;

  const patch = (partial: Partial<AppSettings>) => {
    setDraft((current) => ({ ...current, ...partial }));
    setDirty(true);
    setErrors((current) => ({ ...current, form: undefined }));
  };

  const patchNotification = (type: EventType, enabled: boolean) => {
    patch({
      notificationPreferences: {
        ...draft.notificationPreferences,
        [type]: enabled,
      },
    });
  };

  const discard = () => {
    setDraft(settings);
    setThresholdInput(String(settings.prolongedPresenceThresholdSeconds));
    setDirty(false);
    setErrors({});
  };

  const handleSave = (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    const nextErrors: typeof errors = {};
    const threshold = Number(thresholdInput);

    if (
      !Number.isInteger(threshold) ||
      threshold < SETTINGS_LIMITS.prolongedPresenceMinSeconds ||
      threshold > SETTINGS_LIMITS.prolongedPresenceMaxSeconds
    ) {
      nextErrors.threshold = `Enter a whole number between ${SETTINGS_LIMITS.prolongedPresenceMinSeconds} and ${SETTINGS_LIMITS.prolongedPresenceMaxSeconds} seconds.`;
    }
    const label = draft.caregiverLabel.trim();
    if (
      label.length < SETTINGS_LIMITS.caregiverLabelMinLength ||
      label.length > SETTINGS_LIMITS.caregiverLabelMaxLength
    ) {
      nextErrors.caregiverLabel = `Use between ${SETTINGS_LIMITS.caregiverLabelMinLength} and ${SETTINGS_LIMITS.caregiverLabelMaxLength} characters.`;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast({
        title: "Some settings are invalid",
        description: "Check the highlighted fields and try again.",
        tone: "error",
      });
      return;
    }

    setSaving(true);
    const next: AppSettings = {
      ...draft,
      prolongedPresenceThresholdSeconds: threshold,
      caregiverLabel: label,
    };
    const result = updateSettings(next);
    setSaving(false);

    if (!result.ok) {
      setErrors({ form: result.message ?? "Settings could not be saved." });
      toast({
        title: "Settings not saved",
        description: result.message,
        tone: "error",
      });
      return;
    }

    setDraft(next);
    setDirty(false);
    setErrors({});
    toast({
      title: "Settings saved",
      description: `Stored in this browser. Rules re-evaluated ${events.length} recorded event${events.length === 1 ? "" : "s"}.`,
      tone: "success",
    });
  };

  const handleReset = async () => {
    const result = await resetDemoData();
    toast({
      title: "Demo data reset",
      description: `${result.count} seeded records loaded (${result.source === "server" ? "generated by the demo API" : "generated locally"}). Settings were not changed.`,
      tone: "success",
    });
  };

  const handleClear = async () => {
    const result = clearLocalData();
    if (!result.ok) {
      throw new Error(result.message ?? "The records could not be cleared.");
    }
    toast({
      title: "Demo records cleared",
      description: "No events are stored in this browser. Settings and rules are unchanged.",
      tone: "info",
    });
  };

  const health = describeAiHealth(aiHealth, aiHealthStatus, draft.aiEnabled);

  return (
    <form onSubmit={handleSave} noValidate className="space-y-5 animate-fade-up">
      <PageHeader
        eyebrow="Demo workspace"
        title="Settings"
        description="Configure the deterministic rules, caregiver criteria, AI preferences, and local demo data. Changes apply immediately after saving and never leave this browser except as bounded AI requests."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={discard}
              disabled={!dirty || saving}
            >
              Discard
            </Button>
            <Button type="submit" disabled={!dirty || saving}>
              {saving ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="size-4" />
              )}
              Save changes
            </Button>
          </>
        }
      />

      {errors.form ? (
        <Callout tone="danger" title="Settings could not be saved">
          {errors.form}
        </Callout>
      ) : null}

      {dirty ? (
        <p role="status" className="text-[11px] text-amber">
          You have unsaved changes. Rules continue using the last saved settings until you
          save.
        </p>
      ) : (
        <p role="status" className="flex items-center gap-1.5 text-[11px] text-muted">
          <Check aria-hidden="true" className="size-3.5 text-brand" />
          All changes saved in this browser.
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-7">
          <SettingsSection
            id="rules"
            title="Attention rules"
            description="Deterministic thresholds applied to every recorded event."
            icon={ShieldCheck}
          >
            <div>
              <Label htmlFor="prolonged-threshold">Prolonged presence threshold</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  id="prolonged-threshold"
                  type="number"
                  inputMode="numeric"
                  min={SETTINGS_LIMITS.prolongedPresenceMinSeconds}
                  max={SETTINGS_LIMITS.prolongedPresenceMaxSeconds}
                  step={1}
                  value={thresholdInput}
                  onChange={(event) => {
                    setThresholdInput(event.target.value);
                    setDirty(true);
                    setErrors((current) => ({ ...current, threshold: undefined }));
                  }}
                  aria-invalid={Boolean(errors.threshold)}
                  aria-describedby="prolonged-threshold-hint"
                  className="w-28"
                />
                <span className="text-[12px] text-muted">seconds</span>
              </div>
              <FieldHint>
                A presence event is suggested for review only when its reported duration
                exceeds this threshold <em>and</em> at least two related person events occur
                within 15 minutes at the same location. Duration alone is never treated as
                suspicious.
              </FieldHint>
              {errors.threshold ? (
                <p role="alert" className="mt-1 text-[11px] text-danger">
                  {errors.threshold}
                </p>
              ) : null}
              <p id="prolonged-threshold-hint" className="sr-only">
                Current threshold is {settings.prolongedPresenceThresholdSeconds} seconds.
                Allowed range {SETTINGS_LIMITS.prolongedPresenceMinSeconds} to{" "}
                {SETTINGS_LIMITS.prolongedPresenceMaxSeconds} seconds.
              </p>
            </div>

            <Callout tone="neutral" title="Fixed rule behaviour">
              High attention requires both a duration threshold and corroborating related
              events. Unfamiliarity, appearance, and time of day are never used to infer
              intent. Events without enough data are marked uncertain rather than guessed.
            </Callout>
          </SettingsSection>

          <SettingsSection
            id="caregiver"
            title="Caregiver"
            description="A metadata rule that labels arrivals from your own configuration."
            icon={HeartHandshake}
          >
            <div>
              <Label htmlFor="caregiver-label">Caregiver label</Label>
              <Input
                id="caregiver-label"
                value={draft.caregiverLabel}
                onChange={(event) =>
                  patch({ caregiverLabel: event.target.value })
                }
                maxLength={SETTINGS_LIMITS.caregiverLabelMaxLength}
                aria-invalid={Boolean(errors.caregiverLabel)}
                aria-describedby="caregiver-label-hint"
                className="mt-1.5 max-w-sm"
              />
              <FieldHint>
                Used for simulated event metadata and for matching. A label is not a verified
                identity.
              </FieldHint>
              {errors.caregiverLabel ? (
                <p role="alert" className="mt-1 text-[11px] text-danger">
                  {errors.caregiverLabel}
                </p>
              ) : null}
              <p id="caregiver-label-hint" className="sr-only">
                Between {SETTINGS_LIMITS.caregiverLabelMinLength} and{" "}
                {SETTINGS_LIMITS.caregiverLabelMaxLength} characters.
              </p>
            </div>

            <div>
              <Label htmlFor="caregiver-criteria">Match criteria</Label>
              <Select
                id="caregiver-criteria"
                value={draft.caregiverCriteria}
                onChange={(event) =>
                  patch({ caregiverCriteria: event.target.value as CaregiverCriteria })
                }
                className="mt-1.5 max-w-sm"
              >
                <option value="event_type_and_label">
                  Event type and supplied label must both match
                </option>
                <option value="event_type_only">
                  Event type only (any caregiver-arrival event matches)
                </option>
              </Select>
              <FieldHint>
                Criteria are evaluated against event metadata. No imagery, face, voice, or
                biometric data is used.
              </FieldHint>
            </div>

            <ToggleRow
              id="caregiver-alerts"
              label="Mark matched arrivals for notification"
              description="When off, arrivals are still recorded and matched, but the rule engine does not suggest notifying you."
              checked={draft.caregiverAlertsEnabled}
              onCheckedChange={(checked) => patch({ caregiverAlertsEnabled: checked })}
            />

            <Callout tone="warning" icon={AlertTriangle} title="No biometric processing">
              RingCare AI contains no facial recognition. A “matched” caregiver arrival is
              only a metadata rule match and can be wrong.
            </Callout>
          </SettingsSection>

          <SettingsSection
            id="notifications"
            title="In-app notification preferences"
            description="These preferences shape the rule engine and in-app review labels. No push notifications are sent."
            icon={BellRing}
          >
            <div className="divide-y divide-line">
              {EVENT_TYPES.map((type) => (
                <ToggleRow
                  key={type}
                  id={`notify-${type}`}
                  label={EVENT_TYPE_META[type].label}
                  description={EVENT_TYPE_META[type].description}
                  checked={draft.notificationPreferences[type]}
                  onCheckedChange={(checked) => patchNotification(type, checked)}
                />
              ))}
            </div>
          </SettingsSection>

          <SettingsSection
            id="retention"
            title="History and retention"
            description="Control how many records are kept in this browser."
            icon={Database}
          >
            <div>
              <Label htmlFor="retention-limit">Maximum retained events</Label>
              <Select
                id="retention-limit"
                value={draft.retentionLimit}
                onChange={(event) => patch({ retentionLimit: Number(event.target.value) })}
                className="mt-1.5 max-w-[220px]"
              >
                {RETENTION_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} events
                  </option>
                ))}
              </Select>
              <FieldHint>
                Oldest records are removed when the limit is reduced or new events arrive.
                Currently storing {events.length} event{events.length === 1 ? "" : "s"}.
              </FieldHint>
            </div>
            <Callout tone="neutral" title="Browser-local storage only">
              Records live in this browser’s localStorage and are not synced to a server. A
              different browser, a cleared profile, or private browsing starts with a fresh
              seeded dataset. There is no durable server-side event history.
            </Callout>
          </SettingsSection>
        </div>

        <div className="space-y-5 xl:col-span-5">
          <SettingsSection
            id="ai"
            title="AI analysis"
            description="Optional Gemini narration over locally computed facts."
            icon={Sparkles}
          >
            <ToggleRow
              id="ai-enabled"
              label="Use Gemini when available"
              description="When off, all explanations, summaries, insights, and searches use deterministic local logic. The app remains functional."
              checked={draft.aiEnabled}
              onCheckedChange={(checked) => patch({ aiEnabled: checked })}
            />

            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
                  <KeyRound aria-hidden="true" className="size-3.5 text-muted" />
                  Server configuration
                </p>
                <Badge tone={health.tone}>{health.label}</Badge>
              </div>
              <dl className="mt-2.5 space-y-1.5 text-[10.5px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Provider</dt>
                  <dd className="text-right text-ink-2">Google Gemini</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Model</dt>
                  <dd className="text-right font-mono text-ink-2">
                    {aiHealth?.model ?? DEFAULT_GEMINI_MODEL}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Connection</dt>
                  <dd className="text-right text-ink-2">
                    {health.verified
                      ? `Verified${aiHealth?.latencyMs !== undefined ? ` · ${aiHealth.latencyMs} ms` : ""}`
                      : health.usable
                        ? "Unverified"
                        : "Not verified"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Key variable</dt>
                  <dd className="text-right font-mono text-ink-2">
                    {aiHealth?.keySource ?? "not found"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Prompt version</dt>
                  <dd className="text-right font-mono text-ink-2">
                    {aiHealth?.promptVersion ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Request cap</dt>
                  <dd className="text-right text-ink-2">
                    {AI_LIMITS.rateLimitRequestsPerMinute}/min per instance
                  </dd>
                </div>
              </dl>
              <p className="mt-2.5 text-[10.5px] leading-5 text-ink-2">
                {health.detail}
              </p>
              {aiHealth?.modelNotice ? (
                <p className="mt-1 text-[10.5px] leading-5 text-amber">
                  {aiHealth.modelNotice}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2.5"
                onClick={() => void refreshAiHealth(true)}
                disabled={aiHealthStatus === "checking"}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn("size-3.5", aiHealthStatus === "checking" && "animate-spin")}
                />
                Test connection
              </Button>
            </div>

            <Callout tone="neutral" title="How the key is handled">
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>
                  Set <code className="font-mono text-[10.5px]">GEMINI_API_KEY</code> as a
                  server-only environment variable.
                </li>
                <li>
                  RingCare AI is pinned to{" "}
                  <code className="font-mono text-[10.5px]">{GEMINI_MODEL_ID}</code>. A{" "}
                  <code className="font-mono text-[10.5px]">GEMINI_MODEL</code> value that names
                  a different model is ignored.
                </li>
                <li>
                  The key is read only in server API routes. It is never included in client
                  bundles, responses, logs, or this settings page.
                </li>
              </ol>
            </Callout>
            <p className="text-[10.5px] leading-5 text-muted">
              The connection check calls Gemini’s free model-metadata endpoint with your
              server-side key, so it verifies validity without spending generation tokens.{" "}
              <a
                href="https://ai.google.dev/gemini-api/docs/api-key"
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-brand underline underline-offset-2"
              >
                Gemini API key documentation
              </a>
              .
            </p>
          </SettingsSection>

          <SettingsSection
            id="simulator"
            title="Demo simulator"
            description="Controls synthetic events. Everything it produces is labelled simulated."
            icon={FlaskConical}
          >
            <ToggleRow
              id="auto-generate-settings"
              label="Auto-generate simulated events"
              description="Adds one event on an interval while this tab is open. Never sends AI requests automatically."
              checked={draft.autoGenerateEnabled}
              onCheckedChange={(checked) => patch({ autoGenerateEnabled: checked })}
            />
            <div>
              <Label htmlFor="auto-interval-settings">Interval</Label>
              <Select
                id="auto-interval-settings"
                value={draft.autoGenerateIntervalSeconds}
                onChange={(event) =>
                  patch({ autoGenerateIntervalSeconds: Number(event.target.value) })
                }
                disabled={!draft.autoGenerateEnabled}
                className="mt-1.5 max-w-[180px]"
              >
                {AUTO_INTERVAL_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    Every {seconds} seconds
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-[10.5px] leading-5 text-muted">
              The simulator panel on the overview page uses the same settings. Automatic
              generation stops when this tab is closed.
            </p>
          </SettingsSection>

          <SettingsSection
            id="data"
            title="Demo data"
            description="Destructive actions affect only this browser’s demo records."
            icon={Database}
          >
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmReset(true)}
                className="justify-start"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Reset demo data
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmClear(true)}
                className="justify-start"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Clear all recorded events
              </Button>
            </div>
            <p className="text-[10.5px] leading-5 text-muted">
              Settings, theme, and caregiver configuration are kept. Reset loads a fresh
              seeded dataset; clear leaves the demo empty until you add events.
            </p>
            <Callout tone="warning" icon={AlertTriangle} title="Not real home data">
              These actions do not affect any real device, Ring account, or server-side
              records. There are no server-side records to delete.
            </Callout>
          </SettingsSection>
        </div>
      </div>

      {dirty ? (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-strong bg-surface/95 px-4 py-3 shadow-raised backdrop-blur">
          <p className="text-[12px] text-ink-2">Unsaved settings changes.</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={discard} disabled={saving}>
              Discard
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="size-3.5" />
              )}
              Save changes
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the demo dataset?"
        description="This replaces all recorded demo events with a freshly seeded simulated dataset. Settings and caregiver configuration are kept. This cannot be undone."
        confirmLabel="Reset demo data"
        tone="primary"
        onConfirm={handleReset}
      />
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all recorded events?"
        description="This removes every event and explanation stored in this browser. Settings are kept. This cannot be undone."
        confirmLabel="Clear all events"
        onConfirm={handleClear}
      />
    </form>
  );
}
