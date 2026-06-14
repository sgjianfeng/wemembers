/**
 * E2E test DB helpers — direct DB access for test setup & verification.
 */
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  datasources: { db: { url: "file:./dev.db" } },
});

export async function getVerificationCode(contact: string, purpose: string) {
  return prisma.verificationCode.findFirst({
    where: { contact, purpose },
    orderBy: { createdAt: "desc" },
  });
}
