import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import {
  FolderOpen,
  ClipboardList,
  Banknote,
  Printer,
  Handshake,
  Puzzle,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

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
    icon: LucideIcon;
    title: string;
    desc: string;
    href: string;
    primary?: boolean;
  }> = [
    {
      id: "docs",
      icon: FolderOpen,
      title: t("hub.docs.title", lang),
      desc: t("hub.docs.desc", lang),
      href: "/business/hub/docs",
      primary: true,
    },
    {
      id: "templates",
      icon: ClipboardList,
      title: lang === "en" ? "My templates" : "我的模版",
      desc:
        lang === "en"
          ? "Copy self-use / exclusive templates (edit discount or fee split; platform 2% fixed)"
          : "拷贝自用/独享模版（改折扣或总率/小奖/大奖；平台 2% 固定）",
      href: "/business/templates",
    },
    {
      id: "issue-self",
      icon: Banknote,
      title: t("hub.issueSelf.title", lang),
      desc: t("hub.issueSelf.desc", lang),
      href: "/business/issue-self",
    },
    {
      id: "physical",
      icon: Printer,
      title: t("hub.physical.title", lang),
      desc: t("hub.physical.desc", lang),
      href: "/business/physical",
    },
    {
      id: "partners",
      icon: Handshake,
      title: t("hub.partners.title", lang),
      desc: t("hub.partners.desc", lang),
      href: "/business/partners",
    },
  ];

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
        <h1 className="text-lg font-semibold text-foreground">{t("hub.title", lang)}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t("hub.subtitle", lang)}</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        <p className="text-[11px] text-muted-foreground">{t("hub.sectionCore", lang)}</p>
        <div className="grid grid-cols-1 gap-2">
          {modules
            .filter((m) => m.primary)
            .map((m) => {
              const Icon = m.icon;
              return (
                <Link key={m.id} href={m.href}>
                  <Card className="hover:border-primary/40 border-primary/15 bg-primary/5 transition-colors active:scale-[0.98]">
                    <CardContent className="p-4 flex items-center gap-3">
                      <Icon size={26} className="text-primary shrink-0" strokeWidth={1.8} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{m.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {m.desc}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-primary shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
        </div>

        <p className="text-[11px] text-muted-foreground pt-2">{t("hub.sectionTools", lang)}</p>
        <div className="grid grid-cols-2 gap-2">
          {modules
            .filter((m) => !m.primary)
            .map((m) => {
              const Icon = m.icon;
              return (
                <Link key={m.id} href={m.href}>
                  <Card className="hover:border-primary/30 transition-colors h-full active:scale-[0.98]">
                    <CardContent className="p-3 flex flex-col gap-1.5 min-h-[96px]">
                      <Icon size={22} className="text-muted-foreground" strokeWidth={1.8} />
                      <p className="text-sm font-medium text-foreground">{m.title}</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                        {m.desc}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
        </div>

        <p className="text-[11px] text-muted-foreground pt-2">{t("hub.sectionCustom", lang)}</p>
        <Card className="border-dashed border-border bg-muted/40">
          <CardContent className="p-4 text-center">
            <Puzzle size={22} className="mx-auto mb-1 text-muted-foreground" strokeWidth={1.8} />
            <p className="text-sm font-medium text-foreground/80">
              {t("hub.customEmptyTitle", lang)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              {t("hub.customEmptyBody", lang)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
