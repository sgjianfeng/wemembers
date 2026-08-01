import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  prefix?: string;
  error?: string;
}

/**
 * Safari-safe text field.
 * Outer shell owns border/radius/focus; native input is borderless.
 * Avoids Safari focus ring + password/autofill paint glitches that look like「变形」.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, prefix, error, style, ...props }, ref) => {
    return (
      <div className="w-full min-w-0 max-w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1.5 break-words">
            {label}
          </label>
        )}
        <div
          className={cn(
            "flex h-11 w-full min-w-0 max-w-full items-stretch overflow-hidden rounded-lg",
            "border border-input bg-background",
            "transition-[border-color] duration-150",
            "focus-within:border-primary",
            error && "border-destructive focus-within:border-destructive",
            // className 挂在 shell：可覆盖 h-12 / rounded-xl 等
            className
          )}
        >
          {prefix && (
            <span className="flex shrink-0 items-center pl-3 text-sm text-muted-foreground">
              {prefix}
            </span>
          )}
          <input
            type={type}
            style={{
              fontSize: 16,
              lineHeight: "1.25",
              fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
              ...style,
            }}
            className={cn(
              "gwm-field min-w-0 flex-1 self-stretch border-0 bg-transparent px-3 py-0",
              "appearance-none outline-none focus:outline-none focus:ring-0",
              "file:border-0 file:bg-transparent file:text-sm file:font-medium",
              "placeholder:text-muted-foreground",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "shadow-none",
              prefix && "pl-2"
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
