import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function BrandMark({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="40" height="40" rx="12" fill="var(--brand)" />
      <path
        d="M20 9.5a10.5 10.5 0 1 0 10.2 13"
        stroke="#F4F2EC"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="20" cy="20" r="3.1" fill="#F4F2EC" />
      <circle cx="29.6" cy="13.2" r="1.9" fill="#D8A868" />
    </svg>
  );
}

export function Brand({
  href = "/dashboard",
  collapsed = false,
  onNavigate,
  className,
}: {
  href?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label="RingCare AI — go to overview"
      className={cn(
        "group flex items-center gap-3 rounded-lg outline-offset-4 focus-visible:outline-2",
        className,
      )}
    >
      <BrandMark />
      {!collapsed ? (
        <span className="min-w-0">
          <span className="flex items-baseline gap-1 text-[15.5px] font-semibold tracking-[-0.03em] text-sidebar-ink">
            RingCare
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-accent">
              AI
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] leading-4 text-sidebar-muted">
            Your front door, understood.
          </span>
        </span>
      ) : null}
    </Link>
  );
}
