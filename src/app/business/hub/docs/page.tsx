import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReceiptChat } from "@/app/business/receipt/ReceiptChat";

/**
 * 资料仓：企业资料统一入口。
 * 当前核心能力 = 票据上传/识别；后续可扩展合同、证照、菜单等。
 */
export default async function HubDocsPage() {
  const session = await getSession();
  if (
    !session ||
    (session.role !== "business" && session.role !== "staff")
  ) {
    redirect("/auth/login");
  }

  const c = await cookies();
  const lang = (c.get("gwm_lang")?.value === "en" ? "en" : "zh") as "zh" | "en";
  const isStaff = session.role === "staff";
  const backHref = isStaff ? "/business" : "/business/hub";
  const backLabel = isStaff
    ? lang === "en"
      ? "Store desk"
      : "本店工作台"
    : lang === "en"
      ? "Tools"
      : "工具";

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="text-xs text-primary shrink-0 py-1 flex items-center gap-0.5 active:scale-[0.97] transition-transform"
          >
            <ArrowLeft size={13} /> {backLabel}
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">{t("hub.docs.title", lang)}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isStaff
                ? lang === "en"
                  ? "Upload store receipts · company can review later"
                  : "本店上传票据 · 企业主可统一查阅"
                : t("hub.docs.pageHint", lang)}
            </p>
          </div>
        </div>
      </div>

      {/* 资料类型入口：目前仅票据，预留扩展位 */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-primary text-primary-foreground">
            {t("hub.docs.receipts", lang)}
          </span>
          <span className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-muted-foreground">
            {t("hub.docs.soon", lang)}
          </span>
        </div>
      </div>

      <ReceiptChat />
    </div>
  );
}
