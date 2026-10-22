import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-55 motion-safe:active:scale-[0.99]",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-contrast shadow-sm hover:bg-brand-strong",
        secondary:
          "border border-line-strong bg-surface text-ink shadow-sm hover:bg-surface-2",
        outline:
          "border border-line-strong bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
        ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink",
        subtle: "bg-surface-3 text-ink hover:bg-line",
        destructive:
          "border border-danger/25 bg-danger-soft text-danger hover:bg-danger/12",
        link: "h-auto rounded-none p-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9.5 px-4",
        lg: "h-11 px-5",
        icon: "size-9.5",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
