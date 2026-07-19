import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getLocalUploadRoot } from "@/services/storage";

/**
 * 提供本地上传文件（Logo / 票据等）。
 * 生产 Next standalone 不会自动 serve 运行时写入的 public/；
 * 经 Nginx 反代到本路由：GET /uploads/...
 */
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".heic": "image/heic",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const parts = (await params).path || [];
    if (!parts.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 防 path traversal
    if (parts.some((p) => p === ".." || p.includes("\0"))) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    // 只允许已知前缀
    const top = parts[0];
    if (top !== "brands" && top !== "receipts") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rel = parts.join("/");
    const root = getLocalUploadRoot();
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(path.resolve(root))) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const st = await stat(abs).catch(() => null);
    if (!st || !st.isFile()) {
      // 兼容：旧文件写在 release public/uploads
      const legacy = path.resolve(
        process.cwd(),
        "public",
        "uploads",
        rel
      );
      const st2 = await stat(legacy).catch(() => null);
      if (!st2 || !st2.isFile()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const buf = await readFile(legacy);
      const ext = path.extname(legacy).toLowerCase();
      return new NextResponse(buf, {
        headers: {
          "Content-Type": MIME[ext] || "application/octet-stream",
          "Cache-Control": "public, max-age=604800",
        },
      });
    }

    const buf = await readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=604800",
      },
    });
  } catch (e) {
    console.error("uploads serve error:", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
