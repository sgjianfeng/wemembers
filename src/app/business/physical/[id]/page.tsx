import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { Store } from "lucide-react";
import { PhysicalPrintSheet } from "./PhysicalPrintSheet";
import { PhysicalBatchActions } from "./PhysicalBatchActions";

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
      business: {
        select: {
          // 券面展示用品牌名（displayName），公司主体名仅作兜底
          displayName: true,
          businessName: true,
          businessLogo: true,
        },
      },
    },
  });
  if (!batch) notFound();

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const tickets = batch.tickets.map((t) => ({
    code: t.code,
    status: t.status,
    claimUrl: `${origin}/c/${encodeURIComponent(t.code)}`,
  }));

  const stock = batch.tickets.filter((t) => t.status === "printed").length;
  const voided = batch.status === "void";
  const expired =
    !!batch.validUntil && batch.validUntil.getTime() < Date.now();
  const issued = batch.tickets.some(
    (t) =>
      t.status === "sold" ||
      t.status === "claimed" ||
      t.status === "redeemed" ||
      t.status === "boxed"
  );

  return (
    // 底栏 + 安全区，避免滚到底被挡住
    <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      {/* 薄顶栏吸顶：贴在企业顶栏(h-11)下方，勿把编辑表单放进 sticky */}
      <div className="px-4 py-2.5 border-b border-border sticky top-11 z-10 bg-card/95 backdrop-blur-sm print:hidden">
        <Link
          href="/business/physical"
          className="text-xs text-primary font-medium"
        >
          ← {lang === "en" ? "Batches" : "批次列表"}
        </Link>
        <div className="flex items-start gap-2 mt-1">
          <h1 className="text-base font-semibold text-foreground flex-1 min-w-0 truncate">
            {batch.title}
          </h1>
          {voided && (
            <span className="shrink-0 text-[10px] font-bold rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {lang === "en" ? "Voided" : "已作废"}
            </span>
          )}
          {!voided && expired && (
            <span className="shrink-0 text-[10px] font-bold rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5">
              {lang === "en" ? "Expired" : "已过期"}
            </span>
          )}
          {!voided && !expired && issued && (
            <span className="shrink-0 text-[10px] font-bold rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5">
              {lang === "en" ? "Live" : "已开售"}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 nums flex-wrap">
          <Store size={12} className="shrink-0" aria-hidden />
          {batch.store.name}
          {batch.type === "voucher"
            ? ` · S$${formatMoney(batch.valueCents)}`
            : lang === "en"
              ? " · Draw"
              : " · 抽奖"}
          {` · ${batch.tickets.length} `}
          {lang === "en" ? "codes" : "张"}
          {batch.validUntil && (
            <>
              <span className="text-border mx-0.5">·</span>
              <span
                className={
                  expired
                    ? "text-amber-600 dark:text-amber-400 font-medium"
                    : undefined
                }
              >
                {lang === "en" ? "Until" : "有效至"}{" "}
                {batch.validUntil.toLocaleDateString(
                  lang === "zh" ? "zh-CN" : "en-SG"
                )}
              </span>
            </>
          )}
        </p>
      </div>

      {/* 批次管理：默认收起；展开也不 sticky，整页可滚 */}
      <div className="px-4 pt-3 space-y-2 print:hidden">
        <PhysicalBatchActions
          batchId={batch.id}
          lang={lang}
          stock={stock}
          voided={voided}
          validUntil={batch.validUntil?.toISOString() ?? null}
          issued={issued}
          type={batch.type}
          title={batch.title}
          valueCents={batch.valueCents}
          description={batch.description}
        />
        {!batch.business.businessLogo && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            {lang === "en" ? (
              <>
                No brand logo —{" "}
                <Link
                  href="/business/settings"
                  className="underline font-medium"
                >
                  Settings
                </Link>
              </>
            ) : (
              <>
                尚未上传 Logo —{" "}
                <Link
                  href="/business/settings"
                  className="underline font-medium"
                >
                  企业设置
                </Link>
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
        businessName={
          batch.business.displayName?.trim() ||
          batch.business.businessName
        }
        businessLogo={batch.business.businessLogo}
        validUntil={batch.validUntil?.toISOString() ?? null}
        tickets={tickets}
        visualTemplateId={batch.visualTemplateId}
        themeColor={batch.themeColor}
        description={batch.description}
      />
    </div>
  );
}
