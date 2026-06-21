"use client";

import { useRouter } from "next/navigation";

interface BackHeaderProps {
  title?: string;
  fallbackUrl?: string;
}

export function BackHeader({ title, fallbackUrl = "/" }: BackHeaderProps) {
  const router = useRouter();

  return (
    <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-100">
      <div className="flex items-center h-11 px-3">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.push(fallbackUrl);
            }
          }}
          className="flex items-center gap-1 text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        {title && (
          <h1 className="flex-1 text-center text-sm font-semibold text-slate-900 truncate px-2">
            {title}
          </h1>
        )}
      </div>
    </div>
  );
}
