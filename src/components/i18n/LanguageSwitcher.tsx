"use client";

import { useRouter } from "next/navigation";
import { useLang } from "./LanguageProvider";

interface LanguageSwitcherProps {
  variant?: "default" | "light";
}

export function LanguageSwitcher({ variant = "default" }: LanguageSwitcherProps) {
  const { lang, setLang } = useLang();
  const router = useRouter();

  function handleSwitch() {
    const nextLang = lang === "zh" ? "en" : "zh";
    setLang(nextLang);
    router.refresh();
  }

  const isLight = variant === "light";

  return (
    <button
      onClick={handleSwitch}
      className={`text-xs px-2 py-1 rounded-full border transition-colors ${
        isLight
          ? "border-white/20 text-white/70 hover:bg-white/10"
          : "border-slate-200 text-slate-500 hover:bg-slate-100"
      }`}
      title={lang === "zh" ? "Switch to English" : "切换到中文"}
    >
      {lang === "zh" ? "EN" : "中"}
    </button>
  );
}
