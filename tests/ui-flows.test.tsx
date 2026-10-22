// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "@/app/dashboard/settings/page";
import { TimelineClient } from "@/app/dashboard/timeline/timeline-client";
import { AppProvider } from "@/components/providers/app-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import type { EventStorage } from "@/lib/events/store";
import type { RingCareEvent } from "@/types/events";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/timeline",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function memoryStorage(): EventStorage {
  let stored: RingCareEvent[] | null = null;
  return {
    load: () =>
      stored
        ? {
            events: stored,
            found: true,
            storageAvailable: true,
            droppedInvalid: 0,
            corrupted: false,
          }
        : {
            events: [],
            found: false,
            storageAvailable: true,
            droppedInvalid: 0,
            corrupted: false,
          },
    save: (events) => {
      stored = events;
      return { ok: true };
    },
    clear: () => {
      stored = null;
      return { ok: true };
    },
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ok",
        ai: {
          configured: false,
          provider: "Google Gemini",
          model: "gemini-3.8-flash",
          modelLabel: "Gemini 3.8 Flash",
          promptVersion: "2026-10-23.2",
          credentialsVerified: false,
          verificationStatus: "not_configured",
          verificationMessage:
            "No server-side Gemini key was found. Set GEMINI_API_KEY (or GOOGLE_API_KEY) and redeploy.",
          keySource: null,
        },
        checkedAt: new Date().toISOString(),
      }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppProvider storage={memoryStorage()}>{children}</AppProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe("event timeline", () => {
  it("interprets a natural-language search locally when Gemini is unavailable and filters records", async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <TimelineClient />
      </Providers>,
    );

    expect(
      await screen.findByRole("heading", { name: /event timeline/i }),
    ).toBeTruthy();
    expect(screen.getByText(/active plan:/i)).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: /show delivery-related events from today/i,
      }),
    );

    expect((await screen.findAllByText(/interpreted locally/i)).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getAllByText(/active plan:/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/delivery-related/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/matching event/i).length).toBeGreaterThan(0);
  });
});

describe("settings", () => {
  it("validates and saves deterministic rule settings to local storage", async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <SettingsPage />
      </Providers>,
    );

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();

    const threshold = screen.getByLabelText(/prolonged presence threshold/i);
    await user.clear(threshold);
    await user.type(threshold, "90");

    const saveButtons = screen.getAllByRole("button", { name: /save changes/i });
    expect(saveButtons.length).toBeGreaterThan(0);
    await user.click(saveButtons[0]!);

    expect(await screen.findByText(/settings saved/i)).toBeTruthy();
    await waitFor(() => {
      const stored = window.localStorage.getItem("ringcare.settings.v1");
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toMatchObject({
        prolongedPresenceThresholdSeconds: 90,
      });
    });
  });

  it("rejects an out-of-range threshold instead of saving it", async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <SettingsPage />
      </Providers>,
    );

    const threshold = await screen.findByLabelText(/prolonged presence threshold/i);
    await user.clear(threshold);
    await user.type(threshold, "5");
    await user.click(screen.getAllByRole("button", { name: /save changes/i })[0]!);

    expect(await screen.findByText(/some settings are invalid/i)).toBeTruthy();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    const stored = window.localStorage.getItem("ringcare.settings.v1");
    if (stored) {
      expect(JSON.parse(stored).prolongedPresenceThresholdSeconds).not.toBe(5);
    }
  });
});
