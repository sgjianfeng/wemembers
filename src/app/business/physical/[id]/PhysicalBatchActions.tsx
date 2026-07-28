"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn, formatMoney } from "@/lib/utils";

const VALUE_PRESETS_VOUCHER = [10, 20, 50, 100];
const VALUE_PRESETS_DRAW = [50, 100];

/**
 * 批次管理（详情页）
 * - 默认收起，避免挡住下方导出/预览滚动
 * - 未售出：可改金额 / 有效期 / 标题（条款折叠）
 * - 已发出：仅下架剩余
 */
export function PhysicalBatchActions({
  batchId,
  lang,
  stock,
  voided,
  validUntil,
  issued,
  type,
  title,
  valueCents,
  description,
}: {
  batchId: string;
  lang: "zh" | "en";
  stock: number;
  voided: boolean;
  validUntil: string | null;
  issued: boolean;
  type: string;
  title: string;
  valueCents: number;
  description?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [okHint, setOkHint] = useState("");
  // 默认收起：展开才编辑，页面滚动始终正常
  const [open, setOpen] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showDanger, setShowDanger] = useState(false);

  const editable = !issued && !voided;

  const defaultDate = useMemo(() => {
    if (validUntil) {
      return new Date(validUntil).toISOString().slice(0, 10);
    }
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().slice(0, 10);
  }, [validUntil]);

  const [date, setDate] = useState(defaultDate);
  const [editTitle, setEditTitle] = useState(title);
  const [valueSgd, setValueSgd] = useState(
    String(Number.isInteger(valueCents / 100) ? valueCents / 100 : (valueCents / 100).toFixed(2))
  );
  const [editTerms, setEditTerms] = useState(description || "");

  const presets =
    type === "ballot" || type === "draw"
      ? VALUE_PRESETS_DRAW
      : VALUE_PRESETS_VOUCHER;

  const dirty = useMemo(() => {
    if (!editable) return false;
    const v = Math.round(parseFloat(valueSgd || "0") * 100);
    const titleChanged = editTitle.trim() !== title.trim();
    const valueChanged = v !== valueCents;
    const dateChanged = date !== defaultDate;
    const termsChanged =
      (editTerms.trim() || "") !== (description || "").trim();
    return titleChanged || valueChanged || dateChanged || termsChanged;
  }, [
    editable,
    editTitle,
    title,
    valueSgd,
    valueCents,
    date,
    defaultDate,
    editTerms,
    description,
  ]);

  async function patch(body: Record<string, unknown>, okMsg: string) {
    setBusy(String(body.action || "act"));
    setError("");
    setOkHint("");
    try {
      const res = await fetch(`/api/business/physical/batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || (lang === "en" ? "Failed" : "操作失败"));
        return;
      }
      if (body.action === "delete_if_unused") {
        router.push("/business/physical");
        router.refresh();
        return;
      }
      setOkHint(okMsg);
      router.refresh();
    } catch {
      setError(lang === "en" ? "Network error" : "网络错误");
    } finally {
      setBusy(null);
    }
  }

  function saveEdits() {
    const v = Math.round(parseFloat(valueSgd || "0") * 100);
    if (!v || v < 100) {
      setError(lang === "en" ? "Value at least S$1" : "面值至少 S$1");
      return;
    }
    if (!date) {
      setError(lang === "en" ? "Pick a date" : "请选择有效期");
      return;
    }
    void patch(
      {
        action: "update_batch",
        title: editTitle.trim() || title,
        valueCents: v,
        validUntil: date,
        description: editTerms.trim() || null,
      },
      lang === "en"
        ? "Saved. Re-export PNG if paper already printed."
        : "已保存。若已印过，请重新导出 PNG。"
    );
  }

  function voidRemaining() {
    const msg = issued
      ? lang === "en"
        ? `Offline remaining stock (${stock})? Sold/bound stay valid.`
        : `下架剩余 ${stock} 张？已售/已绑仍有效，未售码作废。`
      : lang === "en"
        ? `Void remaining stock (${stock})?`
        : `作废剩余库存 ${stock} 张？`;
    if (!window.confirm(msg)) return;
    void patch(
      { action: "void_remaining" },
      lang === "en" ? `Voided ${stock}` : `已下架 ${stock} 张`
    );
  }

  function deleteUnused() {
    if (
      !window.confirm(
        lang === "en"
          ? "Delete this batch permanently?"
          : "永久删除本批次？"
      )
    ) {
      return;
    }
    void patch(
      { action: "delete_if_unused" },
      lang === "en" ? "Deleted" : "已删除"
    );
  }

  const statusChip = voided ? (
    <span className="text-[10px] font-medium rounded-full bg-muted text-muted-foreground px-2 py-0.5">
      {lang === "en" ? "Voided" : "已作废"}
    </span>
  ) : issued ? (
    <span className="text-[10px] font-medium rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-2 py-0.5">
      {lang === "en" ? "Sold · locked" : "已开售 · 金额锁定"}
    </span>
  ) : (
    <span className="text-[10px] font-medium rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">
      {lang === "en" ? "Editable" : "可改"}
    </span>
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* 一行摘要：始终可见，点按展开 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:bg-muted/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {lang === "en" ? "Batch edit" : "批次管理"}
            </span>
            {statusChip}
            {dirty && open && (
              <span className="text-[10px] text-primary font-medium">
                {lang === "en" ? "Unsaved" : "未保存"}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums truncate">
            S${formatMoney(valueCents)}
            {validUntil
              ? ` · ${lang === "en" ? "until" : "至"} ${new Date(
                  validUntil
                ).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-SG")}`
              : ""}
            {` · ${lang === "en" ? "stock" : "库存"} ${stock}`}
          </p>
        </div>
        <span className="text-[11px] font-semibold text-primary shrink-0">
          {open
            ? lang === "en"
              ? "Close"
              : "收起"
            : editable
              ? lang === "en"
                ? "Edit"
                : "修改"
              : lang === "en"
                ? "Open"
                : "打开"}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-0 space-y-3 border-t border-border">
          {editable ? (
            <>
              <p className="text-[10px] text-muted-foreground leading-snug pt-2">
                {lang === "en"
                  ? "Change amount / date before any sale. Then re-export PNG."
                  : "开卖前可改金额与有效期。保存后请重新导出 PNG。"}
              </p>

              {/* 金额 + 有效期：一行两列，少占高度 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    {type === "ballot"
                      ? lang === "en"
                        ? "Tier"
                        : "消费档"
                      : lang === "en"
                        ? "Amount"
                        : "金额"}
                  </label>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-muted-foreground">S$</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={valueSgd}
                      onChange={(e) => setValueSgd(e.target.value)}
                      className="w-full h-9 px-2 rounded-lg border border-input bg-background text-sm tabular-nums"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    {lang === "en" ? "Valid until" : "有效期"}
                  </label>
                  <input
                    type="date"
                    value={date}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-0.5 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {presets.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValueSgd(String(t))}
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-semibold border tabular-nums",
                      String(t) === valueSgd
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    S${t}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground">
                  {lang === "en" ? "Title" : "标题"}
                </label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-0.5 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm"
                />
              </div>

              {/* 条款：默认折叠，少占屏 */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowTerms((v) => !v)}
                  className="text-[10px] font-semibold text-muted-foreground"
                >
                  {showTerms
                    ? lang === "en"
                      ? "Hide terms ▲"
                      : "收起条款 ▲"
                    : lang === "en"
                      ? "Ticket terms (optional) ▼"
                      : "票面条款（可选）▼"}
                </button>
                {showTerms && (
                  <textarea
                    value={editTerms}
                    onChange={(e) => setEditTerms(e.target.value)}
                    rows={2}
                    className="mt-1 w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs resize-y max-h-24"
                    placeholder={
                      lang === "en" ? "Short terms on paper" : "印在票面的短条款"
                    }
                  />
                )}
              </div>

              <button
                type="button"
                disabled={!!busy || !dirty}
                onClick={saveEdits}
                className="w-full h-10 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40"
              >
                {busy === "update_batch"
                  ? "…"
                  : lang === "en"
                    ? "Save"
                    : "保存修改"}
              </button>
            </>
          ) : (
            <div className="pt-2 space-y-1">
              <p className="text-[11px] text-muted-foreground leading-snug">
                {lang === "en"
                  ? `Amount locked at S$${formatMoney(valueCents)}. Only remaining stock can be taken offline.`
                  : `金额锁定 S$${formatMoney(valueCents)}。只能下架未售库存，不能再改票面。`}
              </p>
            </div>
          )}

          {/* 下架：紧凑一行 */}
          {!voided && stock > 0 && (
            <button
              type="button"
              disabled={!!busy}
              onClick={voidRemaining}
              className="w-full h-9 rounded-full border border-border text-xs font-semibold text-muted-foreground disabled:opacity-40"
            >
              {busy === "void_remaining"
                ? "…"
                : lang === "en"
                  ? `Offline ${stock} unsold`
                  : `下架剩余 ${stock} 张`}
            </button>
          )}

          {/* 删除：再点一层，防误触 */}
          {editable && (
            <div>
              <button
                type="button"
                onClick={() => setShowDanger((v) => !v)}
                className="text-[10px] text-muted-foreground"
              >
                {showDanger
                  ? lang === "en"
                    ? "Hide delete ▲"
                    : "收起删除 ▲"
                  : lang === "en"
                    ? "Delete batch… ▼"
                    : "删除批次… ▼"}
              </button>
              {showDanger && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={deleteUnused}
                  className="mt-1.5 w-full h-9 rounded-full border border-red-200 dark:border-red-900 text-xs font-semibold text-red-600 dark:text-red-400"
                >
                  {busy === "delete_if_unused"
                    ? "…"
                    : lang === "en"
                      ? "Confirm delete"
                      : "确认删除本批"}
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="text-[11px] text-destructive leading-snug">{error}</p>
          )}
          {okHint && !error && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 leading-snug">
              {okHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
