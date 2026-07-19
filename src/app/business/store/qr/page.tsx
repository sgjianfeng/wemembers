import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { StoreQrPrintClient } from "@/app/business/stores/[id]/qr/StoreQrPrintClient";

/** 店员本店二维码打印（路径不在 /business/stores 封锁下） */
export default async function StaffStoreQrPage() {
  const session = await getSession();
  if (!session || session.role !== "staff" || !session.storeId) {
    redirect("/auth/login");
  }

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const store = await prisma.store.findUnique({
    where: { id: session.storeId },
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
  if (!store) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        {lang === "en" ? "Store not found" : "门店不存在"}
      </div>
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const publicUrl = store.business.businessSlug
    ? `${origin}/shop/${store.business.businessSlug}/${store.slug}`
    : `${origin}/store/${store.slug}`;

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10 print:hidden">
        <Link href="/business/store" className="text-xs text-[#1A6EFF] font-medium">
          ← {lang === "en" ? "Store info" : "本店信息"}
        </Link>
        <h1 className="text-lg font-semibold mt-1">
          {lang === "en" ? "Store QR · Print" : "本店二维码 · 打印"}
        </h1>
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
