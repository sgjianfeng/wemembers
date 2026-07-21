"use client";

import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { getLangDict, type Lang } from "@/lib/i18n";

const LangContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}>({
  lang: "zh",
  setLang: () => {},
  t: (key: string) => key,
});

export function LanguageProvider({
  children,
  initialLang = "zh",
}: {
  children: React.ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLang] = useState<Lang>(initialLang);
  // 同步加载字典，避免首屏闪 key（auth.register.title 等）
  const [dict, setDict] = useState<Record<string, string>>(() =>
    getLangDict(initialLang)
  );

  useEffect(() => {
    setDict(getLangDict(lang));
  }, [lang]);

  function switchLang(l: Lang) {
    setLang(l);
    document.cookie = `gwm_lang=${l};path=/;max-age=${365 * 24 * 60 * 60};SameSite=Lax`;
  }

  const translate = useMemo(() => {
    const zhFallback = getLangDict("zh");
    return (key: string, params?: Record<string, string | number>): string => {
      // 与服务端 t() 一致：当前语言 → 中文 → key，避免新 key 热更新失败时裸奔
      let text = dict[key] || zhFallback[key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return text;
    };
  }, [dict]);

  return (
    <LangContext.Provider value={{ lang, setLang: switchLang, t: translate }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
