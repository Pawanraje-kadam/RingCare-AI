// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProvider } from "@/components/providers/app-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DemoDialog } from "@/components/layout/demo-dialog";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    load: vi.fn(() => ({
      events: [],
      found: false,
      storageAvailable: true,
      droppedInvalid: 0,
      corrupted: false,
    })),
    save: vi.fn(() => ({ ok: true })),
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
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
          model: "llama-3.3-70b-versatile",
          modelLabel: "Llama 3.3 70B",
          promptVersion: "2026-10-24.1",
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
});

function renderDemo() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <AppProvider storage={memoryStorage() as never}>
          <DemoDialog />
        </AppProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("guided demo", () => {
  it("keeps the primary action outside the scrolling body so it is always reachable", async () => {
    const user = userEvent.setup();
    renderDemo();

    const trigger = await screen.findByRole("button", { name: /run demo/i });
    await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    const scrollBody = dialog.querySelector("[data-demo-scroll]");
    const footer = dialog.querySelector("[data-demo-footer]");
    const start = screen.getByRole("button", { name: /start guided demo/i });

    expect(scrollBody).toBeTruthy();
    expect(footer).toBeTruthy();
    expect(scrollBody?.contains(start)).toBe(false);
    expect(footer?.contains(start)).toBe(true);
    expect((start as HTMLButtonElement).disabled).toBe(false);

    // Both options are real, clickable checkboxes.
    const resetOption = screen.getByRole("checkbox", {
      name: /reset demo data first/i,
    }) as HTMLInputElement;
    const explanationOption = screen.getByRole("checkbox", {
      name: /ask groq/i,
    }) as HTMLInputElement;
    expect(resetOption.checked).toBe(true);
    expect(explanationOption.checked).toBe(true);

    await user.click(resetOption);
    expect(resetOption.checked).toBe(false);
    await user.click(explanationOption);
    expect(explanationOption.checked).toBe(false);
  });

  it(
    "runs the guided demo end to end without sending an AI request when unchecked",
    async () => {
      const user = userEvent.setup();
      renderDemo();

      const trigger = await screen.findByRole("button", { name: /run demo/i });
      await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
      await user.click(trigger);

      await user.click(
        screen.getByRole("checkbox", { name: /ask groq/i }),
      );
      await user.click(screen.getByRole("button", { name: /start guided demo/i }));

      expect(
        await screen.findByText(/demo complete/i, {}, { timeout: 20_000 }),
      ).toBeTruthy();
      expect(screen.getByText(/generated summary/i)).toBeTruthy();
      expect(
        screen.getByRole("button", { name: /run again/i }),
      ).toBeTruthy();

      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock
        .calls as unknown as Array<[string, RequestInit?]>;
      const aiCalls = calls.filter(([url]) => String(url).startsWith("/api/ai/"));
      expect(aiCalls.length).toBe(0);
    },
    25_000,
  );
});
