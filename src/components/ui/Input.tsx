import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  prefix?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, prefix, error, style, ...props }, ref) => {
    return (
      <div className="w-full min-w-0 max-w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1.5 break-words">
            {label}
          </label>
        )}
        <div className="relative min-w-0 max-w-full">
          {prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {prefix}
            </span>
          )}
          <input
            type={type}
            // Safari 聚焦：强制 16px，避免整页缩放导致「变形」
            style={{ fontSize: 16, lineHeight: "1.4", ...style }}
            className={cn(
              "block h-11 w-full min-w-0 max-w-full box-border appearance-none rounded-lg border border-input bg-background px-3 py-0",
              "file:border-0 file:bg-transparent file:text-sm file:font-medium",
              "placeholder:text-muted-foreground",
              // 不用 ring：Safari 圆角 + ring 易出现双边框/拉伸感
              "outline-none focus:outline-none focus:ring-0 focus-visible:ring-0",
              "focus:border-primary",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "transition-[border-color] duration-150",
              prefix && "pl-10",
              error && "border-destructive focus:border-destructive",
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && <p className="mt-1 text-xs text-destructive break-words">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
