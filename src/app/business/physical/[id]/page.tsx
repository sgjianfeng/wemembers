import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { PhysicalPrintSheet } from "./PhysicalPrintSheet";

export default async function PhysicalBatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const { id } = await params;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const batch = await prisma.physicalBatch.findFirst({
    where: { id, businessId: session.userId },
    include: {
      store: { select: { id: true, name: true, address: true } },
      tickets: {
        orderBy: { createdAt: "asc" },
        select: { code: true, status: true },
      },
      business: { select: { businessName: true, businessLogo: true } },
    },
  });
  if (!batch) notFound();

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const tickets = batch.tickets.map((t) => ({
    code: t.code,
    status: t.status,
    claimUrl: `${origin}/c/${encodeURIComponent(t.code)}`,
  }));

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10 print:hidden">
        <Link
          href="/business/physical"
          className="text-xs text-[#1A6EFF] font-medium"
        >
          ← {lang === "en" ? "Batches" : "批次列表"}
        </Link>
        <h1 className="text-lg font-semibold mt-1">{batch.title}</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          🏪 {batch.store.name}
          {batch.type === "voucher"
            ? ` · S$${formatMoney(batch.valueCents)}`
            : lang === "en"
              ? " · Draw"
              : " · 抽奖"}
          {` · ${batch.tickets.length} `}
          {lang === "en" ? "codes" : "张"}
        </p>
        {!batch.business.businessLogo && (
          <p className="text-[11px] text-amber-700 mt-1">
            {lang === "en" ? (
              <>
                No brand logo yet —{" "}
                <Link href="/business/settings" className="underline font-medium">
                  upload in Settings
                </Link>{" "}
                for print.
              </>
            ) : (
              <>
                尚未上传品牌 Logo — 请到{" "}
                <Link href="/business/settings" className="underline font-medium">
                  企业设置
                </Link>{" "}
                上传后印刷更完整。
              </>
            )}
          </p>
        )}
      </div>

      <PhysicalPrintSheet
        lang={lang}
        title={batch.title}
        type={batch.type}
        valueCents={batch.valueCents}
        storeName={batch.store.name}
        storeAddress={batch.store.address}
        businessName={batch.business.businessName}
        businessLogo={batch.business.businessLogo}
        validUntil={batch.validUntil?.toISOString() ?? null}
        tickets={tickets}
        visualTemplateId={batch.visualTemplateId}
        themeColor={batch.themeColor}
      />
    </div>
  );
}
