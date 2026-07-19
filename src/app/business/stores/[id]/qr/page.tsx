import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { StoreQrPrintClient } from "./StoreQrPrintClient";

/**
 * 门店二维码 · 打印 / 导出（店内台卡 / 海报）
 * 扫码后进入顾客页 /shop/{company}/{store}
 */
export default async function StoreQrPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const { id } = await params;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const store = await prisma.store.findFirst({
    where: { id, businessId: session.userId },
    include: {
      business: {
        select: {
          businessSlug: true,
          businessName: true,
          businessLogo: true,
        },
      },
    },
  });
  if (!store) notFound();

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const publicUrl = store.business.businessSlug
    ? `${origin}/shop/${store.business.businessSlug}/${store.slug}`
    : `${origin}/store/${store.slug}`;

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10 print:hidden">
        <Link
          href={`/business/stores/${store.id}`}
          className="text-xs text-[#1A6EFF] font-medium"
        >
          ← {lang === "en" ? "Back to store" : "返回门店"}
        </Link>
        <h1 className="text-lg font-semibold mt-1">
          {lang === "en" ? "Store QR · Print & export" : "本店二维码 · 打印导出"}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {lang === "en"
            ? "Table tent / counter poster · customers scan → store page"
            : "台卡 / 吧台海报 · 顾客扫码进入本店顾客页"}
        </p>
      </div>

      <StoreQrPrintClient
        lang={lang}
        storeId={store.id}
        storeName={store.name}
        address={store.address}
        publicUrl={publicUrl}
        businessName={store.business.businessName}
        businessLogo={store.business.businessLogo}
      />
    </div>
  );
}
