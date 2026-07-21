"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLang } from "@/components/i18n/LanguageProvider";
import { useRouter } from "next/navigation";

const MAX_PARTS = 3;
const MIN_PART_CENTS = 100;

function formatSgdCents(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

/** 一半一张 + 另一半再拆两张（约 50% / 25% / 25%，余数落在最后） */
function halfThenTwo(balanceCents: number): number[] | null {
  if (balanceCents < MIN_PART_CENTS * 3) return null;
  const half = Math.floor(balanceCents / 2);
  const rest = balanceCents - half;
  const q = Math.floor(rest / 2);
  const r = rest - q;
  if (half < MIN_PART_CENTS || q < MIN_PART_CENTS || r < MIN_PART_CENTS) {
    return null;
  }
  return [half, q, r];
}

function equalTwo(balanceCents: number): number[] | null {
  if (balanceCents < MIN_PART_CENTS * 2) return null;
  const a = Math.floor(balanceCents / 2);
  const b = balanceCents - a;
  if (a < MIN_PART_CENTS || b < MIN_PART_CENTS) return null;
  return [a, b];
}

export function SplitButton({
  voucherId,
  balanceCents,
}: {
  voucherId: string;
  balanceCents: number;
}) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<string[]>(["", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balanceSgd = balanceCents / 100;
  const partsNum = useMemo(
    () =>
      parts
        .map((p) => parseFloat(p))
        .filter((n) => Number.isFinite(n) && n > 0),
    [parts]
  );
  const sumCents = Math.round(
    partsNum.reduce((a, b) => a + b, 0) * 100
  );
  const match =
    sumCents === balanceCents &&
    partsNum.length >= 2 &&
    partsNum.length <= MAX_PARTS;

  function applyCents(arr: number[]) {
    setParts(arr.map(formatSgdCents));
    setError(null);
  }

  function setPart(i: number, v: string) {
    setParts((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  }

  function addRow() {
    if (parts.length >= MAX_PARTS) return;
    setParts((p) => [...p, ""]);
  }

  function removeRow(i: number) {
    if (parts.length <= 2) return;
    setParts((p) => p.filter((_, idx) => idx !== i));
  }

  function applyHalf() {
    const arr = equalTwo(balanceCents);
    if (!arr) {
      setError(t("balance.split.minEach"));
      return;
    }
    applyCents(arr);
  }

  function applyHalfPlusTwo() {
    const arr = halfThenTwo(balanceCents);
    if (!arr) {
      setError(t("balance.split.minThree"));
      return;
    }
    applyCents(arr);
  }

  function openPanel() {
    setOpen(true);
    setError(null);
    // 默认推荐：一半 + 一半再拆两档
    const preferred = halfThenTwo(balanceCents) || equalTwo(balanceCents);
    if (preferred) {
      applyCents(preferred);
    } else {
      setParts(["", ""]);
    }
  }

  async function submit() {
    setError(null);
    if (partsNum.length > MAX_PARTS) {
      setError(t("balance.split.maxThree"));
      return;
    }
    if (!match) {
      setError(
        t("balance.split.sumMustMatch", {
          balance: balanceSgd.toFixed(2),
          sum: (sumCents / 100).toFixed(2),
        })
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/voucher/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucherId,
          partsSgd: partsNum,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t("balance.split.failed"));
        setLoading(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(t("balance.split.failed"));
    }
    setLoading(false);
  }

  if (balanceCents < MIN_PART_CENTS * 2) {
    return null;
  }

  return (
    <div className="mt-2">
      {!open ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full text-xs"
          onClick={openPanel}
        >
          {t("balance.split.btn")}
        </Button>
      ) : (
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-800">
              {t("balance.split.title")}
            </p>
            <button
              type="button"
              className="text-[11px] text-slate-400"
              onClick={() => setOpen(false)}
            >
              {lang === "en" ? "Cancel" : "取消"}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            {t("balance.split.hint", { amount: balanceSgd.toFixed(2) })}
          </p>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="text-[10px] px-2 py-1 rounded-full bg-white border border-slate-200"
              onClick={applyHalf}
            >
              {t("balance.split.half")}
            </button>
            {balanceCents >= MIN_PART_CENTS * 3 && (
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded-full bg-white border border-slate-200"
                onClick={applyHalfPlusTwo}
              >
                {t("balance.split.halfPlusTwo")}
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {parts.map((val, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 w-10 shrink-0">
                  #{i + 1}
                </span>
                <div className="flex-1 flex items-center rounded-lg border border-slate-200 bg-white px-2">
                  <span className="text-xs text-slate-400">S$</span>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    inputMode="decimal"
                    value={val}
                    onChange={(e) => setPart(i, e.target.value)}
                    className="w-full h-9 px-1 text-sm outline-none bg-transparent"
                    placeholder="0"
                  />
                </div>
                {parts.length > 2 && (
                  <button
                    type="button"
                    className="text-xs text-slate-400 px-1"
                    onClick={() => removeRow(i)}
                    aria-label="remove"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {parts.length < MAX_PARTS && (
            <button
              type="button"
              className="text-[11px] text-[#1A6EFF] font-medium"
              onClick={addRow}
            >
              + {t("balance.split.add")}
            </button>
          )}

          <p
            className={`text-[11px] tabular-nums ${
              match ? "text-green-600" : "text-slate-500"
            }`}
          >
            {t("balance.split.sum", {
              sum: (sumCents / 100).toFixed(2),
              balance: balanceSgd.toFixed(2),
            })}
          </p>

          {error && <p className="text-[11px] text-red-500">{error}</p>}

          <Button
            type="button"
            size="sm"
            className="w-full"
            loading={loading}
            disabled={!match || loading}
            onClick={submit}
          >
            {t("balance.split.confirm")}
          </Button>
        </div>
      )}
    </div>
  );
}
