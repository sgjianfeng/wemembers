"use client";

import type { Lang } from "@/lib/i18n";
import { LanguageProvider } from "./LanguageProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export function LangWrapper({ children, initialLang }: { children: React.ReactNode; initialLang: Lang }) {
  return (
    <ThemeProvider>
      <LanguageProvider initialLang={initialLang}>
        {children}
      </LanguageProvider>
    </ThemeProvider>
  );
}
