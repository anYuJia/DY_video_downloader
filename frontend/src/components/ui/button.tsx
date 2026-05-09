import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[0.8125rem] font-medium transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-[var(--duration-fast)] ease-[var(--ease-spring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-white shadow-sm hover:bg-accent-hover hover:shadow-[var(--shadow-glow)] active:scale-[0.98]",
        secondary:
          "bg-surface-raised text-text border border-border hover:bg-surface hover:border-border-strong active:scale-[0.98]",
        outline:
          "border border-border bg-transparent text-text-secondary hover:text-text hover:bg-surface-raised hover:border-border-strong active:scale-[0.98]",
        ghost:
          "text-text-secondary hover:text-text hover:bg-surface-raised active:scale-[0.98]",
        danger:
          "bg-danger text-white shadow-sm hover:brightness-110 active:scale-[0.98]",
        "danger-outline":
          "border border-danger/25 bg-danger-soft text-danger hover:bg-danger hover:text-white active:scale-[0.98]",
        "success-outline":
          "border border-success/25 bg-success-soft text-success hover:bg-success hover:text-white active:scale-[0.98]",
        "info-outline":
          "border border-info/25 bg-info-soft text-info hover:bg-info hover:text-white active:scale-[0.98]",
        link:
          "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 rounded-[var(--radius-sm)]",
        sm: "h-8 px-3 text-[0.75rem] rounded-[var(--radius-sm)]",
        lg: "h-11 px-6 text-[0.875rem] rounded-[var(--radius-md)]",
        icon: "h-9 w-9 rounded-[var(--radius-sm)]",
        "icon-sm": "h-8 w-8 rounded-[var(--radius-sm)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
