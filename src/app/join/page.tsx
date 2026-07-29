import { Suspense } from "react";
import { JoinClient } from "@/app/join/JoinClient";

/**
 * 结账参加大奖入口（固定码）
 * /join?storeId=xxx&bill=68（bill 可选，顾客也可页内填写）
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; bill?: string }>;
}) {
  const sp = await searchParams;
  const storeId = (sp.storeId || "").trim();

  if (!storeId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Missing storeId. Scan the store&apos;s grand-prize QR.
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <JoinClient storeId={storeId} />
    </Suspense>
  );
}
