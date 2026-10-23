// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OverviewPage from "@/app/dashboard/page";
import { AppProvider } from "@/components/providers/app-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import type { EventStorage } from "@/lib/events/store";
import type { RingCareEvent } from "@/types/events";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
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
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
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
        demoMode: true,
        eventSource: "simulated_ring",
        storage: "browser_local",
        ai: {
          configured: false,
          provider: "Groq",
          model: "openai/gpt-oss-120b",
          modelLabel: "GPT-OSS 120B",
          promptVersion: "2026-10-23.1",
          credentialsVerified: false,
          verificationStatus: "not_configured",
          verificationMessage:
            "No server-side Groq key was found. Set GROQ_API_KEY and redeploy.",
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

describe("overview dashboard", () => {
  it("hydrates from the seed data, shows the demo boundary, and simulates an event", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ToastProvider>
          <AppProvider storage={memoryStorage()}>
            <OverviewPage />
          </AppProvider>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: /your front door, understood/i }),
    ).toBeTruthy();
    expect(screen.getByText(/this is a simulation, not a security system/i)).toBeTruthy();
    expect(screen.getByText("Events recorded")).toBeTruthy();
    expect(screen.getByText("Rules-only mode")).toBeTruthy();
    expect(await screen.findByText("Today, in plain language")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getAllByText(/deterministic fallback/i).length).toBeGreaterThan(0);
    });

    const deliveryButton = screen.getByRole("button", {
      name: /Deliver event|Delivery event/i,
    });
    await user.click(deliveryButton);
    expect(await screen.findByText(/Delivery event simulated/i)).toBeTruthy();
  });
});
