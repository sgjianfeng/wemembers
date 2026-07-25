import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * 功能仓：资料仓 + 企业工具 + 未来定制模块
 * 默认至少有「资料仓」；其它为通用能力，后续可按企业配置显隐。
 */
export default async function BusinessHubPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = (c.get("gwm_lang")?.value === "en" ? "en" : "zh") as "zh" | "en";

  const modules: Array<{
    id: string;
    icon: string;
    title: string;
    desc: string;
    href: string;
    primary?: boolean;
  }> = [
    {
      id: "docs",
      icon: "📂",
      title: t("hub.docs.title", lang),
      desc: t("hub.docs.desc", lang),
      href: "/business/hub/docs",
      primary: true,
    },
    {
      id: "issue-self",
      icon: "💵",
      title: t("hub.issueSelf.title", lang),
      desc: t("hub.issueSelf.desc", lang),
      href: "/business/issue-self",
    },
    {
      id: "physical",
      icon: "🖨️",
      title: t("hub.physical.title", lang),
      desc: t("hub.physical.desc", lang),
      href: "/business/physical",
    },
    {
      id: "partners",
      icon: "🤝",
      title: t("hub.partners.title", lang),
      desc: t("hub.partners.desc", lang),
      href: "/business/partners",
    },
  ];

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">{t("hub.title", lang)}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{t("hub.subtitle", lang)}</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        <p className="text-[11px] text-slate-400">{t("hub.sectionCore", lang)}</p>
        <div className="grid grid-cols-1 gap-2">
          {modules
            .filter((m) => m.primary)
            .map((m) => (
              <Link key={m.id} href={m.href}>
                <Card className="hover:border-[#1A6EFF]/40 border-[#1A6EFF]/15 bg-blue-50/40 transition-colors">
                  <CardContent className="p-4 flex items-center gap-3">
                    <span className="text-3xl leading-none">{m.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{m.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {m.desc}
                      </p>
                    </div>
                    <span className="text-[#1A6EFF] text-sm shrink-0">→</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
        </div>

        <p className="text-[11px] text-slate-400 pt-2">{t("hub.sectionTools", lang)}</p>
        <div className="grid grid-cols-2 gap-2">
          {modules
            .filter((m) => !m.primary)
            .map((m) => (
              <Link key={m.id} href={m.href}>
                <Card className="hover:border-[#1A6EFF]/30 transition-colors h-full">
                  <CardContent className="p-3 flex flex-col gap-1.5 min-h-[96px]">
                    <span className="text-2xl leading-none">{m.icon}</span>
                    <p className="text-sm font-medium text-slate-900">{m.title}</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">
                      {m.desc}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
        </div>

        <p className="text-[11px] text-slate-400 pt-2">{t("hub.sectionCustom", lang)}</p>
        <Card className="border-dashed border-slate-200 bg-slate-50/60">
          <CardContent className="p-4 text-center">
            <p className="text-2xl mb-1">🧩</p>
            <p className="text-sm font-medium text-slate-700">
              {t("hub.customEmptyTitle", lang)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              {t("hub.customEmptyBody", lang)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
