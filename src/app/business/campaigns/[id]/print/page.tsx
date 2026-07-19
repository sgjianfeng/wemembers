import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { CampaignPrintClient } from "./CampaignPrintClient";

/**
 * 活动台卡 / 分发版打印
 * - 店内通用：无 seller
 * - 分发版：?seller= 绑定员工/推广人
 */
export default async function CampaignPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const { id } = await params;
  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: session.userId },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      description: true,
      color: true,
      status: true,
      endDate: true,
    },
  });
  if (!campaign) notFound();
  if (!campaign.slug) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        {lang === "en"
          ? "This campaign has no public slug yet."
          : "该活动还没有公开链接 slug，无法生成活动码。"}
        <Link
          href={`/business/campaigns/${id}`}
          className="block mt-3 text-[#1A6EFF]"
        >
          ← {lang === "en" ? "Back" : "返回"}
        </Link>
      </div>
    );
  }

  const business = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      businessName: true,
      businessLogo: true,
      id: true,
    },
  });

  const stores = await prisma.store.findMany({
    where: { businessId: session.userId },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10 print:hidden">
        <Link
          href={`/business/campaigns/${id}`}
          className="text-xs text-[#1A6EFF] font-medium"
        >
          ← {lang === "en" ? "Campaign" : "返回活动"}
        </Link>
        <h1 className="text-lg font-semibold mt-1">
          {lang === "en" ? "Activity card · Print" : "活动卡 · 打印导出"}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {lang === "en"
            ? "Table tent / distributor cards · scan to buy or join draw"
            : "餐桌台卡 / 分发版 · 扫码购券或参加抽奖（与实体券 PT- 不同）"}
        </p>
      </div>

      <CampaignPrintClient
        lang={lang}
        campaignId={campaign.id}
        campaignName={campaign.name}
        slug={campaign.slug}
        type={campaign.type}
        description={campaign.description}
        color={campaign.color}
        status={campaign.status}
        endDate={campaign.endDate.toISOString()}
        businessName={business?.businessName || null}
        businessLogo={business?.businessLogo || null}
        businessUserId={session.userId}
        stores={stores}
      />
    </div>
  );
}
