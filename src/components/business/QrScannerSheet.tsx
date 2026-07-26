"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLang } from "@/components/i18n/LanguageProvider";

type Props = {
  /** 扫到内容后回调（已 trim）；父级负责解析券 ID / 实体码 */
  onScan: (raw: string) => void;
  /** 按钮文案；默认「扫码」 */
  label?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * 门店核销用：打开后置摄像头扫 QR。
 * 依赖 html5-qrcode；关闭时停相机。
 */
export function QrScannerSheet({
  onScan,
  label,
  className,
  disabled,
}: Props) {
  const { t, lang } = useLang();
  const regionId = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    handledRef.current = false;
    setError(null);
    setStarting(true);

    let cancelled = false;

    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const scanner = new Html5Qrcode(regionId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 8,
            qrbox: (viewW: number, viewH: number) => {
              const side = Math.min(viewW, viewH) * 0.72;
              return { width: side, height: side };
            },
            aspectRatio: 1,
          },
          (decoded) => {
            if (handledRef.current) return;
            const text = (decoded || "").trim();
            if (!text) return;
            handledRef.current = true;
            void stopScanner().then(() => {
              setOpen(false);
              onScan(text);
            });
          },
          () => {
            /* frame miss — ignore */
          }
        );
        if (!cancelled) setStarting(false);
      } catch (e) {
        console.error("qr scanner start error:", e);
        if (!cancelled) {
          setStarting(false);
          setError(
            lang === "en"
              ? "Cannot open camera. Allow camera permission, or paste the code."
              : "无法打开摄像头。请允许相机权限，或改用粘贴码。"
          );
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      void stopScanner();
    };
    // open only — onScan/lang stable enough for sheet lifecycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, regionId]);

  async function stopScanner() {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (!s) return;
    try {
      if (s.isScanning) {
        await s.stop();
      }
      await s.clear();
    } catch {
      /* already stopped */
    }
  }

  async function close() {
    await stopScanner();
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={className}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <ScanLine className="w-4 h-4 mr-1.5 shrink-0" aria-hidden />
        {label || t("scan.scanButton")}
      </Button>

      {open && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/90">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <p className="text-sm font-semibold">
              {t("scan.scanTitle")}
            </p>
            <button
              type="button"
              onClick={() => void close()}
              className="p-2 rounded-full bg-card/10 hover:bg-card/20"
              aria-label={lang === "en" ? "Close" : "关闭"}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
            <div
              id={regionId}
              className="w-full max-w-sm overflow-hidden rounded-2xl bg-black min-h-[280px]"
            />
            {starting && !error && (
              <p className="mt-3 text-xs text-white/70">
                {t("scan.scanStarting")}
              </p>
            )}
            {error && (
              <p className="mt-3 text-xs text-red-300 text-center max-w-sm px-2">
                {error}
              </p>
            )}
            <p className="mt-4 text-[11px] text-white/50 text-center max-w-xs">
              {t("scan.scanHelp")}
            </p>
            <button
              type="button"
              onClick={() => void close()}
              className="mt-4 text-sm text-white/80 underline"
            >
              {lang === "en" ? "Cancel" : "取消"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
