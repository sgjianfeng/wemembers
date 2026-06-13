"use client";

import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  prefix?: string;
}

export function Input({ label, error, prefix, className, id, ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          id={id}
          className={cn(
            "w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-900",
            "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A6EFF] focus:border-transparent",
            "disabled:bg-slate-50 disabled:text-slate-400",
            prefix && "pl-8",
            error && "border-red-300 focus:ring-red-500",
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
