"use client";

import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-medium rounded-full transition-colors disabled:opacity-50 disabled:pointer-events-none";

  const variants: Record<string, string> = {
    primary: "bg-[#1A6EFF] text-white hover:bg-[#1555CC] active:bg-[#1044AA]",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300",
    outline: "border border-slate-200 text-slate-900 hover:bg-slate-50 active:bg-slate-100",
    ghost: "text-slate-600 hover:bg-slate-100 active:bg-slate-200",
    danger: "bg-red-500 text-white hover:bg-red-600 active:bg-red-700",
  };

  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-xs gap-1",
    md: "h-10 px-5 text-sm gap-2",
    lg: "h-12 px-6 text-base gap-2",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
