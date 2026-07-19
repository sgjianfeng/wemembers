"use client";

import Link from "next/link";

interface Props {
  storeId: string;
  storeName: string;
  publicUrl: string;
  address?: string | null;
  lang: "zh" | "en";
  /** staff 用 /business/store/qr；企业用门店下路径 */
  variant?: "business" | "staff";
}

/**
 * 门店二维码快捷操作 → 完整打印页
 */
export function StoreQrActions({
  storeId,
  publicUrl,
  lang,
  variant = "business",
}: Props) {
  const pngHref = `/api/store/qr?storeId=${encodeURIComponent(storeId)}&format=png&size=512&download=1`;
  const printHref =
    variant === "staff"
      ? "/business/store/qr"
      : `/business/stores/${storeId}/qr`;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Link
        href={printHref}
        className="inline-flex h-9 items-center justify-center rounded-full bg-[#1A6EFF] px-4 text-xs font-semibold text-white hover:bg-[#1558d6]"
      >
        {lang === "en" ? "Print & export poster" : "打印导出台卡/海报"}
      </Link>
      <a
        href={pngHref}
        download
        className="inline-flex h-9 items-center justify-center rounded-full bg-slate-100 px-4 text-xs font-semibold text-slate-800 hover:bg-slate-200"
      >
        {lang === "en" ? "QR PNG" : "二维码 PNG"}
      </a>
      <a
        href={publicUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:border-[#1A6EFF]/40"
      >
        {lang === "en" ? "Customer page" : "顾客页预览"}
      </a>
    </div>
  );
}
