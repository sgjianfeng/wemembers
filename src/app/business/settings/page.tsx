import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SERVICE_CATEGORIES } from "@/types";

export default async function BusinessSettingsPage() {
  const session = await getSession();
  if (!session || session.role !== "business") redirect("/auth/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      businessName: true,
      businessSlug: true,
      businessCategory: true,
      email: true,
      phone: true,
      createdAt: true,
    },
  });

  if (!user) redirect("/auth/login");

  const categoryLabel = SERVICE_CATEGORIES.find((c) => c.value === user.businessCategory)?.label;
  const shopUrl = user.businessSlug
    ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/shop/${user.businessSlug}`
    : null;

  return (
    <div className="pb-4">
      <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <h1 className="text-lg font-semibold">店铺设置</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* 店铺信息 */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">📋 店铺信息</h3>
            <div className="space-y-2 text-sm">
              <Info label="店铺名称" value={user.businessName || "未设置"} />
              <Info label="行业分类" value={categoryLabel || "未设置"} />
              <Info label="注册邮箱" value={user.email || "未设置"} />
              <Info label="注册手机" value={user.phone || "未设置"} />
              <Info label="注册时间" value={user.createdAt.toLocaleDateString("zh-CN")} />
              <Info label="店铺标识" value={user.businessSlug || "未生成"} />
            </div>
          </CardContent>
        </Card>

        {/* 店铺二维码 */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">📱 店铺二维码</h3>
            <p className="text-xs text-slate-500 mb-4">
              客户扫描此二维码即可进入你的店铺页面，查看并领取代金券
            </p>

            {shopUrl ? (
              <div className="space-y-4">
                {/* QR Code Image */}
                <div className="flex justify-center">
                  <div className="w-48 h-48 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/shop/qr?size=192`}
                      alt="店铺二维码"
                      className="w-full h-full"
                    />
                  </div>
                </div>

                {/* URL Display */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">店铺链接</p>
                  <p className="text-sm font-mono text-slate-700 break-all">{shopUrl}</p>
                </div>

                {/* Tips */}
                <div className="p-3 bg-[#1A6EFF]/5 rounded-xl">
                  <h4 className="text-xs font-semibold text-[#1A6EFF] mb-2">💡 使用建议</h4>
                  <ul className="text-xs text-slate-500 space-y-1">
                    <li>• 打印二维码贴在收银台或桌卡上</li>
                    <li>• 客户扫码即可查看你的所有代金券</li>
                    <li>• 分享链接到微信群/朋友圈吸引客户</li>
                    <li>• 创建新券后，店铺页会自动更新</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <p className="text-3xl mb-2">🔗</p>
                <p className="text-sm">店铺标识未生成</p>
                <p className="text-xs mt-1">请联系管理员设置店铺标识</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400 text-xs">{label}</span>
      <span className="text-slate-900 text-xs font-medium">{value}</span>
    </div>
  );
}
