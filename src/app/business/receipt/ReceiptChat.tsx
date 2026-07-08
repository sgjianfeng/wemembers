"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/components/i18n/LanguageProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/utils";

type Group = {
  id: string;
  name: string;
  icon: string | null;
  category: string;
  isPreset: boolean;
};

type Item = {
  id?: string;
  name: string;
  quantity: number | null;
  unitPrice: number | null; // cents
  amount: number | null; // cents
};

type Receipt = {
  id: string;
  imageUrl: string;
  category: string;
  status: string;
  vendorName: string | null;
  totalAmount: number | null;
  taxAmount: number | null;
  currency: string;
  receiptDate: string | null;
  tags: string | null;
  note: string | null;
  confidence: number | null;
  extractedJson: string | null;
  items: Item[];
};

const CAT_BADGE: Record<string, "blue" | "green" | "orange" | "purple" | "slate"> = {
  purchase: "blue",
  customer_sale: "green",
  platform: "orange",
  expense: "purple",
  unknown: "slate",
};

function centsToStr(c: number | null): string {
  return c == null ? "" : (c / 100).toFixed(2);
}
function strToCents(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100);
}

export function ReceiptChat() {
  const { t } = useLang();
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadReceipts = useCallback(async (groupId: string) => {
    const res = await fetch(`/api/business/receipts?groupId=${groupId}`);
    if (res.ok) {
      const { data } = await res.json();
      setReceipts(data);
    }
  }, []);

  // 初始加载群（首次会懒创建 4 个预设群）
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/business/receipt-groups");
      if (res.ok) {
        const { data } = await res.json();
        setGroups(data);
        if (data.length) setActiveId(data[0].id);
      }
    })();
  }, []);

  useEffect(() => {
    if (activeId) loadReceipts(activeId);
  }, [activeId, loadReceipts]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [receipts]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一文件
    setSheetOpen(false);
    if (!file || !activeId) return;

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("groupId", activeId);
    const res = await fetch("/api/business/receipts", { method: "POST", body: form });
    setUploading(false);
    if (res.ok) {
      await loadReceipts(activeId);
    } else {
      const { error } = await res.json().catch(() => ({ error: "上传失败" }));
      alert(error || "上传失败");
    }
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 106px)" }}>
      {/* 群切换 chips */}
      <div className="flex gap-2 overflow-x-auto px-4 py-2 border-b border-slate-50 sticky top-[49px] bg-white z-10">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setActiveId(g.id)}
            className={`shrink-0 px-3 h-8 rounded-full text-sm transition-colors ${
              activeId === g.id
                ? "bg-primary text-primary-foreground"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {g.icon} {g.name}
          </button>
        ))}
        <button
          onClick={() => setNewGroupOpen(true)}
          className="shrink-0 px-3 h-8 rounded-full text-sm bg-slate-100 text-slate-400"
        >
          ＋
        </button>
      </div>

      {/* 时间线 */}
      <div className="flex-1 px-4 py-4 space-y-4 bg-slate-50/50">
        {receipts.length === 0 && !uploading && (
          <p className="text-center text-sm text-slate-400 mt-10">
            {t("business.receipt.emptyGroup")}
          </p>
        )}
        {receipts.map((r) => (
          <ReceiptBubble key={r.id} receipt={r} onChange={() => loadReceipts(activeId)} />
        ))}
        {uploading && (
          <div className="flex justify-end">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm text-sm text-slate-400">
              ⏳ {t("business.receipt.processing")}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 底部上传条 */}
      <div className="sticky bottom-0 bg-white border-t border-slate-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setSheetOpen(true)}
          disabled={!activeId || uploading}
          className="w-11 h-11 rounded-full bg-primary text-primary-foreground text-2xl leading-none disabled:opacity-50"
        >
          ＋
        </button>
        <span className="text-sm text-slate-400">{t("business.receipt.upload")}</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {/* 上传方式 bottom-sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-end"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl p-5 max-w-lg mx-auto space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                fileRef.current?.setAttribute("capture", "environment");
                fileRef.current?.click();
              }}
              className="w-full h-11 rounded-lg bg-slate-100 text-sm"
            >
              📷 {t("business.receipt.takePhoto")}
            </button>
            <button
              onClick={() => {
                fileRef.current?.removeAttribute("capture");
                fileRef.current?.click();
              }}
              className="w-full h-11 rounded-lg bg-slate-100 text-sm"
            >
              🖼️ {t("business.receipt.album")}
            </button>
            <button
              onClick={() => setSheetOpen(false)}
              className="w-full h-11 rounded-full text-sm text-slate-400"
            >
              {t("business.receipt.cancel")}
            </button>
          </div>
        </div>
      )}

      {newGroupOpen && (
        <NewGroupSheet
          onClose={() => setNewGroupOpen(false)}
          onCreated={(g) => {
            setGroups((prev) => [...prev, g]);
            setActiveId(g.id);
            setNewGroupOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── 单条票据气泡 + 识别结果卡片 ──
function ReceiptBubble({
  receipt,
  onChange,
}: {
  receipt: Receipt;
  onChange: () => void;
}) {
  const { t } = useLang();
  const confirmed = receipt.status === "confirmed";

  // 候选标签 = extractedJson.candidateTags ∪ 已确认 tags
  const candidate: string[] = (() => {
    try {
      return JSON.parse(receipt.extractedJson || "{}").candidateTags || [];
    } catch {
      return [];
    }
  })();
  const savedTags: string[] = (() => {
    try {
      return JSON.parse(receipt.tags || "[]");
    } catch {
      return [];
    }
  })();

  const [vendor, setVendor] = useState(receipt.vendorName || "");
  const [total, setTotal] = useState(centsToStr(receipt.totalAmount));
  const [tax, setTax] = useState(centsToStr(receipt.taxAmount));
  const [date, setDate] = useState(receipt.receiptDate ? receipt.receiptDate.slice(0, 10) : "");
  const [note, setNote] = useState(receipt.note || "");
  const [items, setItems] = useState<Item[]>(receipt.items || []);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    savedTags.length ? savedTags : candidate
  );
  const [saving, setSaving] = useState(false);

  const allTags = Array.from(new Set([...candidate, ...savedTags, ...selectedTags]));

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  }

  async function confirm() {
    setSaving(true);
    const res = await fetch(`/api/business/receipts/${receipt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorName: vendor,
        totalAmount: strToCents(total),
        taxAmount: strToCents(tax),
        receiptDate: date || null,
        note,
        tags: selectedTags,
        items,
      }),
    });
    setSaving(false);
    if (res.ok) onChange();
  }

  async function remove() {
    if (!window.confirm(t("business.receipt.delete") + "?")) return;
    const res = await fetch(`/api/business/receipts/${receipt.id}`, { method: "DELETE" });
    if (res.ok) onChange();
  }

  return (
    <div className="space-y-2">
      {/* 图片气泡（靠右，像自己发的消息） */}
      <div className="flex justify-end">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={receipt.imageUrl}
          alt="receipt"
          className="max-w-[60%] rounded-2xl border shadow-sm"
        />
      </div>

      {/* 识别结果卡片（靠左） */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant={CAT_BADGE[receipt.category] || "slate"} size="sm">
              {t(`business.receipt.cat.${receipt.category}`)}
            </Badge>
            <span className="text-xs text-slate-400">
              {confirmed
                ? "✅ " + t("business.receipt.confirmed")
                : receipt.status === "failed"
                ? "⚠️ " + t("business.receipt.failed")
                : "📝 " + t("business.receipt.needReview")}
              {receipt.confidence != null && !confirmed
                ? ` · ${Math.round(receipt.confidence * 100)}%`
                : ""}
            </span>
          </div>

          {confirmed ? (
            // 已入库：只读摘要
            <div className="text-sm text-slate-600 space-y-1">
              {receipt.vendorName && <p>🏪 {receipt.vendorName}</p>}
              {receipt.totalAmount != null && (
                <p className="font-semibold text-slate-900">
                  S$ {formatMoney(receipt.totalAmount)}
                </p>
              )}
              {receipt.receiptDate && <p className="text-xs text-slate-400">🗓 {receipt.receiptDate.slice(0, 10)}</p>}
              {savedTags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {savedTags.map((tag) => (
                    <Badge key={tag} variant="slate" size="sm">#{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // 待确认：可编辑
            <div className="space-y-3">
              {receipt.status === "failed" && (
                <p className="text-xs text-amber-600">{t("business.receipt.ocrOff")}</p>
              )}
              <Input
                label={t("business.receipt.vendor")}
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label={t("business.receipt.total")}
                  prefix="S$"
                  inputMode="decimal"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
                <Input
                  label={t("business.receipt.tax")}
                  prefix="S$"
                  inputMode="decimal"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </div>
              <Input
                label={t("business.receipt.date")}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />

              {/* 候选标签：点选归类 */}
              {allTags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {t("business.receipt.tags")}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`px-2.5 h-7 rounded-full text-xs transition-colors ${
                          selectedTags.includes(tag)
                            ? "bg-primary text-primary-foreground"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 明细数据项 */}
              {items.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {t("business.receipt.items")}
                  </label>
                  <div className="space-y-1">
                    {items.map((it, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate text-slate-600">{it.name}</span>
                        {it.quantity != null && (
                          <span className="text-slate-400">×{it.quantity}</span>
                        )}
                        <input
                          inputMode="decimal"
                          value={centsToStr(it.amount)}
                          onChange={(e) => {
                            const v = strToCents(e.target.value);
                            setItems((prev) =>
                              prev.map((x, idx) => (idx === i ? { ...x, amount: v } : x))
                            );
                          }}
                          className="w-20 h-8 px-2 rounded border border-slate-200 text-right"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Textarea
                placeholder={t("business.receipt.note")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <div className="flex gap-2 pt-1">
                <Button size="sm" loading={saving} onClick={confirm} className="flex-1">
                  {t("business.receipt.confirm")}
                </Button>
                <Button size="sm" variant="ghost" onClick={remove}>
                  {t("business.receipt.delete")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── 新建群 bottom-sheet ──
function NewGroupSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (g: Group) => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/business/receipt-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setLoading(false);
    const json = await res.json().catch(() => ({}));
    if (res.ok) onCreated(json.data);
    else setError(json.error || "创建失败");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-2xl p-5 max-w-lg mx-auto space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold">{t("business.receipt.newGroup")}</h3>
        <Input
          placeholder={t("business.receipt.groupName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
        />
        <div className="flex gap-2">
          <Button loading={loading} disabled={!name.trim()} onClick={submit} className="flex-1">
            {t("business.receipt.create")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("business.receipt.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
