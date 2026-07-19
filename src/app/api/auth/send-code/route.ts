import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateCode, normalizeSingaporePhone } from "@/lib/utils";
import { sendVerificationSMS } from "@/lib/sms";
import { sendVerificationCode } from "@/lib/email";

// POST /api/auth/send-code
// Body: { contact: string, purpose: "login"|"register" }
// 自动判断 email 还是 phone
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const purpose = body.purpose as string;
    const raw = typeof body.contact === "string" ? body.contact.trim() : "";

    if (!raw || !purpose) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    if (!["login", "register"].includes(purpose)) {
      return NextResponse.json({ error: "无效的用途" }, { status: 400 });
    }

    // 判断是邮箱还是手机号；邮箱统一小写；手机号规范为 +65…
    const isEmail = raw.includes("@");
    const contact = isEmail
      ? raw.toLowerCase()
      : normalizeSingaporePhone(raw);

    // 检查是否已注册
    if (purpose === "register") {
      const existing = isEmail
        ? await prisma.user.findUnique({ where: { email: contact } })
        : await prisma.user.findUnique({ where: { phone: contact } });

      if (existing) {
        return NextResponse.json({ error: "该账号已注册" }, { status: 409 });
      }
    }

    // 检查是否已登录过 (for login purpose)
    if (purpose === "login") {
      const existing = isEmail
        ? await prisma.user.findUnique({ where: { email: contact } })
        : await prisma.user.findUnique({ where: { phone: contact } });

      if (!existing) {
        return NextResponse.json({ error: "账号不存在" }, { status: 404 });
      }
    }

    // 生成验证码
    const code = generateCode(6);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟

    // 失效旧的验证码
    await prisma.verificationCode.updateMany({
      where: { contact, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });

    // 保存新验证码
    await prisma.verificationCode.create({
      data: { contact, code, purpose, expiresAt },
    });

    // 发送
    let sendResult: { success: boolean; error?: string };
    if (isEmail) {
      sendResult = await sendVerificationCode(contact, code);
    } else {
      sendResult = await sendVerificationSMS(contact, code);
    }

    if (!sendResult.success) {
      console.error(`[send-code] ${isEmail ? "Email" : "SMS"} failed: ${sendResult.error}`);
      return NextResponse.json(
        { error: isEmail ? "邮件发送失败，请稍后重试" : "短信发送失败，请稍后重试" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { message: "验证码已发送" } });
  } catch (error) {
    console.error("send-code error:", error);
    return NextResponse.json({ error: "发送失败" }, { status: 500 });
  }
}
