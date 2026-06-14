import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { PartnerActions } from "./PartnerActions";
import { cookies } from "next/headers";
import { t } from "@/lib/i18n";

export default async function PartnersPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const c = await cookies();
  const lang = c.get("gwm_lang")?.value === "en" ? "en" : "zh";

  // 我发出的邀请 (initiator)
  const sent = await prisma.businessPartner.findMany({
    where: { businessId: session.userId },
    include: { partner: { select: { businessName: true, businessCategory: true, businessSlug: true } } },
    orderBy: { updatedAt: "desc" },
  });

  // 我收到的邀请 (receiver)
  const received = await prisma.businessPartner.findMany({
    where: { partnerId: session.userId },
    include: { business: { select: { businessName: true, businessCategory: true, businessSlug: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const statusBadge: Record<string, { variant: "green" | "orange" | "red" | "slate"; label: string }> = {
    active: { variant: "green", label: t("business.partners.active", lang) },
    pending: { variant: "orange", label: t("business.partners.pending", lang) },
    rejected: { variant: "red", label: t("business.partners.rejected", lang) },
    revoked: { variant: "slate", label: t("business.partners.revoked", lang) },
  };

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
        <div>
          <h1 className="text-lg font-semibold">{t("business.partners.title", lang)}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{t("business.partners.subtitle", lang)}</p>
        </div>
        <div className="flex gap-1.5">
          <Link href="/business/settlements" className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-full">
            {t("business.partners.settlements", lang)}
          </Link>
          <Link href="/business/partners/discover" className="px-3 py-1.5 bg-[#1A6EFF] text-white text-xs rounded-full">
            {t("business.partners.discover", lang)}
          </Link>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* 我收到的邀请 */}
        {received.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">{t("business.partners.received", lang)}</h3>
            {received.map((p) => {
              const sb = statusBadge[p.status] || statusBadge.pending;
              return (
                <Card key={p.id} className="mb-2">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🏢</span>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{p.business.businessName}</p>
                          <p className="text-[10px] text-slate-400">
                            {p.source === "invite" ? t("business.partners.invitedBy", lang) : p.source === "apply" ? t("business.partners.appliedToJoin", lang) : t("business.partners.autoMatch", lang)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                    </div>
                    {p.message && <p className="text-xs text-slate-500 mb-2">"{p.message}"</p>}
                    {p.status === "pending" && (
                      <PartnerActions partnershipId={p.id} />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* 我发出的邀请 */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">{t("business.partners.sent", lang)}</h3>
          {sent.length > 0 ? (
            sent.map((p) => {
              const sb = statusBadge[p.status] || statusBadge.pending;
              return (
                <Card key={p.id} className="mb-2">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🏢</span>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{p.partner.businessName}</p>
                          <p className="text-[10px] text-slate-400">
                            {p.source === "invite" ? t("business.partners.youInvited", lang) : p.source === "apply" ? t("business.partners.theyAppliedToJoin", lang) : t("business.partners.autoMatch", lang)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                    </div>
                    {p.status === "active" && (
                      <PartnerActions partnershipId={p.id} canRevoke />
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <div className="text-center py-10 text-slate-400">
              <p className="text-3xl mb-2">🤝</p>
              <p className="text-sm">{t("business.partners.noPartners", lang)}</p>
              <p className="text-xs mt-1">{t("business.partners.noPartnersHint", lang)}</p>
              <Link href="/business/partners/discover" className="inline-block mt-3 px-4 py-1.5 bg-[#1A6EFF] text-white text-xs rounded-full">
                {lang === "zh" ? "发现商家" : "Discover"}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
