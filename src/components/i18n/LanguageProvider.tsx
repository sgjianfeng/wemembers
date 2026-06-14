"use client";

import { createContext, useContext, useState, useEffect } from "react";
import type { Lang } from "@/lib/i18n";

const LangContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}>({
  lang: "zh",
  setLang: () => {},
  t: (key: string) => key,
});

export function LanguageProvider({ children, initialLang = "zh" }: { children: React.ReactNode; initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [dict, setDict] = useState<Record<string, string>>({});

  useEffect(() => {
    import("@/lib/i18n").then(({ getLangDict }) => {
      setDict(getLangDict(lang));
    });
  }, [lang]);

  function switchLang(l: Lang) {
    setLang(l);
    document.cookie = `gwm_lang=${l};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`;
  }

  function translate(key: string, params?: Record<string, string | number>): string {
    let text = dict[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  }

  return (
    <LangContext.Provider value={{ lang, setLang: switchLang, t: translate }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
