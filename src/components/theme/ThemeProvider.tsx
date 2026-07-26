"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * next-themes: class strategy → <html class="dark">，与 globals.css .dark tokens 对齐。
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="gwm_theme"
    >
      {children}
    </NextThemesProvider>
  );
}
