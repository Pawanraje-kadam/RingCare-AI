import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium leading-5 tracking-[0.01em]",
  {
    variants: {
      tone: {
        neutral: "border-line bg-surface-2 text-ink-2",
        brand: "border-brand/20 bg-brand-soft text-brand",
        routine: "border-brand/20 bg-brand-soft text-brand",
        review: "border-amber/20 bg-amber-soft text-amber",
        attention: "border-danger/20 bg-danger-soft text-danger",
        unknown: "border-line-strong/60 bg-surface-3 text-muted",
        outline: "border-line-strong bg-transparent text-ink-2",
        demo: "border-amber/25 bg-amber-soft text-amber",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
