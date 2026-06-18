"use client";

import { useRouter } from "next/navigation";
import { useLang } from "./LanguageProvider";

export function LanguageSwitcher() {
  const { lang, setLang } = useLang();
  const router = useRouter();

  function handleSwitch() {
    const nextLang = lang === "zh" ? "en" : "zh";
    setLang(nextLang);
    // Server components need a refresh to re-read the cookie
    router.refresh();
  }

  return (
    <button
      onClick={handleSwitch}
      className="text-xs px-2 py-1 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
      title={lang === "zh" ? "Switch to English" : "切换到中文"}
    >
      {lang === "zh" ? "EN" : "中"}
    </button>
  );
}
