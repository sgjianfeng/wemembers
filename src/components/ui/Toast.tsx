"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  visible: boolean;
  onClose: () => void;
}

export function Toast({ message, type = "info", visible, onClose }: ToastProps) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [visible, onClose]);

  if (!visible) return null;

  const colors: Record<string, string> = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-slate-800",
  };

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4">
      <div className={cn("px-4 py-2 rounded-full text-white text-sm shadow-lg", colors[type])}>
        {message}
      </div>
    </div>
  );
}

// 全局 toast 管理
let globalToast: ((msg: string, type?: "success" | "error" | "info") => void) | null = null;

export function setToastFn(fn: typeof globalToast) {
  globalToast = fn;
}

export function showToast(message: string, type: "success" | "error" | "info" = "info") {
  globalToast?.(message, type);
}
