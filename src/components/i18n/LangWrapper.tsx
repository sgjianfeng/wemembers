"use client";

import type { Lang } from "@/lib/i18n";
import { LanguageProvider } from "./LanguageProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { MobileViewportGuard } from "@/components/mobile/MobileViewportGuard";

export function LangWrapper({ children, initialLang }: { children: React.ReactNode; initialLang: Lang }) {
  return (
    <ThemeProvider>
      <LanguageProvider initialLang={initialLang}>
        <MobileViewportGuard />
        {children}
      </LanguageProvider>
    </ThemeProvider>
  );
}
