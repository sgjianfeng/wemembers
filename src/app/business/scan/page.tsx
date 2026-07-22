import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import ScanClient from "./ScanClient";

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== "business" && session.role !== "staff")) {
    redirect("/auth/login");
  }

  const sp = await searchParams;
  const queryStoreId = sp.storeId?.trim() || null;

  // 店员：固定本店
  if (session.role === "staff") {
    const storeRow = session.storeId
      ? await prisma.store.findUnique({
          where: { id: session.storeId },
          select: {
            id: true,
            name: true,
            business: { select: { businessLogo: true } },
          },
        })
      : null;
    return (
      <ScanClient
        storeId={storeRow?.id || null}
        storeName={storeRow?.name || null}
        stores={[]}
        locked
        businessLogo={storeRow?.business.businessLogo}
      />
    );
  }

  // 企业：可选 query ?storeId= 指定门店；否则页面内选店（无全局「当前门店」）
  const [stores, business] = await Promise.all([
    prisma.store.findMany({
      where: { businessId: session.userId },
      select: { id: true, name: true, address: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { businessLogo: true },
    }),
  ]);

  const selected =
    (queryStoreId && stores.find((s) => s.id === queryStoreId)) || null;

  return (
    <ScanClient
      storeId={selected?.id || null}
      storeName={selected?.name || null}
      stores={stores.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
      }))}
      locked={false}
      businessLogo={business?.businessLogo}
    />
  );
}
