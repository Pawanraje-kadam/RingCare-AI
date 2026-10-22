"use client";

import * as React from "react";
import { AlertTriangle, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { SIDEBAR_STORAGE_KEY } from "@/lib/constants/settings";
import { readStoredValue, writeStoredValue } from "@/lib/storage/safe-storage";
import { z } from "zod";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { storageWarning, dismissStorageWarning } = useApp();

  React.useEffect(() => {
    const stored = readStoredValue(SIDEBAR_STORAGE_KEY, z.boolean());
    if (stored.value !== null) setCollapsed(stored.value);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      const next = !previous;
      writeStoredValue(SIDEBAR_STORAGE_KEY, next);
      return next;
    });
  };

  return (
    <div className="min-h-svh bg-canvas lg:flex">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[90] -translate-y-20 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-contrast transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>

      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setMobileOpen(true)} />

        {storageWarning ? (
          <div
            role="status"
            className="border-b border-amber/20 bg-amber-soft/70"
          >
            <div className="mx-auto flex w-full max-w-[1440px] items-start gap-2.5 px-4 py-2.5 text-[12px] leading-5 text-amber sm:px-6 lg:px-8">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p className="flex-1">{storageWarning}</p>
              <button
                type="button"
                onClick={dismissStorageWarning}
                className="rounded p-1 transition-colors hover:bg-amber/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                aria-label="Dismiss storage notice"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-16 pt-6 focus:outline-none sm:px-6 lg:px-8 lg:pt-8"
        >
          {children}
        </main>

        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-1.5 px-4 py-5 text-[11px] leading-5 text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>
              <span className="font-medium text-ink-2">RingCare AI</span> · Demo
              workspace with synthetic events only.
            </p>
            <p>
              Not a validated security or threat-detection system. Rule results are
              informational.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
