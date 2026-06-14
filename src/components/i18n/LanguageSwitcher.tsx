"use client";

import { useLang } from "./LanguageProvider";

export function LanguageSwitcher() {
  const { lang, setLang } = useLang();

  return (
    <button
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
      className="text-xs px-2 py-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
      title={lang === "zh" ? "Switch to English" : "切换到中文"}
    >
      {lang === "zh" ? "EN" : "中"}
    </button>
  );
}
