import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";

export default async function StoreSettingsPage() {
  const session = await getSession();
  if (!session || session.role !== "staff" || !session.storeId)
    redirect("/auth/login");

  const store = await prisma.store.findUnique({
    where: { id: session.storeId },
  });
  if (!store)
    return <div className="p-8 text-center text-slate-400">门店不存在</div>;

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const storeUrl = `${origin}/store/${store.slug}`;

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100">
        <h1 className="text-lg font-semibold">本店信息</h1>
      </div>
      <div className="px-4 mt-4 space-y-4">
        {/* 门店信息 */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              🏪 {store.name}
            </h3>
            {store.address && (
              <p className="text-xs text-slate-500">📍 {store.address}</p>
            )}
            {store.phone && (
              <p className="text-xs text-slate-500">📞 {store.phone}</p>
            )}
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              📱 门店二维码
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              客户扫码进入本店页面，查看并领取代金券
            </p>
            <div className="flex justify-center">
              <div className="w-48 h-48 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/api/store/qr?size=192"
                  alt="门店二维码"
                  className="w-full h-full"
                />
              </div>
            </div>
            <div className="mt-3 bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">本店链接</p>
              <p className="text-sm font-mono text-slate-700 break-all">
                {storeUrl}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 使用建议 */}
        <div className="p-4 bg-[#1A6EFF]/5 rounded-xl">
          <h4 className="text-xs font-semibold text-[#1A6EFF] mb-2">
            💡 使用说明
          </h4>
          <ul className="text-xs text-slate-500 space-y-1">
            <li>• 打印二维码贴在收银台或桌面</li>
            <li>• 客户扫码即可领券并成为会员</li>
            <li>• 核销入口：「📷 核销」底部 Tab</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
