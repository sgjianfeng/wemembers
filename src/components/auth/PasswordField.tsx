"use client";

import { cn } from "@/lib/utils";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/**
 * Safari-safe password field.
 * Border + focus live on the outer shell; the input has no radius/border.
 * Eye toggle is flex sibling (no absolute + translateY).
 */
export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  show,
  onToggleShow,
  showLabel,
  hideLabel,
  autoComplete = "current-password",
  onKeyDown,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  show: boolean;
  onToggleShow: () => void;
  showLabel: string;
  hideLabel: string;
  autoComplete?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  hint?: string;
}) {
  return (
    <div className="w-full min-w-0 max-w-full">
      <label className="block text-sm font-medium text-foreground mb-1.5 break-words">
        {label}
      </label>
      <div
        className={cn(
          "flex h-12 w-full min-w-0 max-w-full items-stretch overflow-hidden rounded-xl",
          "border border-input bg-background",
          "transition-[border-color] duration-150",
          "focus-within:border-primary"
        )}
      >
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          // 16px 防止 iOS 聚焦整页缩放；系统字体避免密码圆点与文字高度跳变
          style={{
            fontSize: 16,
            lineHeight: "1.25",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          }}
          className={cn(
            "gwm-field min-w-0 flex-1 self-stretch border-0 bg-transparent px-3 py-0",
            "appearance-none outline-none focus:outline-none focus:ring-0",
            "placeholder:text-muted-foreground",
            "shadow-none"
          )}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="flex shrink-0 items-center justify-center px-3 text-muted-foreground hover:text-foreground"
          aria-label={show ? hideLabel : showLabel}
          tabIndex={-1}
        >
          <EyeIcon open={show} />
        </button>
      </div>
      {hint && (
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{hint}</p>
      )}
    </div>
  );
}
