import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";

/**
 * 兼容旧链接 /store/{store-slug}
 * → 新主入口 /shop/{company-slug}/{store-slug}
 */
export default async function LegacyStoreRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await prisma.store.findUnique({
    where: { slug },
    include: {
      business: { select: { businessSlug: true } },
    },
  });
  if (!store?.business?.businessSlug) notFound();
  redirect(`/shop/${store.business.businessSlug}/${store.slug}`);
}
