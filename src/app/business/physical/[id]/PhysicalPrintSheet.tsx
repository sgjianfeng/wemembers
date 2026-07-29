"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TicketVisualCard } from "@/components/physical/TicketVisualCard";
import { getVisualTemplate } from "@/lib/visual-templates";
import { cn } from "@/lib/utils";
import {
  PRINT_SIZE_PRESETS,
  canShareFiles,
  downloadFile,
  estimateSplitPlan,
  exportPrintPdf,
  exportShareSquarePng,
  getPreset,
  mmToPx,
  shareExportPdf,
  suggestSplitParts,
  type ExportImageItem,
  type PrintSizePresetId,
} from "@/lib/physical-print-export";

type Ticket = {
  code: string;
  status: string;
  claimUrl: string;
  soldAt?: string | null;
  claimedAt?: string | null;
  redeemedAt?: string | null;
  paidCents?: number;
};

function statusMeta(status: string, lang: "zh" | "en") {
  const map: Record<
    string,
    { zh: string; en: string; cls: string }
  > = {
    printed: {
      zh: "库存",
      en: "Stock",
      cls: "bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
    },
    sold: {
      zh: "已售",
      en: "Sold",
      cls: "bg-sky-50 text-sky-800 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/40",
    },
    claimed: {
      zh: "已绑",
      en: "Bound",
      cls: "bg-indigo-50 text-indigo-800 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/40",
    },
    redeemed: {
      zh: "已核",
      en: "Used",
      cls: "bg-violet-50 text-violet-800 border-violet-200/80 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/40",
    },
    boxed: {
      zh: "已投箱",
      en: "Boxed",
      cls: "bg-amber-50 text-amber-900 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
    },
    void: {
      zh: "作废",
      en: "Void",
      cls: "bg-muted text-muted-foreground border-border",
    },
  };
  const m = map[status] || {
    zh: status,
    en: status,
    cls: "bg-muted text-muted-foreground border-border",
  };
  return { label: lang === "en" ? m.en : m.zh, cls: m.cls };
}

export function PhysicalPrintSheet({
  lang,
  title,
  type,
  valueCents,
  storeName,
  storeAddress,
  businessName,
  businessLogo,
  validUntil,
  tickets,
  visualTemplateId,
  themeColor,
  description,
}: {
  lang: "zh" | "en";
  title: string;
  type: string;
  valueCents: number;
  storeName: string;
  storeAddress: string | null;
  businessName: string | null;
  businessLogo?: string | null;
  validUntil: string | null;
  tickets: Ticket[];
  visualTemplateId?: string | null;
  themeColor?: string | null;
  /** 批次说明 → 票面条款小字 */
  description?: string | null;
}) {
  const validLabel = validUntil
    ? new Date(validUntil).toLocaleDateString(lang === "en" ? "en-SG" : "zh-CN")
    : "—";
  const tpl = getVisualTemplate(visualTemplateId);
  const [exportBusy, setExportBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [exportHint, setExportHint] = useState("");
  const [exportItems, setExportItems] = useState<ExportImageItem[]>([]);
  const [pdfBundle, setPdfBundle] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [sizeId, setSizeId] = useState<PrintSizePresetId>("strip_180x48");
  const [customW, setCustomW] = useState("180");
  const [customH, setCustomH] = useState("48");
  // 默认 150：分享/下载更稳；正式印刷可选 300
  const [dpi, setDpi] = useState<150 | 300>(150);
  const [exportMode, setExportMode] = useState<"one" | "each" | "sheet">(
    "sheet"
  );
  /**
   * 拼版：null = 自动按张数建议份数；数字 = 用户指定分成几份。
   * PNG 高度随「每份几张」自动变，不截断整张券。
   */
  const [splitMode, setSplitMode] = useState<"auto" | "manual">("auto");
  const [manualParts, setManualParts] = useState(1);
  const first = tickets[0];

  // 仅「浅色经典 + 旧默认蓝」才映射暖橙；用户选了色块/其它色原样尊重
  const themeKey = (themeColor || "").trim().toUpperCase();
  const isClassic =
    !visualTemplateId ||
    visualTemplateId === "store_classic" ||
    getVisualTemplate(visualTemplateId).surface === "light";
  const resolvedTheme =
    type === "voucher" &&
    isClassic &&
    (!themeKey || themeKey === "#1A6EFF")
      ? "#E85D04"
      : themeColor ||
        (type === "voucher" && isClassic ? "#E85D04" : themeColor || null);

  const size = useMemo(() => {
    if (sizeId === "custom") {
      const widthMm = Math.min(
        320,
        Math.max(40, parseFloat(customW) || 180)
      );
      const heightMm = Math.min(
        200,
        Math.max(25, parseFloat(customH) || 60)
      );
      return {
        id: "custom" as const,
        widthMm,
        heightMm,
        labelZh: `${widthMm}×${heightMm} mm`,
        labelEn: `${widthMm}×${heightMm} mm`,
        hintZh: "自定义",
        hintEn: "Custom",
      };
    }
    return getPreset(sizeId);
  }, [sizeId, customW, customH]);

  // 导出宽度锚定 mm，高度按屏幕票条的真实比例走 —— 量一次屏幕预览即可预告尺寸
  const [stripAspect, setStripAspect] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      const el = document.querySelector<HTMLElement>("[data-physical-ticket]");
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setStripAspect(r.height / r.width);
    };
    read();
    // QR / logo 加载完版式才定型，稍后再量一次
    const timer = window.setTimeout(read, 600);
    window.addEventListener("resize", read);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", read);
    };
  }, [tickets.length, visualTemplateId, description, title]);

  const effectiveHeightMm = useMemo(
    () =>
      stripAspect
        ? Math.round(size.widthMm * stripAspect * 10) / 10
        : size.heightMm,
    [stripAspect, size.widthMm, size.heightMm]
  );

  const pxPreview = useMemo(
    () => ({
      w: mmToPx(size.widthMm, dpi),
      h: mmToPx(effectiveHeightMm, dpi),
    }),
    [size.widthMm, effectiveHeightMm, dpi]
  );

  const autoParts = useMemo(
    () => suggestSplitParts(tickets.length),
    [tickets.length]
  );

  const effectiveParts = useMemo(() => {
    if (splitMode === "auto") return autoParts;
    return Math.max(1, Math.min(tickets.length || 1, manualParts));
  }, [splitMode, autoParts, manualParts, tickets.length]);

  const splitPlan = useMemo(
    () =>
      estimateSplitPlan({
        ticketCount: tickets.length,
        parts: effectiveParts,
        ticketHeightMm: effectiveHeightMm,
        dpi,
      }),
    [tickets.length, effectiveParts, effectiveHeightMm, dpi]
  );

  useEffect(() => {
    setManualParts(suggestSplitParts(tickets.length));
  }, [tickets.length]);

  const drawBase = useMemo(
    () => ({
      title,
      type,
      valueCents,
      storeName,
      storeAddress,
      businessName: businessName || "Store",
      businessLogo,
      validLabel,
      terms: description,
      themeColor: resolvedTheme || tpl.defaultThemeHex || "#E85D04",
      bold: tpl.surface === "dark",
      lang,
      templateId: visualTemplateId,
    }),
    [
      title,
      type,
      valueCents,
      storeName,
      storeAddress,
      businessName,
      businessLogo,
      validLabel,
      description,
      resolvedTheme,
      tpl.defaultThemeHex,
      tpl.surface,
      lang,
      visualTemplateId,
    ]
  );

  const shareSupported =
    typeof navigator !== "undefined" && canShareFiles();

  // 释放旧预览 URL
  useEffect(() => {
    return () => {
      for (const it of exportItems) {
        try {
          URL.revokeObjectURL(it.previewUrl);
        } catch {
          /* ignore */
        }
      }
      if (pdfBundle) {
        try {
          URL.revokeObjectURL(pdfBundle.previewUrl);
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearExportPreview = useCallback(() => {
    setExportItems((prev) => {
      for (const it of prev) {
        try {
          URL.revokeObjectURL(it.previewUrl);
        } catch {
          /* ignore */
        }
      }
      return [];
    });
    setPdfBundle((prev) => {
      if (prev) {
        try {
          URL.revokeObjectURL(prev.previewUrl);
        } catch {
          /* ignore */
        }
      }
      return null;
    });
  }, []);

  const runPrintExport = useCallback(
    async (
      delivery: "share" | "download",
      /** 试导出：只截前 N 张，确认版式后再全量 */
      limit?: number
    ) => {
      if (!tickets.length) return;
      const list =
        limit && limit > 0 ? tickets.slice(0, limit) : tickets;
      setExportBusy(true);
      setProgress("");
      setExportHint(
        lang === "en"
          ? "Capturing on-screen ticket HTML…"
          : "正在截取屏幕券条 HTML…"
      );
      clearExportPreview();

      // 滚到条形预览，确保节点在 DOM 且 QR 已绘好
      try {
        document
          .querySelector("[data-physical-print-list]")
          ?.scrollIntoView({ block: "nearest" });
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 200));

      try {
        const trialParts =
          limit && limit > 0
            ? Math.max(1, Math.min(list.length, Math.ceil(list.length / 6)))
            : exportMode === "sheet"
              ? effectiveParts
              : list.length;

        const result = await exportPrintPdf({
          tickets: list,
          base: drawBase,
          widthMm: size.widthMm,
          heightMm: size.heightMm,
          dpi,
          splitParts: trialParts,
          filePrefix:
            (title.slice(0, 20) || "ticket") +
            (limit ? `-trial${limit}` : ""),
          delivery,
          shareTitle: title,
          shareText:
            lang === "en"
              ? `${list.length} print tickets (PDF) · WeMembers`
              : `${list.length} 张实体券 PDF · WeMembers`,
          onProgress: (done, total) => {
            setProgress(
              lang === "en"
                ? `Screenshot ${done}/${total}`
                : `截图 ${done}/${total}`
            );
          },
        });

        setExportItems(result.items);
        setPreviewIdx(0);
        if (result.pdf) setPdfBundle(result.pdf);

        const trialNote =
          limit && list.length < tickets.length
            ? lang === "en"
              ? `Trial: first ${list.length} of ${tickets.length}. `
              : `试导出：前 ${list.length}/${tickets.length} 张。 `
            : "";

        // 高度由票面版式比例决定（宽度锚定 mm），把真实尺寸报回来
        const sizeNote = result.ticketSizeMm
          ? lang === "en"
            ? ` Each ticket ${result.ticketSizeMm.widthMm}×${result.ticketSizeMm.heightMm} mm.`
            : ` 单张 ${result.ticketSizeMm.widthMm}×${result.ticketSizeMm.heightMm} mm。`
          : "";

        if (result.delivery === "shared") {
          setExportHint(
            trialNote +
              (lang === "en"
                ? `Shared multi-page PDF (${result.pages} pages).`
                : `已分享多页 PDF（${result.pages} 页）。`) +
              sizeNote
          );
        } else if (result.delivery === "cancelled") {
          setExportHint(
            trialNote +
              (lang === "en"
                ? "Share cancelled. Tap Save PDF below."
                : "已取消分享。可点下方「保存 PDF」。")
          );
        } else if (result.delivery === "preview") {
          if (result.errorKey === "share_unsupported") {
            setExportHint(
              trialNote +
                (lang === "en"
                  ? "Tap Save PDF — file goes to Downloads."
                  : "请点「保存 PDF」→ 在「下载」找 .pdf。")
            );
          } else if (result.errorKey === "share_error") {
            setExportHint(
              trialNote +
                (lang === "en"
                  ? "Share failed. Save PDF then attach in WhatsApp."
                  : "分享失败。请先「保存 PDF」再发 WhatsApp。")
            );
          } else {
            setExportHint(
              trialNote +
                (lang === "en"
                  ? `PDF ready · ${result.pages} page(s). Matches on-screen strip (HTML capture).`
                  : `PDF 已生成 · ${result.pages} 页。版式与下方屏幕券条一致（HTML 截图）。`) +
                sizeNote
            );
          }
        } else {
          setExportHint(
            lang === "en"
              ? "Export failed. Try “trial 6” or lower DPI."
              : "导出失败。可先「试导出 6 张」或降低 DPI。"
          );
        }
        setProgress("");
      } catch (e) {
        console.error(e);
        setExportHint(lang === "en" ? "Export failed" : "导出失败，请重试");
      }
      setExportBusy(false);
    },
    [
      tickets,
      drawBase,
      size,
      dpi,
      exportMode,
      effectiveParts,
      title,
      lang,
      clearExportPreview,
    ]
  );

  const savePdf = useCallback(async () => {
    if (!pdfBundle) return;
    await downloadFile(pdfBundle.file);
    setExportHint(
      lang === "en"
        ? `Saved “${pdfBundle.file.name}” → browser Downloads / Files app.`
        : `已保存「${pdfBundle.file.name}」→ 请到浏览器「下载」或系统「文件」App 查看。`
    );
  }, [pdfBundle, lang]);

  const sharePdfAgain = useCallback(async () => {
    if (!pdfBundle) return;
    const r = await shareExportPdf(pdfBundle, {
      title: title,
      text:
        lang === "en"
          ? "Print tickets PDF"
          : "实体券印刷 PDF",
    });
    if (r === "shared") {
      setExportHint(
        lang === "en"
          ? "Shared PDF — choose WhatsApp"
          : "已打开分享 → 选 WhatsApp 发送 PDF"
      );
    } else if (r === "cancelled") {
      setExportHint(lang === "en" ? "Cancelled" : "已取消");
    } else {
      setExportHint(
        lang === "en"
          ? "Share not available. Use Save PDF, then attach in WhatsApp."
          : "无法系统分享。请「保存 PDF」后，在 WhatsApp 里用附件发送。"
      );
    }
  }, [pdfBundle, title, lang]);

  const runShareSquare = useCallback(async () => {
    if (!first) return;
    setExportBusy(true);
    setExportHint("");
    try {
      const r = await exportShareSquarePng({
        title,
        type,
        valueCents,
        storeName,
        businessName: businessName || "Store",
        businessLogo,
        code: first.code,
        validLabel,
        themeColor: resolvedTheme || tpl.defaultThemeHex || "#E85D04",
        bold: tpl.surface === "dark",
        lang,
        delivery: "share",
      });
      if (r === "shared") {
        setExportHint(
          lang === "en" ? "1:1 shared" : "1:1 方图已分享，可选 WhatsApp"
        );
      } else if (r === "cancelled") {
        setExportHint(lang === "en" ? "Cancelled" : "已取消");
      } else {
        setExportHint(
          lang === "en"
            ? "Saved 1:1 to Downloads"
            : "已下载 1:1 方图到「下载」文件夹"
        );
      }
    } catch (e) {
      console.error(e);
      setExportHint(lang === "en" ? "Export failed" : "导出失败");
    }
    setExportBusy(false);
  }, [
    first,
    title,
    type,
    valueCents,
    storeName,
    businessName,
    businessLogo,
    validLabel,
    resolvedTheme,
    tpl.defaultThemeHex,
    tpl.surface,
    lang,
  ]);

  const previewItem = exportItems[previewIdx] || null;

  return (
    <div className="px-4 mt-4">
      {/* ── 导出控制（屏幕） ── */}
      <div className="print:hidden space-y-3 mb-5">
        <div className="rounded-2xl border border-border bg-card p-3.5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {lang === "en" ? "Print export (PDF)" : "印刷导出（PDF）"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              {lang === "en"
                ? "PDF is built from the same strip layout as the preview (all codes). Below: one sample + a status list for stock / sold / used."
                : "PDF 按预览同款条形票面导出（含全部券码）。下方：一张样张预览 + 列表看库存/售出/核销。"}
            </p>
          </div>

          {/* 尺寸预设 */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              {lang === "en" ? "Ticket size" : "单张尺寸"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRINT_SIZE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSizeId(p.id)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-colors",
                    sizeId === p.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {lang === "en" ? p.labelEn : p.labelZh}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSizeId("custom")}
                className={cn(
                  "px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-colors",
                  sizeId === "custom"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {lang === "en" ? "Custom" : "自定义"}
              </button>
            </div>
            {sizeId === "custom" && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  min={40}
                  max={320}
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  className="w-20 h-9 px-2 rounded-lg border border-input bg-background text-sm tabular-nums"
                  aria-label="width mm"
                />
                <span className="text-xs text-muted-foreground">×</span>
                <input
                  type="number"
                  min={25}
                  max={200}
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  className="w-20 h-9 px-2 rounded-lg border border-input bg-background text-sm tabular-nums"
                  aria-label="height mm"
                />
                <span className="text-xs text-muted-foreground">mm</span>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {lang === "en" ? size.hintEn : size.hintZh}
              {" · "}
              {pxPreview.w}×{pxPreview.h} px @ {dpi} DPI
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
              {lang === "en"
                ? `Width is the anchor: ${size.widthMm} mm. Height follows the strip layout ≈ ${effectiveHeightMm} mm (never stretched).`
                : `以宽度为准：${size.widthMm} mm。高度按票面版式等比得出 ≈ ${effectiveHeightMm} mm，不会被拉伸变形。`}
            </p>
          </div>

          {/* DPI */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              DPI
            </p>
            <div className="flex gap-1.5">
              {(
                [
                  { d: 150 as const, zh: "150 · 屏幕/快印", en: "150 · draft" },
                  { d: 300 as const, zh: "300 · 印刷推荐", en: "300 · print" },
                ] as const
              ).map((o) => (
                <button
                  key={o.d}
                  type="button"
                  onClick={() => setDpi(o.d)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-full text-[11px] font-semibold border",
                    dpi === o.d
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {lang === "en" ? o.en : o.zh}
                </button>
              ))}
            </div>
          </div>

          {/* PDF 分页：按张数均分到多页 */}
          {exportMode === "sheet" && (
            <div className="rounded-xl border border-border/80 bg-muted/30 px-3 py-2.5 space-y-2">
              <p className="text-xs font-medium text-foreground">
                {lang === "en" ? "PDF pages" : "PDF 分成几页"}
              </p>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {lang === "en"
                  ? "Even split by ticket count. Page breaks only between full tickets — never cut mid-ticket."
                  : "按总张数均分到 PDF 各页。分页只发生在完整券之间，绝不会截断半张。"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSplitMode("auto")}
                  className={cn(
                    "px-2.5 py-1.5 rounded-full text-[11px] font-semibold border",
                    splitMode === "auto"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {lang === "en"
                    ? `Auto · ${autoParts}`
                    : `自动 · ${autoParts} 份`}
                </button>
                {Array.from(
                  new Set(
                    [1, 2, 3, 4, 5, 6, 8, 10, tickets.length].filter(
                      (n) => n >= 1 && n <= Math.max(1, tickets.length)
                    )
                  )
                )
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setSplitMode("manual");
                        setManualParts(n);
                      }}
                      className={cn(
                        "px-2.5 py-1.5 rounded-full text-[11px] font-semibold border tabular-nums",
                        splitMode === "manual" && manualParts === n
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {n}
                      {lang === "en" ? "" : " 份"}
                    </button>
                  ))}
              </div>
              {splitMode === "manual" && tickets.length > 10 && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={tickets.length}
                    value={manualParts}
                    onChange={(e) => {
                      setSplitMode("manual");
                      setManualParts(
                        Math.max(
                          1,
                          Math.min(
                            tickets.length,
                            parseInt(e.target.value, 10) || 1
                          )
                        )
                      );
                    }}
                    className="w-20 h-9 px-2 rounded-lg border border-input bg-background text-sm tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">
                    {lang === "en"
                      ? `parts (1–${tickets.length})`
                      : `份（1–${tickets.length}）`}
                  </span>
                </div>
              )}
              <p className="text-[11px] font-semibold text-primary tabular-nums leading-snug">
                {lang === "en"
                  ? `${tickets.length} tickets → ${splitPlan.parts} PDF page(s) · ~${splitPlan.minPerPart}${
                      splitPlan.minPerPart !== splitPlan.maxPerPart
                        ? `–${splitPlan.maxPerPart}`
                        : ""
                    } tickets/page`
                  : `共 ${tickets.length} 张 → PDF ${splitPlan.parts} 页 · 每页约 ${
                      splitPlan.minPerPart === splitPlan.maxPerPart
                        ? `${splitPlan.maxPerPart}`
                        : `${splitPlan.minPerPart}–${splitPlan.maxPerPart}`
                    } 张完整券`}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-0.5">
            <button
              type="button"
              disabled={!tickets.length || exportBusy}
              onClick={() => runPrintExport("share")}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {exportBusy
                ? progress || "…"
                : lang === "en"
                  ? shareSupported
                    ? "Share multi-page PDF · WhatsApp"
                    : "Generate multi-page PDF"
                  : shareSupported
                    ? "分享多页 PDF · WhatsApp"
                    : "生成多页 PDF"}
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!tickets.length || exportBusy}
                onClick={() => runPrintExport("download")}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground disabled:opacity-50"
              >
                {lang === "en" ? "Generate PDF" : "生成 PDF"}
              </button>
              <button
                type="button"
                disabled={!tickets.length || exportBusy || tickets.length <= 6}
                onClick={() => runPrintExport("download", 6)}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-primary/40 bg-primary/5 px-3 text-xs font-semibold text-primary disabled:opacity-50"
              >
                {lang === "en" ? "Trial 6" : "试导出 6 张"}
              </button>
              <button
                type="button"
                disabled={!first || exportBusy}
                onClick={runShareSquare}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground disabled:opacity-50"
              >
                {lang === "en" ? "1:1 image" : "1:1 方图"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              {lang === "en"
                ? "Tip: use “Trial 6” first to check QR & layout, then export all."
                : "建议先「试导出 6 张」核对二维码与版式，确认后再生成全部。"}
            </p>
          </div>

          {exportHint && (
            <p className="text-[11px] leading-relaxed rounded-lg bg-muted/60 px-2.5 py-2 text-foreground">
              {exportHint}
            </p>
          )}

          {/* PDF 结果：单文件多页 */}
          {pdfBundle && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5 space-y-2">
              <p className="text-xs font-semibold text-foreground">
                {lang === "en" ? "PDF ready" : "PDF 已就绪"}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {pdfBundle.file.name}
                </span>
              </p>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {lang === "en"
                  ? "One file · multi-page · full tickets only on each page. Print shop can print as-is."
                  : "一个文件 · 多页 · 每页只有完整券。打印店可直接印。"}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={sharePdfAgain}
                  className="h-10 flex-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold"
                >
                  {lang === "en" ? "Share PDF" : "分享 PDF（WhatsApp）"}
                </button>
                <button
                  type="button"
                  onClick={savePdf}
                  className="h-10 flex-1 rounded-full border border-border bg-card text-xs font-semibold"
                >
                  {lang === "en" ? "Save PDF" : "保存 PDF"}
                </button>
              </div>
              <a
                href={pdfBundle.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[11px] font-semibold text-primary py-1"
              >
                {lang === "en" ? "Open PDF in new tab" : "新标签打开 PDF 预览"}
              </a>
            </div>
          )}

          {/* 首页缩略预览（可选） */}
          {previewItem && (
            <div className="rounded-xl border border-border bg-muted/30 p-2.5 space-y-2">
              <p className="text-xs font-semibold text-foreground">
                {lang === "en" ? "Page 1 preview" : "第 1 页预览"}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewItem.previewUrl}
                alt="page1"
                className="w-full rounded-lg border border-border bg-white"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── 主界面：一张预览 + 券码列表（库存/核销好扫） ── */}
      {first && (
        <div className="print:hidden mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {lang === "en" ? "Ticket preview" : "票面预览"}
            <span className="font-normal text-muted-foreground/80">
              {lang === "en"
                ? " · sample layout (export uses all codes)"
                : " · 版式样张（导出含全部券码）"}
            </span>
          </p>
          <div className="w-full max-w-2xl">
            <TicketVisualCard
              templateId={visualTemplateId}
              themeColor={resolvedTheme}
              type={type}
              title={title}
              valueCents={valueCents}
              storeName={storeName}
              storeAddress={storeAddress}
              businessName={businessName}
              businessLogo={businessLogo}
              validLabel={validLabel}
              code={first.code}
              claimUrl={first.claimUrl}
              lang={lang}
              terms={description}
              mode="print"
            />
          </div>
        </div>
      )}

      <div className="print:hidden mb-6">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-foreground">
            {lang === "en" ? "Codes" : "券码列表"}
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              {tickets.length}
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground">
            {lang === "en"
              ? "Stock / sold / bound / used"
              : "库存 · 已售 · 已绑 · 已核"}
          </p>
        </div>
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <ul className="divide-y divide-border max-h-[min(28rem,55vh)] overflow-y-auto">
            {tickets.map((t, i) => {
              const st = statusMeta(t.status, lang);
              return (
                <li
                  key={t.code}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-muted/40"
                >
                  <span className="w-7 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-semibold text-foreground truncate">
                      {t.code}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {t.status === "sold" && t.paidCents != null && t.paidCents > 0
                        ? lang === "en"
                          ? `Paid S$${(t.paidCents / 100).toFixed(2)}`
                          : `实收 S$${(t.paidCents / 100).toFixed(2)}`
                        : t.status === "redeemed" && t.redeemedAt
                          ? lang === "en"
                            ? `Used ${new Date(t.redeemedAt).toLocaleDateString("en-SG")}`
                            : `核销 ${new Date(t.redeemedAt).toLocaleDateString("zh-CN")}`
                          : t.status === "claimed" && t.claimedAt
                            ? lang === "en"
                              ? `Bound ${new Date(t.claimedAt).toLocaleDateString("en-SG")}`
                              : `绑定 ${new Date(t.claimedAt).toLocaleDateString("zh-CN")}`
                            : t.status === "sold" && t.soldAt
                              ? lang === "en"
                                ? `Sold ${new Date(t.soldAt).toLocaleDateString("en-SG")}`
                                : `售出 ${new Date(t.soldAt).toLocaleDateString("zh-CN")}`
                              : lang === "en"
                                ? "In stock"
                                : "在库"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-bold rounded-full border px-2 py-0.5",
                      st.cls
                    )}
                  >
                    {st.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/*
        导出截图源：全部券条仍渲染在 DOM（屏外），
        避免列表页渲染几百张可见票面拖慢滚动。
      */}
      <div
        data-physical-print-list="1"
        aria-hidden
        className={cn(
          "flex flex-col gap-1.5 w-full max-w-2xl",
          // 屏外保留布局尺寸，供 export 量宽高 / 截图
          "fixed left-[-10000px] top-0 pointer-events-none"
        )}
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
      >
        {tickets.map((t) => (
          <div
            key={t.code}
            data-physical-ticket={t.code}
            className="w-full"
            style={{ width: "min(42rem, 100vw)" }}
          >
            <TicketVisualCard
              templateId={visualTemplateId}
              themeColor={resolvedTheme}
              type={type}
              title={title}
              valueCents={valueCents}
              storeName={storeName}
              storeAddress={storeAddress}
              businessName={businessName}
              businessLogo={businessLogo}
              validLabel={validLabel}
              code={t.code}
              claimUrl={t.claimUrl}
              lang={lang}
              terms={description}
              mode="print"
            />
          </div>
        ))}
      </div>

      {/* 浏览器打印：仍输出全部券条 */}
      <div
        className="hidden print:flex print:flex-col print:gap-1 print:w-full"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
      >
        {tickets.map((t) => (
          <div key={`print-${t.code}`} className="w-full break-inside-avoid">
            <TicketVisualCard
              templateId={visualTemplateId}
              themeColor={resolvedTheme}
              type={type}
              title={title}
              valueCents={valueCents}
              storeName={storeName}
              storeAddress={storeAddress}
              businessName={businessName}
              businessLogo={businessLogo}
              validLabel={validLabel}
              code={t.code}
              claimUrl={t.claimUrl}
              lang={lang}
              terms={description}
              mode="print"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
