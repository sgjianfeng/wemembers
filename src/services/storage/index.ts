// 票据 / 品牌图存储 — S3/R2/OSS 兼容；未配置 S3 时写本地并走 /uploads URL
// 生产请设 UPLOAD_DIR=/var/www/wemembers/data/uploads，并由 Nginx 反代 /uploads/

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const S3_ENDPOINT = process.env.S3_ENDPOINT || "";
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || "";
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || "";
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || "";

/** 本地落盘根目录（持久化，勿只写 release 内 public） */
export function getLocalUploadRoot(): string {
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR;
  // 生产 standalone 默认
  if (process.cwd().includes("/var/www/wemembers")) {
    return "/var/www/wemembers/data/uploads";
  }
  return path.join(process.cwd(), "public", "uploads");
}

// 配置齐全才启用云存储，否则走本地降级
export function isS3Configured(): boolean {
  return Boolean(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);
}

// Lazy init — 避免构建期无 key 报错（照 src/lib/stripe.ts 范式）
let _s3: S3Client | null = null;
function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT || undefined, // R2/OSS 需要自定义 endpoint；AWS 留空
      forcePathStyle: Boolean(S3_ENDPOINT), // 非 AWS 端点用 path-style 更稳
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return _s3;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

function extFor(contentType: string): string {
  return EXT_BY_MIME[contentType.toLowerCase()] || "bin";
}

export interface StoredObject {
  url: string; // 可公开访问的 URL
  key: string; // 对象存储 key / 本地相对路径
}

async function putObject(
  key: string,
  bytes: Buffer,
  contentType: string
): Promise<StoredObject> {
  if (isS3Configured()) {
    await getS3().send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      })
    );
    const base = S3_PUBLIC_URL.replace(/\/$/, "");
    return { url: `${base}/${key}`, key };
  }

  // 本地 / 未配 S3：持久目录（生产 Nginx 映射 /uploads/）
  const diskPath = path.join(getLocalUploadRoot(), key);
  await mkdir(path.dirname(diskPath), { recursive: true });
  await writeFile(diskPath, bytes);
  return { url: `/uploads/${key}`, key };
}

/**
 * 保存一张票据图片，返回可访问 URL。
 * key 形如 receipts/{businessId}/{uuid}.{ext}
 */
export async function putReceiptImage(
  businessId: string,
  bytes: Buffer,
  contentType: string
): Promise<StoredObject> {
  const key = `receipts/${businessId}/${randomUUID()}.${extFor(contentType)}`;
  return putObject(key, bytes, contentType);
}

/**
 * 商家品牌图（Logo 等），通用资产。
 * key 形如 brands/{businessId}/logo-{uuid}.{ext}
 */
export async function putBusinessBrandImage(
  businessId: string,
  bytes: Buffer,
  contentType: string,
  kind: "logo" = "logo"
): Promise<StoredObject> {
  const key = `brands/${businessId}/${kind}-${randomUUID()}.${extFor(contentType)}`;
  return putObject(key, bytes, contentType);
}
