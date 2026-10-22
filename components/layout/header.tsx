"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FlaskConical, Menu } from "lucide-react";
import { BrandMark } from "@/components/brand/brand";
import { Button } from "@/components/ui/button";
import { AiStatusChip } from "./ai-status-chip";
import { DemoDialog } from "./demo-dialog";
import { getActiveNavItem } from "./nav-config";
import { ThemeToggle } from "./theme-toggle";

export function Header({ onOpenNav }: { onOpenNav: () => void }) {
  const pathname = usePathname();
  const active = getActiveNavItem(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-[64px] w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onOpenNav}
          aria-label="Open navigation menu"
        >
          <Menu aria-hidden="true" className="size-5" />
        </Button>

        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-md lg:hidden"
          aria-label="RingCare AI home"
        >
          <BrandMark size={28} />
          <span className="text-[14px] font-semibold tracking-[-0.02em] text-ink">
            RingCare <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand">AI</span>
          </span>
        </Link>

        <div className="hidden min-w-0 lg:block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Demo workspace
          </p>
          <p className="truncate text-[13px] font-medium text-ink">
            {active?.label ?? "Overview"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span className="hidden sm:inline-flex">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-amber/25 bg-amber-soft px-2.5 py-1 text-[11px] font-medium text-amber"
              title="Every event in this application is synthetic and clearly labelled as simulated."
            >
              <FlaskConical aria-hidden="true" className="size-3" />
              Demo mode
            </span>
          </span>
          <span className="hidden md:inline-flex">
            <AiStatusChip />
          </span>
          <ThemeToggle />
          <DemoDialog />
        </div>
      </div>
    </header>
  );
}
