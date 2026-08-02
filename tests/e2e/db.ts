/**
 * E2E test DB helpers — direct DB access for test setup & verification.
 */
import { PrismaClient } from "@prisma/client";
import path from "path";

// 指向 prisma/dev.db —— Next dev server 的 DATABASE_URL="file:./dev.db"
// 实际被 Prisma 解析为 prisma/dev.db（相对 schema 目录），测试进程必须用
// 同一文件。用绝对路径避免 cwd 差异。
export const prisma = new PrismaClient({
  datasources: {
    db: { url: "file:" + path.resolve(__dirname, "../../prisma/dev.db") },
  },
});

export async function getVerificationCode(contact: string, purpose: string) {
  return prisma.verificationCode.findFirst({
    where: { contact, purpose },
    orderBy: { createdAt: "desc" },
  });
}
