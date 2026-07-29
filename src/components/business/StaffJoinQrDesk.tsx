"use client";

/**
 * 店员：结账大奖码
 * - 不填金额 → 固定码（顾客自填本单）
 * - 填金额 → 动态码带 bill（顾客扫入即带好金额）
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type Props = {
  lang: "zh" | "en";
  storeId: string;
  origin: string;
};

export function StaffJoinQrDesk({ lang, storeId, origin }: Props) {
  const [bill, setBill] = useState("");
  const billSgd = useMemo(() => {
    const n = parseFloat(bill);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100) / 100;
  }, [bill]);

  const joinUrl = useMemo(() => {
    const q = new URLSearchParams();
    q.set("storeId", storeId);
    if (billSgd > 0) q.set("bill", String(billSgd));
    return `${origin.replace(/\/$/, "")}/join?${q.toString()}`;
  }, [origin, storeId, billSgd]);

  // 动态码走对外可读的 API：用 google chart 不依赖；本站已有 store/qr path=join
  // 带 bill 时用通用 qr 图：api 仅支持 path=join 无 bill，故用 client QR via img service
  // 优先：扩展 store/qr 支持 bill；此处用 data URL 或 public QR endpoint
  const qrSrc = useMemo(() => {
    const base = `/api/store/qr?storeId=${encodeURIComponent(storeId)}&path=join&size=280`;
    if (billSgd > 0) {
      return `${base}&bill=${encodeURIComponent(String(billSgd))}`;
    }
    return base;
  }, [storeId, billSgd]);

  const modeLabel =
    billSgd > 0
      ? lang === "en"
        ? `Dynamic · bill S$${billSgd.toFixed(2)}`
        : `动态码 · 本单 S$${billSgd.toFixed(2)}`
      : lang === "en"
        ? "Static · customer enters bill"
        : "固定码 · 顾客自填金额";

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          {lang === "en"
            ? "Bill amount (optional)"
            : "本单金额（可选）"}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              S$
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder={lang === "en" ? "Empty = static QR" : "留空 = 固定码"}
              value={bill}
              onChange={(e) => setBill(e.target.value)}
              className="h-11 pl-9"
            />
          </div>
          {bill !== "" && (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full shrink-0"
              onClick={() => setBill("")}
            >
              {lang === "en" ? "Clear" : "清空"}
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
          {lang === "en"
            ? "Enter amount → show phone to customer. Leave empty for the printed counter code."
            : "输入金额后给顾客扫手机屏；不输入则用打印好的台卡固定码。"}
        </p>
      </div>

      <div
        className={cn(
          "rounded-xl border p-3 text-center",
          billSgd > 0
            ? "border-amber-300/80 bg-amber-50/50 dark:bg-amber-950/20"
            : "border-border bg-muted/30"
        )}
      >
        <p className="text-[11px] font-semibold text-foreground mb-2">
          {modeLabel}
        </p>
        <div className="mx-auto w-52 h-52 bg-card rounded-xl border border-border overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={qrSrc}
            src={qrSrc}
            alt="join qr"
            className="w-full h-full object-contain"
          />
        </div>
        <p className="mt-2 text-[10px] font-mono text-muted-foreground break-all px-1">
          {joinUrl}
        </p>
      </div>
    </div>
  );
}
