"use client";

import { FlaskConical, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Brand } from "@/components/brand/brand";
import { cn } from "@/lib/utils/cn";
import { NavLinks } from "./nav-links";

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-line bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-[84px]" : "w-[268px]",
      )}
      aria-label="Sidebar"
    >
      <div
        className={cn(
          "flex h-[76px] items-center border-b border-sidebar-line px-4",
          collapsed ? "justify-center px-2" : "justify-between",
        )}
      >
        <Brand collapsed={collapsed} />
        {!collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-white/[0.06] hover:text-sidebar-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <PanelLeftClose aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavLinks collapsed={collapsed} />
      </div>

      <div className="border-t border-sidebar-line p-3">
        <div
          className={cn(
            "rounded-xl border border-sidebar-line bg-white/[0.035]",
            collapsed ? "flex justify-center p-2.5" : "p-3.5",
          )}
          title={collapsed ? "Demo mode: all events are synthetic" : undefined}
        >
          <div className={cn("flex gap-2.5", collapsed ? "items-center" : "items-start")}>
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-amber/15 text-amber">
              <FlaskConical aria-hidden="true" className="size-3.5" />
            </span>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold text-sidebar-ink">Demo mode</p>
                <p className="mt-0.5 text-[11px] leading-4 text-sidebar-muted">
                  All events are synthetic. No Ring account or camera is connected.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className={cn("mt-3 flex items-center", collapsed ? "justify-center" : "justify-between px-1")}>
          {!collapsed ? (
            <p className="text-[10.5px] text-sidebar-muted/70">
              RingCare AI · Browser-local demo
            </p>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex size-7 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-white/[0.06] hover:text-sidebar-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
