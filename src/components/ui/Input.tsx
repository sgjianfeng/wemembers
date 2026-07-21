import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  prefix?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, prefix, error, ...props }, ref) => {
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
            className={cn(
              "flex h-10 w-full min-w-0 max-w-full box-border rounded-lg border border-input bg-background px-3 py-2 text-base",
              "file:border-0 file:bg-transparent file:text-sm file:font-medium",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              "disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
              prefix && "pl-10",
              error && "border-destructive focus-visible:ring-destructive",
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
