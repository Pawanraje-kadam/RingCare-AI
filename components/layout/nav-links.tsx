"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { NAV_ITEMS } from "./nav-config";

const groups = ["Monitor", "Configure"] as const;

export function NavLinks({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-6">
      {groups.map((group) => {
        const items = NAV_ITEMS.filter((item) => item.group === group);
        return (
          <div key={group}>
            {!collapsed ? (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted/80">
                {group}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-line" aria-hidden="true" />
            )}
            <ul className="space-y-1">
              {items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-white/[0.08] text-sidebar-ink shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                          : "text-sidebar-muted hover:bg-white/[0.04] hover:text-sidebar-ink",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-0 h-4 w-0.5 rounded-full bg-sidebar-accent transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-[17px] shrink-0 transition-colors",
                          active
                            ? "text-sidebar-accent"
                            : "text-sidebar-muted group-hover:text-sidebar-ink",
                        )}
                      />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                      {collapsed ? <span className="sr-only">{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
