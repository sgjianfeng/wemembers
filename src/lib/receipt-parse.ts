/**
 * 从 OCR 结果 / 原始文字中补全小票金额与单号后四位
 */

export function centsToSgdString(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents) || cents < 0) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/** 从单号字符串取末 4 位数字 */
export function last4FromReceiptNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-4);
}

/**
 * 从 rawText 猜 TOTAL 金额（分）。优先匹配 TOTAL / GRAND TOTAL / AMOUNT DUE 等行。
 */
export function guessAmountCentsFromText(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const amountRe =
    /(?:S\$|SGD|\$)?\s*(\d{1,5}(?:[.,]\d{2})|\d{1,5})/i;

  const prefer =
    /total|grand\s*total|amount\s*due|net\s*total|应付|合计|实付|总额/i;
  for (const line of lines) {
    if (!prefer.test(line)) continue;
    // 跳过找零 / change
    if (/change|找零|找赎/i.test(line)) continue;
    const m = line.match(amountRe);
    if (!m) continue;
    const n = parseMoneyToken(m[1]);
    if (n != null && n >= 100) return n; // 至少 S$1
  }

  // 回退：全文最大的一个金额（常是 TOTAL）
  let best: number | null = null;
  for (const m of raw.matchAll(/(?:S\$|SGD|\$)\s*(\d{1,5}(?:[.,]\d{2})?)/gi)) {
    const n = parseMoneyToken(m[1]);
    if (n != null && (best == null || n > best)) best = n;
  }
  return best;
}

function parseMoneyToken(tok: string): number | null {
  const cleaned = tok.replace(/,/g, "");
  if (cleaned.includes(".")) {
    const v = Math.round(parseFloat(cleaned) * 100);
    return Number.isFinite(v) ? v : null;
  }
  // 无小数：可能是整元，也可能是「分」——小票整数多为整元
  const v = parseInt(cleaned, 10);
  if (!Number.isFinite(v)) return null;
  return v * 100;
}

/**
 * 从 rawText 猜单号后四位：Receipt No / Invoice / Check / Bill / Order
 */
export function guessLast4FromText(raw: string | null | undefined): string {
  if (!raw) return "";
  const patterns = [
    /(?:receipt|invoice|bill|order|check|ticket|单号|票号|小票)[#:\s.]*([A-Z0-9-]{4,})/i,
    /(?:no\.?|number)[#:\s]*([A-Z0-9-]{4,})/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const last4 = last4FromReceiptNumber(m[1]);
      if (last4.length >= 3) return last4;
    }
  }
  return "";
}

export function enrichReceiptFields(input: {
  totalAmountCents?: number | null;
  receiptNumber?: string | null;
  receiptLast4?: string | null;
  rawText?: string | null;
}): {
  amountCents: number | null;
  amountSgd: string;
  receiptNumber: string;
  receiptLast4: string;
} {
  let amountCents =
    input.totalAmountCents != null && Number.isFinite(input.totalAmountCents)
      ? Math.round(input.totalAmountCents)
      : null;
  if (amountCents == null || amountCents <= 0) {
    amountCents = guessAmountCentsFromText(input.rawText);
  }

  let receiptNumber = (input.receiptNumber || "").trim();
  let receiptLast4 = (input.receiptLast4 || "").replace(/\D/g, "").slice(-4);
  if (!receiptLast4 && receiptNumber) {
    receiptLast4 = last4FromReceiptNumber(receiptNumber);
  }
  if (!receiptLast4) {
    receiptLast4 = guessLast4FromText(input.rawText);
  }
  if (!receiptNumber && receiptLast4) {
    receiptNumber = receiptLast4;
  }

  return {
    amountCents,
    amountSgd: centsToSgdString(amountCents),
    receiptNumber,
    receiptLast4,
  };
}
