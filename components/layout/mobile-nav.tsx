"use client";

import { FlaskConical } from "lucide-react";
import { Brand } from "@/components/brand/brand";
import { Sheet } from "@/components/ui/sheet";
import { NavLinks } from "./nav-links";

export function MobileNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Navigation"
      description="RingCare AI sections"
    >
      <div className="flex h-full flex-col">
        <div className="flex h-[76px] items-center border-b border-sidebar-line px-5">
          <Brand onNavigate={() => onOpenChange(false)} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <NavLinks onNavigate={() => onOpenChange(false)} />
        </div>
        <div className="border-t border-sidebar-line p-4">
          <div className="flex gap-2.5 rounded-xl border border-sidebar-line bg-white/[0.035] p-3.5">
            <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber" />
            <div>
              <p className="text-[11.5px] font-semibold text-sidebar-ink">Demo mode</p>
              <p className="mt-0.5 text-[11px] leading-4 text-sidebar-muted">
                All events are synthetic. No Ring account or camera is connected.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
