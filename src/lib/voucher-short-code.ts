/**
 * Short human redeem codes for prepaid vouchers.
 * 6 chars, no ambiguous 0/O/1/I — easy to read over the counter.
 */
import { prisma } from "@/lib/db";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LEN = 6;

export function generateShortCodeCandidate(): string {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

export function normalizeShortCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function looksLikeShortCode(raw: string): boolean {
  const s = normalizeShortCode(raw);
  return s.length === CODE_LEN && /^[2-9A-HJ-NP-Z]+$/.test(s);
}

/** Allocate a unique shortCode (retries on rare collision). */
export async function allocateShortCode(maxAttempts = 12): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateShortCodeCandidate();
    const exists = await prisma.voucher.findUnique({
      where: { shortCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  throw new Error("short_code_alloc_failed");
}

/** Ensure voucher has shortCode; returns it. Idempotent. */
export async function ensureVoucherShortCode(voucherId: string): Promise<string> {
  const row = await prisma.voucher.findUnique({
    where: { id: voucherId },
    select: { id: true, shortCode: true },
  });
  if (!row) throw new Error("voucher_not_found");
  if (row.shortCode) return row.shortCode;

  for (let i = 0; i < 12; i++) {
    const code = generateShortCodeCandidate();
    try {
      const updated = await prisma.voucher.update({
        where: { id: voucherId },
        data: { shortCode: code },
        select: { shortCode: true },
      });
      if (updated.shortCode) return updated.shortCode;
    } catch {
      // unique race — retry
    }
  }
  throw new Error("short_code_assign_failed");
}

/** Backfill missing shortCodes for a list of voucher ids (e.g. balance page). */
export async function ensureShortCodesForIds(ids: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const id of ids) {
    try {
      map[id] = await ensureVoucherShortCode(id);
    } catch {
      /* skip */
    }
  }
  return map;
}
