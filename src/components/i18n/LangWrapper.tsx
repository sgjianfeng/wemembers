"use client";

import type { Lang } from "@/lib/i18n";
import { LanguageProvider } from "./LanguageProvider";

export function LangWrapper({ children, initialLang }: { children: React.ReactNode; initialLang: Lang }) {
  return (
    <LanguageProvider initialLang={initialLang}>
      {children}
    </LanguageProvider>
  );
}
