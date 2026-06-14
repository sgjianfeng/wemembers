"use client";

import type { Lang } from "@/lib/i18n";
import { LanguageProvider } from "./LanguageProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function LangWrapper({ children, initialLang }: { children: React.ReactNode; initialLang: Lang }) {
  return (
    <LanguageProvider initialLang={initialLang}>
      <div className="fixed top-2 right-2 z-50">
        <LanguageSwitcher />
      </div>
      {children}
    </LanguageProvider>
  );
}
