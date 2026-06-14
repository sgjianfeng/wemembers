import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTierConfigs } from "@/lib/points";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import { TierConfigForm } from "./TierConfigForm";

export default async function TierConfigPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const configs = await getTierConfigs(session.userId);

  const tierIcons: Record<string, string> = {
    regular: "⭐",
    silver: "🥈",
    gold: "🥇",
    platinum: "💎",
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">{t("business.tier.config.title", lang)}</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {t("business.tier.config.subtitle", lang)}
        </p>
      </div>

      <div className="px-4 mt-4">
        <TierConfigForm
          configs={JSON.parse(JSON.stringify(configs))}
          tierIcons={tierIcons}
        />
      </div>
    </div>
  );
}
