import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        blue: "border-transparent bg-blue-50 dark:bg-blue-950/35 text-blue-700 dark:text-blue-400",
        green: "border-transparent bg-green-50 dark:bg-green-950/35 text-green-700 dark:text-green-400",
        orange:
          "border-transparent bg-orange-50 dark:bg-orange-950/35 text-orange-700 dark:text-orange-400",
        red: "border-transparent bg-red-50 dark:bg-red-950/35 text-red-700 dark:text-red-400",
        slate: "border-transparent bg-muted text-muted-foreground",
        purple:
          "border-transparent bg-purple-50 dark:bg-purple-950/35 text-purple-700 dark:text-purple-300",
        amber:
          "border-transparent bg-amber-50 dark:bg-amber-950/35 text-amber-700 dark:text-amber-400",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px]",
        md: "px-2 py-0.5 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
