import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { ReceiptChat } from "@/app/business/receipt/ReceiptChat";

/**
 * 资料仓：企业资料统一入口。
 * 当前核心能力 = 票据上传/识别；后续可扩展合同、证照、菜单等。
 */
export default async function HubDocsPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = (c.get("gwm_lang")?.value === "en" ? "en" : "zh") as "zh" | "en";

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2">
          <Link
            href="/business/hub"
            className="text-xs text-[#1A6EFF] shrink-0 py-1"
          >
            {lang === "en" ? "← Hub" : "← 功能仓"}
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{t("hub.docs.title", lang)}</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("hub.docs.pageHint", lang)}
            </p>
          </div>
        </div>
      </div>

      {/* 资料类型入口：目前仅票据，预留扩展位 */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-[#1A6EFF] text-white">
            {t("hub.docs.receipts", lang)}
          </span>
          <span className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 text-slate-400">
            {t("hub.docs.soon", lang)}
          </span>
        </div>
      </div>

      <ReceiptChat />
    </div>
  );
}
